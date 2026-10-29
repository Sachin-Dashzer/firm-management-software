"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import TimeEntry from "@/models/TimeEntry";
import Engagement from "@/models/Engagement";
import User from "@/models/User";
import { startOfISTDay } from "@/lib/dates";
import { checkTime, minutesSince } from "@/lib/team/time";

/**
 * Recording time (P3-28, spec section 9).
 *
 * Audited like every other change (CLAUDE.md rule 2), and that is not
 * ceremony here: a timesheet is evidence about what the firm's work cost,
 * it decides fees at renewal, and "who changed that line" is the question
 * asked the moment a figure looks wrong.
 */

const GONE = { error: "That line no longer exists." };

function touch() {
  revalidatePath("/team/time");
  revalidatePath("/my-day");
}

/** The person's branch, for the scope field on the row. */
async function branchOf(userId) {
  const person = await User.findById(userId).select("branchIds").lean();
  return person?.branchIds?.[0] ?? null;
}

/**
 * May this person put time on this job?
 *
 * Two separate questions, asked separately on purpose. **Whose sheet** is
 * the `timeEntries` scope: your own, your reports', the firm's. **Which
 * job** is the `engagements` scope, because a line on an engagement names
 * a client, and somebody who may not see that client may not learn about
 * it by booking an hour to it either.
 */
async function reachableEngagement(actor, engagementId) {
  const engagement = await Engagement.findById(engagementId)
    .select("clientId branchId assigneeId reviewerId")
    .lean();
  if (!engagement) return null;
  const allowed = can(actor, "view", "engagements", {
    branchId: String(engagement.branchId ?? ""),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });
  return allowed ? engagement : null;
}

/**
 * Whose sheet is being written to, checked against the matrix.
 *
 * Team scope needs the owner's reporting CA, exactly as the to-do actions
 * do. The row itself does not carry it, because a person's senior can
 * change and the line should not remember an old one.
 */
async function mayWriteFor(actor, userId) {
  if (String(userId) === actor.id) {
    return can(actor, "edit", "timeEntries", { userId: actor.id });
  }
  const owner = await User.findById(userId)
    .select("reportingTo branchIds active")
    .lean();
  if (!owner || owner.active === false) return false;
  return can(actor, "edit", "timeEntries", {
    userId: String(userId),
    branchId: String(owner.branchIds?.[0] ?? ""),
    reportingTo: owner.reportingTo ? String(owner.reportingTo) : "",
  });
}

/** The line this person is in the middle of, if any. */
export async function runningTimer() {
  const actor = await requireUser();
  if (!can(actor, "edit", "timeEntries", { userId: actor.id })) return null;

  await connectDB();
  const row = await TimeEntry.findOne({
    userId: actor.id,
    startedAt: { $ne: null },
  }).lean();
  if (!row) return null;

  return {
    id: String(row._id),
    startedAt: new Date(row.startedAt).toISOString(),
    engagementId: row.engagementId ? String(row.engagementId) : "",
    what: row.what ?? "",
  };
}

/**
 * Start the clock.
 *
 * A second start while one is running stops the first rather than refusing
 * it: somebody who has moved on to another job has moved on, and a message
 * telling them to go and stop the old timer first is how a timer stops
 * being used at all.
 */
export async function startTimer(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "timeEntries", { userId: actor.id });

  const engagementId = String(formData.get("engagementId") ?? "").trim();
  const what = String(formData.get("what") ?? "").trim();
  if (!engagementId && !what) {
    return { error: "Pick a job, or say what you are working on." };
  }

  await connectDB();

  let engagement = null;
  if (engagementId) {
    engagement = await reachableEngagement(actor, engagementId);
    if (!engagement) return { error: "That job is not one you can see." };
  }

  const branchId = engagement?.branchId ?? (await branchOf(actor.id));
  const now = new Date();

  await audited(actor, async (session) => {
    const open = await TimeEntry.find({
      userId: actor.id,
      startedAt: { $ne: null },
    }).session(session);

    for (const row of open) {
      row.minutes = minutesSince(row.startedAt, now);
      row.startedAt = null;
      row.updatedBy = actor.id;
      /* A timer stopped under a minute recorded nothing, so the line would
         be a row of zeros nobody wants on a sheet. */
      if (row.minutes === 0) await row.softDelete(actor.id, { session });
      else await row.save({ session });
    }

    await TimeEntry.create(
      [
        {
          userId: actor.id,
          branchId,
          on: startOfISTDay(now),
          minutes: 0,
          startedAt: now,
          engagementId: engagementId || null,
          clientId: engagement?.clientId ?? null,
          what,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session, ordered: true },
    );
  });

  touch();
  return { ok: "Clock running." };
}

/** Stop it, and keep what it counted. */
export async function stopTimer() {
  const actor = await requireUser();
  assertCan(actor, "edit", "timeEntries", { userId: actor.id });

  await connectDB();
  const row = await TimeEntry.findOne({
    userId: actor.id,
    startedAt: { $ne: null },
  });
  if (!row) return { error: "No clock is running." };

  const minutes = minutesSince(row.startedAt);

  if (minutes === 0) {
    await audited(actor, (session) => row.softDelete(actor.id, { session }));
    touch();
    return { ok: "Under a minute, so nothing was recorded." };
  }

  await audited(actor, async (session) => {
    row.minutes = minutes;
    row.startedAt = null;
    row.updatedBy = actor.id;
    await row.save({ session });
  });

  touch();
  return { ok: `${minutes} minutes recorded.` };
}

/** Throw away what the clock counted. */
export async function cancelTimer() {
  const actor = await requireUser();
  assertCan(actor, "edit", "timeEntries", { userId: actor.id });

  await connectDB();
  const row = await TimeEntry.findOne({
    userId: actor.id,
    startedAt: { $ne: null },
  });
  if (!row) return { error: "No clock is running." };

  await audited(actor, (session) => row.softDelete(actor.id, { session }));
  touch();
  return { ok: "Clock stopped, nothing recorded." };
}

/** A line typed in rather than timed, which will be most of them. */
export async function addTime(_prev, formData) {
  const actor = await requireUser();

  const forUser = String(formData.get("userId") ?? "").trim() || actor.id;
  if (!(await mayWriteFor(actor, forUser))) {
    return { error: "That is not a timesheet you can write on." };
  }

  const read = checkTime({
    on: String(formData.get("on") ?? ""),
    hours: String(formData.get("hours") ?? ""),
    engagementId: String(formData.get("engagementId") ?? ""),
    what: String(formData.get("what") ?? ""),
  });
  if (!read.ok) return { error: read.error };

  await connectDB();

  let engagement = null;
  if (read.engagementId) {
    engagement = await reachableEngagement(actor, read.engagementId);
    if (!engagement) return { error: "That job is not one you can see." };
  }

  const branchId = engagement?.branchId ?? (await branchOf(forUser));

  await audited(actor, async (session) => {
    await TimeEntry.create(
      [
        {
          userId: forUser,
          branchId,
          on: read.on,
          minutes: read.minutes,
          engagementId: read.engagementId || null,
          clientId: engagement?.clientId ?? null,
          what: read.what,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session, ordered: true },
    );
  });

  touch();
  return { ok: "On the sheet." };
}

/**
 * Take a line off.
 *
 * Soft delete (CLAUDE.md rule 3). A removed hour is exactly the kind of
 * thing a fee argument turns on later, so it stays readable in the log.
 */
export async function removeTime(id) {
  const actor = await requireUser();

  await connectDB();
  const row = await TimeEntry.findById(String(id ?? ""));
  if (!row) return GONE;
  if (!(await mayWriteFor(actor, row.userId))) {
    return { error: "That is not a timesheet you can write on." };
  }

  await audited(actor, async (session) => {
    row.updatedBy = actor.id;
    await row.softDelete(actor.id, { session });
  });

  touch();
  return { ok: "Taken off." };
}
