"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Leave from "@/models/Leave";
import User from "@/models/User";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { LEAVE_KINDS, checkLeave, statusOf, leaveDays } from "@/lib/team/leave";
import { formatISTDate, istDayFromInput } from "@/lib/dates";
import { reassign } from "../../engagements/actions";

/**
 * The leave cycle (owner decision, 01-11-2026).
 *
 * **What changed.** Until now a partner recorded an absence and recording it
 * *was* the approval — there was no asking. The owner asked for the cycle the
 * firm runs: the person applies with a reason, a CA or a Partner approves or
 * declines, and the cover is named at the moment of approval, because "who
 * holds this work" is the decision being asked for rather than something the
 * applicant can settle.
 *
 * Four rules, all enforced here and not only on screen, because a server
 * action is reachable over HTTP whether or not a button for it is rendered:
 *
 *  1. **You apply for yourself.** An applicant cannot file leave in somebody
 *     else's name; a senior marking leave for somebody does it through
 *     `markLeave`, which is audited as their act.
 *  2. **Nobody decides their own application** — except a Partner, who has
 *     nobody above them. With one partner in the firm, the alternative is a
 *     partner whose leave can never be approved.
 *  3. **Approving requires a cover**, and a cover who is not themselves
 *     away. `checkLeave` holds both, and the dates are checked again at the
 *     moment of approval, not only when it was asked for: a fortnight can
 *     pass between the two and somebody else's leave can land in the middle.
 *  4. **Declining requires a reason.** "No" with nothing after it is the
 *     answer that comes straight back as a question.
 */

function touched(userId) {
  revalidatePath("/team/leave");
  revalidatePath("/me");
  if (userId) revalidatePath(`/team/${userId}`);
}

/** Every live leave for either person — all `checkLeave` reads. */
async function livesFor(ids, around) {
  return Leave.find({
    userId: { $in: ids.filter(Boolean) },
    to: { $gte: new Date(around.getTime() - 366 * 86_400_000) },
    // a declined application is not an absence, so it clashes with nothing
    status: { $ne: "Declined" },
  }).lean();
}

/**
 * Read the two dates off a form.
 * @returns {{ok: true, from: Date, to: Date}|{ok: false, error: string}}
 */
function readDates(formData) {
  const from = istDayFromInput(formData.get("from"));
  const to = istDayFromInput(formData.get("to"));
  if (from === false || to === false) {
    return { ok: false, error: "Those are not dates." };
  }
  if (!from || !to) return { ok: false, error: "Both dates are needed." };
  return { ok: true, from, to };
}

/**
 * Apply for your own leave.
 *
 * Open to every role, because everybody takes leave. A senior applying for
 * themselves lands on Pending like anybody else — rule 2 above — and a
 * Partner's own application is approved the moment they make it, because
 * there is nobody to ask.
 */
export async function applyForLeave(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "leave", { userId: actor.id });

  const dates = readDates(formData);
  if (!dates.ok) return { error: dates.error };

  const kind = String(formData.get("kind") ?? "Leave");
  if (!LEAVE_KINDS.includes(kind)) return { error: "Unknown kind of leave." };

  const reason = String(formData.get("note") ?? "").trim();
  if (reason.length < 3) {
    return {
      error:
        "Say why you are asking. A row of dates with no reason is the one that sits unanswered.",
    };
  }

  await connectDB();

  /**
   * A partner has nobody to ask, so their own application is the decision.
   * Anybody else's waits — including a CA's, which a Partner decides.
   */
  const ownApproval = actor.role === "partner";

  const wantedCover = String(formData.get("coverId") ?? "");
  const check = checkLeave({
    userId: actor.id,
    coverId: wantedCover,
    from: dates.from,
    to: dates.to,
    leaves: await livesFor([actor.id, wantedCover], dates.from),
    person: { name: actor.name },
    // an application names a cover only if the applicant happens to know
    // who it should be; approving is where one becomes compulsory
    requireCover: ownApproval,
  });
  if (!check.ok) return { error: check.error };

  await audited(actor, async (session) => {
    const [row] = await Leave.create(
      [
        {
          userId: actor.id,
          from: dates.from,
          to: dates.to,
          kind,
          status: ownApproval ? "Approved" : "Pending",
          coverId: wantedCover || null,
          note: reason,
          approvedBy: ownApproval ? actor.id : null,
          approvedByName: ownApproval ? actor.name : "",
          approvedAt: ownApproval ? new Date() : null,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session, ordered: true },
    );

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "Leave",
        entityId: row._id,
        note: `${actor.name} applied for ${kind.toLowerCase()} from ${formatISTDate(dates.from)} to ${formatISTDate(dates.to)} — ${reason}`,
      },
      session,
    );
  });

  touched(actor.id);
  return {
    ok: ownApproval
      ? `Recorded, ${formatISTDate(dates.from)} to ${formatISTDate(dates.to)}. You are a partner, so there is nobody to ask.`
      : `Applied for ${formatISTDate(dates.from)} to ${formatISTDate(dates.to)}. A CA or a partner will decide it.`,
  };
}

/**
 * Mark somebody's leave, approved as it is recorded.
 *
 * For the leave that arrives as a phone call at eight in the morning. A CA
 * or a Partner only, and it is their act on the record — the cover is
 * required here because there is no later moment to name one.
 */
export async function markLeave(_prev, formData) {
  const actor = await requireUser();

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Whose leave is it?" };

  await connectDB();
  const person = await User.findById(userId)
    .select("name active branchIds")
    .lean();
  if (!person) return { error: "That person is not on the team." };
  if (person.active === false) {
    return { error: `${person.name}'s account is switched off.` };
  }
  assertDecider(actor, person);

  const dates = readDates(formData);
  if (!dates.ok) return { error: dates.error };

  const kind = String(formData.get("kind") ?? "Leave");
  if (!LEAVE_KINDS.includes(kind)) return { error: "Unknown kind of leave." };

  const coverId = String(formData.get("coverId") ?? "");
  const cover = coverId
    ? await User.findById(coverId).select("name active role").lean()
    : null;
  if (!cover) {
    return {
      error:
        "Name who holds their work. An absence with nobody named is the state the firm is already in, and it is the one that loses a return.",
    };
  }
  if (cover.active === false) {
    return { error: `${cover.name}'s account is switched off.` };
  }

  const check = checkLeave({
    userId,
    coverId,
    from: dates.from,
    to: dates.to,
    leaves: await livesFor([userId, coverId], dates.from),
    person,
    cover,
  });
  if (!check.ok) return { error: check.error };

  const note = String(formData.get("note") ?? "").trim();

  await audited(actor, async (session) => {
    const [row] = await Leave.create(
      [
        {
          userId,
          from: dates.from,
          to: dates.to,
          kind,
          status: "Approved",
          coverId: cover._id,
          note,
          approvedBy: actor.id,
          approvedByName: actor.name,
          approvedAt: new Date(),
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session, ordered: true },
    );

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "Leave",
        entityId: row._id,
        note: `${person.name} away ${formatISTDate(dates.from)} to ${formatISTDate(dates.to)} (${kind.toLowerCase()}), covered by ${cover.name} — marked by ${actor.name}`,
      },
      session,
    );
  });

  touched(userId);
  return {
    ok: `Recorded. ${cover.name} holds ${person.name.split(" ")[0]}'s Issues and reminders from ${formatISTDate(dates.from)} to ${formatISTDate(dates.to)}.`,
  };
}

/**
 * Approve or decline an application.
 *
 * Approving may also move the work: the ids in `reassignIds` are handed to
 * the cover through `reassign`, which is the same action the engagement
 * screen and the take-over wizard use — so the tier rules and the audit
 * entry for a reassignment are identical however it was triggered. A piece
 * of work the rules refuse is reported and the rest still move.
 */
export async function decideLeave(leaveId, formData) {
  const actor = await requireUser();

  await connectDB();
  const leave = await Leave.findById(leaveId);
  if (!leave) return { error: "That application is no longer there." };
  if (statusOf(leave) !== "Pending") {
    return { error: `That one is already ${statusOf(leave).toLowerCase()}.` };
  }

  const person = await User.findById(leave.userId)
    .select("name active branchIds")
    .lean();
  if (!person) return { error: "That person is no longer on the team." };
  assertDecider(actor, person);

  /** Rule 2: nobody decides their own, and a partner has nobody to ask. */
  if (String(leave.userId) === actor.id && actor.role !== "partner") {
    return {
      error:
        "You cannot decide your own application. A partner decides a CA's leave.",
    };
  }

  const decision = String(formData.get("decision") ?? "");
  if (!["approve", "decline"].includes(decision)) {
    return { error: "Approve it or decline it." };
  }
  const decisionNote = String(formData.get("decisionNote") ?? "").trim();

  if (decision === "decline") {
    if (decisionNote.length < 3) {
      return { error: "Say why it is being declined." };
    }

    await audited(actor, async (session) => {
      leave.status = "Declined";
      leave.approvedBy = actor.id;
      leave.approvedByName = actor.name;
      leave.approvedAt = new Date();
      leave.decisionNote = decisionNote;
      leave.updatedBy = actor.id;
      await leave.save({ session });

      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "Leave",
          entityId: leave._id,
          diff: { status: ["Pending", "Declined"] },
          note: `${person.name}'s leave of ${formatISTDate(leave.from)} declined by ${actor.name} — ${decisionNote}`,
        },
        session,
      );
    });

    touched(String(leave.userId));
    return { ok: `Declined. ${person.name.split(" ")[0]} will be told why.` };
  }

  // --- approving ---------------------------------------------------------

  const coverId = String(formData.get("coverId") ?? "");
  const cover = coverId
    ? await User.findById(coverId).select("name active role").lean()
    : null;
  if (!cover) {
    return {
      error: "Approving means naming who holds their work while they are away.",
    };
  }
  if (cover.active === false) {
    return { error: `${cover.name}'s account is switched off.` };
  }
  if (String(cover._id) === String(leave.userId)) {
    return {
      error: "Somebody cannot cover for themselves while they are away.",
    };
  }

  /**
   * The dates are checked again now, not only when it was asked for: an
   * application can sit for a fortnight, and somebody else's approved leave
   * can land in the middle of it.
   */
  const check = checkLeave({
    userId: String(leave.userId),
    coverId,
    from: leave.from,
    to: leave.to,
    leaves: await livesFor([String(leave.userId), coverId], leave.from),
    ignoreId: String(leave._id),
    person,
    cover,
  });
  if (!check.ok) return { error: check.error };

  await audited(actor, async (session) => {
    leave.status = "Approved";
    leave.coverId = cover._id;
    leave.approvedBy = actor.id;
    leave.approvedByName = actor.name;
    leave.approvedAt = new Date();
    leave.decisionNote = decisionNote;
    leave.updatedBy = actor.id;
    await leave.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Leave",
        entityId: leave._id,
        diff: { status: ["Pending", "Approved"] },
        note: `${person.name} away ${formatISTDate(leave.from)} to ${formatISTDate(leave.to)} (${leaveDays(leave)} days), covered by ${cover.name} — approved by ${actor.name}`,
      },
      session,
    );
  });

  /**
   * The work, after the leave itself. Deliberately outside that transaction:
   * `reassign` opens its own, one per engagement, and an engagement the
   * rules refuse must not undo an approval that is already correct. The
   * answer says what moved and what did not.
   */
  const wanted = formData
    .getAll("reassignIds")
    .map(String)
    .filter(Boolean)
    .slice(0, 50);
  const moved = [];
  const refused = [];
  for (const id of wanted) {
    const result = await reassign(id, { assigneeId: String(cover._id) });
    if (result?.error) refused.push(result.error);
    else moved.push(id);
  }

  touched(String(leave.userId));

  const first = person.name.split(" ")[0];
  let ok = `Approved. ${cover.name} holds ${first}'s Issues and reminders from ${formatISTDate(leave.from)} to ${formatISTDate(leave.to)}.`;
  if (moved.length) {
    ok += ` ${moved.length} ${moved.length === 1 ? "job was" : "jobs were"} handed to them.`;
  }
  if (refused.length) {
    ok += ` ${refused.length} could not be: ${refused[0]}`;
  }
  return { ok };
}

/**
 * Withdraw one.
 *
 * A soft delete like everything else (CLAUDE.md rule 3): a cover who held
 * somebody's work for three days of a cancelled fortnight did hold it, and
 * the mail that went to them is in the message log either way.
 *
 * The applicant may withdraw their own while it is still pending. Once it is
 * approved it is the firm's arrangement and not only theirs, so withdrawing
 * it is a CA's or a Partner's.
 */
export async function withdrawLeave(leaveId, reason) {
  const actor = await requireUser();

  const why = String(reason ?? "").trim();
  if (why.length < 3) return { error: "Say why it is being withdrawn." };

  await connectDB();
  const leave = await Leave.findById(leaveId);
  if (!leave) return { error: "That leave is already gone." };

  const person = await User.findById(leave.userId)
    .select("name branchIds")
    .lean();

  const mine = String(leave.userId) === actor.id;
  const pending = statusOf(leave) === "Pending";

  if (mine && pending) {
    assertCan(actor, "edit", "leave", { userId: actor.id });
  } else {
    assertDecider(actor, person ?? {});
  }

  await audited(actor, async (session) => {
    leave.note = [leave.note, `Withdrawn: ${why}`].filter(Boolean).join(" · ");
    leave.updatedBy = actor.id;
    await leave.softDelete(actor.id, { session });

    await recordAudit(
      {
        action: ACTIONS.softDelete,
        entityType: "Leave",
        entityId: leave._id,
        note: `${person?.name ?? "Somebody"}'s ${statusOf(leave).toLowerCase()} leave of ${formatISTDate(leave.from)} withdrawn by ${actor.name} — ${why}`,
      },
      session,
    );
  });

  touched(String(leave.userId));
  return { ok: "Withdrawn." };
}

/**
 * May this person decide this person's leave?
 *
 * A multi-branch colleague is decided by a senior of **any** of their
 * branches, which is the same test the team record itself uses: one office
 * of theirs being yours is enough to be their senior.
 *
 * @param {{id: string, role: string, branchIds?: string[]}} actor
 * @param {{branchIds?: any[]}} person
 */
function assertDecider(actor, person) {
  const branches = (person.branchIds ?? []).map(String);
  const allowed = branches.length
    ? branches.some((branchId) =>
        can(actor, "approve", "leaveApprove", { branchId }),
      )
    : can(actor, "approve", "leaveApprove", {});

  if (!allowed) {
    const err = new Error("Not allowed");
    err.code = "FORBIDDEN";
    err.detail = { role: actor?.role, action: "approve", area: "leaveApprove" };
    throw err;
  }
}
