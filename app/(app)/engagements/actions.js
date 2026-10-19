"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan, can, seesOnlyOwnRecords } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import {
  engagementAssigned,
  engagementForReview,
  engagementReworked,
} from "@/lib/mailer/events";
import { toPaise } from "@/lib/money";
import Engagement from "@/models/Engagement";
import ServiceTemplate from "@/models/ServiceTemplate";
import ClientService from "@/models/ClientService";
import Client from "@/models/Client";
import ClientAccess from "@/models/ClientAccess";
import Branch from "@/models/Branch";
import Comment from "@/models/Comment";
import User from "@/models/User";
import { periodFor, parsePeriod } from "@/lib/engagements/period";
import { buildEngagement } from "@/lib/engagements/create";
import { checkAssignment } from "@/lib/engagements/assign";
import { nextEngagementCode } from "@/lib/engagements/code";
import {
  checkStatusChange,
  canEditWork,
  isRework,
  PRIORITIES,
} from "@/lib/engagements/status";

/**
 * Everything that changes an engagement (spec section 5).
 *
 * The pattern is the same throughout: ask `lib/permissions` whether this
 * person may touch this record, ask `lib/engagements/status` whether the move
 * itself is legal, then write inside `audited()` so the change and its log
 * share one transaction. The screens ask the same two questions to decide
 * what to show, but that is convenience — this is the enforcement.
 */

/**
 * Load an engagement and check the actor is allowed to work on it. Scope is
 * applied against the real record, so a URL typed by hand is no way in.
 */
async function loadForWork(actor, id, action = "edit") {
  await connectDB();
  const engagement = await Engagement.findById(id);
  if (!engagement) {
    const err = new Error("That engagement no longer exists.");
    err.code = "NOT_FOUND";
    throw err;
  }
  assertCan(actor, action, "engagementsWork", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });
  return engagement;
}

/** Everyone a template allows, with the fields the assignment rules need. */
async function loadPeople(ids) {
  const found = await User.find({ _id: { $in: ids.filter(Boolean) } })
    .select("name role active")
    .lean();
  return new Map(
    found.map((u) => [
      String(u._id),
      { id: String(u._id), name: u.name, role: u.role, active: u.active },
    ]),
  );
}

// --- creating ---------------------------------------------------------------

const createInput = z.object({
  clientId: z.string().min(1, "Choose a client"),
  serviceTemplateId: z.string().min(1, "Choose a service"),
  period: z.string().min(1, "Choose a period"),
  assigneeId: z.string().optional(),
  reviewerId: z.string().optional(),
  priority: z.enum(PRIORITIES).default("Normal"),
  fee: z.string().trim().default(""),
});

/** Create one engagement from a service template (spec section 5). */
export async function createEngagement(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "engagementsCreate");

  const parsed = createInput.safeParse({
    clientId: formData.get("clientId") ?? "",
    serviceTemplateId: formData.get("serviceTemplateId") ?? "",
    period: formData.get("period") ?? "",
    assigneeId: formData.get("assigneeId") || undefined,
    reviewerId: formData.get("reviewerId") || undefined,
    priority: formData.get("priority") || "Normal",
    fee: formData.get("fee") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  await connectDB();
  const [client, template] = await Promise.all([
    Client.findById(data.clientId).lean(),
    ServiceTemplate.findById(data.serviceTemplateId).lean(),
  ]);
  if (!client) return { error: "That client no longer exists." };
  if (!template) return { error: "That service no longer exists." };
  if (template.active === false) {
    return { error: `${template.name} is archived. Restore it first.` };
  }

  // a CA can only create work for their own branches
  assertCan(actor, "edit", "engagementsCreate", {
    branchId: String(client.branchId),
  });

  let period;
  try {
    period = parsePeriod(data.period);
  } catch {
    return { error: "That is not a period we recognise." };
  }

  const people = await loadPeople([data.assigneeId, data.reviewerId]);
  const assignee = data.assigneeId ? people.get(data.assigneeId) : null;
  const reviewer = data.reviewerId ? people.get(data.reviewerId) : null;
  if (data.assigneeId && !assignee) return { error: "Unknown assignee." };
  if (data.reviewerId && !reviewer) return { error: "Unknown reviewer." };
  if (assignee?.active === false || reviewer?.active === false) {
    return { error: "That person's account is deactivated." };
  }

  const allowed = checkAssignment(template, assignee, reviewer);
  if (!allowed.ok) return { error: allowed.error };

  const already = await Engagement.findOne({
    clientId: client._id,
    serviceTemplateId: template._id,
    period: period.code,
  });
  if (already) {
    return {
      error: `${template.name} for ${period.label} already exists (${already.code}).`,
    };
  }

  let feePaise;
  try {
    feePaise = data.fee ? toPaise(data.fee) : undefined;
  } catch {
    return { error: "That fee is not an amount." };
  }

  let created;
  try {
    created = await audited(actor, async (session) => {
      const branch = await Branch.findById(client.branchId)
        .session(session)
        .lean();

      const fields = buildEngagement({
        template,
        client,
        period,
        assigneeId: assignee?.id ?? null,
        reviewerId: reviewer?.id ?? null,
        feePaise,
        priority: data.priority,
      });

      const code = await nextEngagementCode(
        branch?.code ?? "NOI",
        template.code,
        period.code,
        session,
      );

      const [doc] = await Engagement.create(
        [
          {
            ...fields,
            code,
            statusHistory: [
              {
                to: "Scheduled",
                byId: actor.id,
                byName: actor.name,
                reason: "created",
              },
            ],
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
      if (doc.assigneeId) await engagementAssigned(doc, actor, session);
      return doc;
    });
  } catch (err) {
    if (err.code === 11000) {
      return { error: "That engagement was just created by someone else." };
    }
    return { error: err.message };
  }

  revalidatePath("/engagements");
  revalidatePath(`/clients/${data.clientId}`);
  return { ok: `${created.code} created.`, id: String(created._id) };
}

// --- the pipeline -----------------------------------------------------------

/**
 * Move an engagement along the pipeline. The reason is mandatory for On
 * hold, Cancelled and sending work back for rework.
 */
export async function changeStatus(id, to, reason = "") {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);

  const check = checkStatusChange(
    actor,
    {
      status: engagement.status,
      assigneeId: String(engagement.assigneeId ?? ""),
      reviewerId: String(engagement.reviewerId ?? ""),
    },
    to,
    { reason },
  );
  if (!check.ok) return { error: check.error };

  // completing locks the engagement, so the last checks happen here
  if (to === "Completed") {
    const missing = engagement.checklist.filter(
      (item) => item.mandatory && item.status !== "Verified",
    );
    if (missing.length > 0) {
      return {
        error: `${missing.length} mandatory checklist ${missing.length === 1 ? "item is" : "items are"} not verified yet.`,
      };
    }
    const unticked = engagement.reviewChecklist.filter((i) => !i.checked);
    if (unticked.length > 0) {
      return { error: "Tick every review point before completing." };
    }
    if (engagement.templateSnapshot?.udinRequired && !engagement.udin) {
      return { error: "This service needs a UDIN before it can be completed." };
    }
  }

  const from = engagement.status;
  const rework = isRework(from, to);

  await audited(actor, async (session) => {
    engagement.status = to;
    engagement.updatedBy = actor.id;
    if (to === "In progress" && !engagement.startedAt) {
      engagement.startedAt = new Date();
    }
    if (rework) engagement.reworkCount += 1;
    if (to === "Completed") {
      engagement.completedAt = new Date();
      engagement.completedBy = actor.id;
    }
    engagement.statusHistory.push({
      from,
      to,
      at: new Date(),
      byId: actor.id,
      byName: actor.name,
      reason: String(reason ?? "").trim(),
    });
    await engagement.save({ session });

    // the status change is its own action in the log, not a field edit
    await recordAudit(
      {
        action: ACTIONS.statusChange,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        diff: { status: [from, to] },
        note: String(reason ?? "").trim(),
      },
      session,
    );

    // a rejection must leave the assignee something to read
    if (rework && reason) {
      await Comment.create(
        [
          {
            entityType: "Engagement",
            entityId: engagement._id,
            clientId: engagement.clientId,
            kind: "Note",
            body: `Returned for rework: ${reason}`,
            internal: true,
            createdBy: actor.id,
            createdByName: actor.name,
          },
        ],
        { session },
      );
    }

    // tell whoever the move concerns, in this same transaction: nobody is
    // told about a change that is then rolled back
    if (rework) {
      await engagementReworked(engagement, actor, reason, session);
    } else if (to === "Under review") {
      await engagementForReview(engagement, actor, session);
    }
  });

  revalidatePath(`/engagements/${id}`);
  revalidatePath("/engagements");
  return { ok: rework ? "Sent back for rework." : `Moved to ${to}.` };
}

/** Reassign the work or the review; both sides are logged. */
export async function reassign(id, { assigneeId, reviewerId }) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  // reassigning is a CA's call, not the assignee's
  assertCan(actor, "edit", "engagementsCreate", {
    branchId: String(engagement.branchId),
  });

  // an omitted side is left as it is: a bulk reassign that names only the
  // assignee must not quietly strip every reviewer
  const keepAssignee = assigneeId === undefined;
  const keepReviewer = reviewerId === undefined;
  const wantedAssignee = keepAssignee
    ? String(engagement.assigneeId ?? "")
    : assigneeId;
  const wantedReviewer = keepReviewer
    ? String(engagement.reviewerId ?? "")
    : reviewerId;

  const people = await loadPeople([wantedAssignee, wantedReviewer]);
  const assignee = wantedAssignee ? people.get(String(wantedAssignee)) : null;
  const reviewer = wantedReviewer ? people.get(String(wantedReviewer)) : null;
  if (wantedAssignee && !assignee) return { error: "Unknown assignee." };
  if (wantedReviewer && !reviewer) return { error: "Unknown reviewer." };
  if (assignee?.active === false || reviewer?.active === false) {
    return { error: "That person's account is deactivated." };
  }

  const allowed = checkAssignment(
    engagement.templateSnapshot ?? {},
    assignee,
    reviewer,
  );
  if (!allowed.ok) return { error: allowed.error };

  const before = {
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  };

  await audited(actor, async (session) => {
    engagement.assigneeId = assignee?.id ?? null;
    engagement.reviewerId = reviewer?.id ?? null;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });

    await recordAudit(
      {
        action: ACTIONS.reassign,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        diff: {
          assigneeId: [before.assigneeId, assignee?.id ?? ""],
          reviewerId: [before.reviewerId, reviewer?.id ?? ""],
        },
      },
      session,
    );

    // only tell someone if the work is now theirs and was not before
    if (assignee?.id && assignee.id !== before.assigneeId) {
      await engagementAssigned(engagement, actor, session);
    }
    if (
      reviewer?.id &&
      reviewer.id !== before.reviewerId &&
      engagement.status === "Under review"
    ) {
      await engagementForReview(engagement, actor, session);
    }
  });

  revalidatePath(`/engagements/${id}`);
  revalidatePath("/engagements");
  return { ok: "Reassigned.", hint: await accessHint(engagement, assignee) };
}

/**
 * A line of explanation when work is handed to somebody who reaches clients
 * one at a time (owner decision D3).
 *
 * The point is that assigning work is now also an access decision, and a
 * small one: it opens this engagement and its documents, and nothing else of
 * the client. A CA who wanted to give more has somewhere to go. Not a dialog
 * — it is a note on a successful action, not a question.
 */
async function accessHint(engagement, assignee) {
  if (!assignee?.id || !seesOnlyOwnRecords(assignee, "clients")) return null;

  const existing = await ClientAccess.findOne({
    userId: assignee.id,
    clientId: engagement.clientId,
    active: true,
  })
    .select("_id")
    .lean();
  if (existing) return null;

  const first = assignee.name?.split(" ")[0] ?? assignee.name;
  return {
    text: `${first} will see this engagement and its documents only. Give wider access?`,
    href: `/clients/${engagement.clientId}?tab=access`,
  };
}

// --- doing the work ---------------------------------------------------------

/** Tick a sub-task off, or put it back. */
export async function setTaskDone(id, taskId, done) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  if (!canEditWork(actor, engagement)) {
    return { error: `Nothing can be edited while it is ${engagement.status}.` };
  }

  const task = engagement.tasks.id(taskId);
  if (!task) return { error: "That task is gone." };

  await audited(actor, async (session) => {
    task.done = Boolean(done);
    task.doneAt = done ? new Date() : null;
    task.doneBy = done ? actor.id : null;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
  });

  revalidatePath(`/engagements/${id}`);
  return { ok: done ? `${task.name} done.` : `${task.name} reopened.` };
}

/** Move a checklist item along Pending → Requested → Received → Verified. */
export async function setChecklistStatus(id, itemId, status) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  if (!canEditWork(actor, engagement)) {
    return { error: `Nothing can be edited while it is ${engagement.status}.` };
  }

  const item = engagement.checklist.id(itemId);
  if (!item) return { error: "That checklist item is gone." };
  if (!["Pending", "Requested", "Received", "Verified"].includes(status)) {
    return { error: "Unknown checklist state." };
  }

  await audited(actor, async (session) => {
    item.status = status;
    if (status === "Requested") item.requestedAt = new Date();
    if (status === "Received") item.receivedAt = new Date();
    item.verifiedBy = status === "Verified" ? actor.id : null;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
  });

  revalidatePath(`/engagements/${id}`);
  return { ok: `${item.name}: ${status.toLowerCase()}.` };
}

/** The reviewer's own checklist (spec section 5). */
export async function setReviewItem(id, itemId, checked) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);

  const isReviewer =
    String(engagement.reviewerId ?? "") === actor.id ||
    actor.role === "partner";
  if (!isReviewer) return { error: "Only the reviewer ticks these." };

  const item = engagement.reviewChecklist.id(itemId);
  if (!item) return { error: "That review point is gone." };

  await audited(actor, async (session) => {
    item.checked = Boolean(checked);
    item.checkedAt = checked ? new Date() : null;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
  });

  revalidatePath(`/engagements/${id}`);
  return { ok: "Noted." };
}

/** Acknowledgement number and UDIN, captured when the work is filed. */
export async function saveFiling(id, formData) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  if (engagement.status === "Completed") {
    return { error: "A completed engagement is locked." };
  }

  const ackNo = String(formData.get("ackNo") ?? "").trim();
  const udin = String(formData.get("udin") ?? "")
    .trim()
    .toUpperCase();
  // UDIN is 18 characters: the ICAI format, checked for shape only
  if (udin && !/^[0-9A-Z]{18}$/.test(udin)) {
    return { error: "A UDIN is 18 letters and digits." };
  }

  await audited(actor, async (session) => {
    engagement.ackNo = ackNo;
    engagement.udin = udin;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
  });

  revalidatePath(`/engagements/${id}`);
  return { ok: "Filing details saved." };
}

/** Priority and tags: small edits that do not move the pipeline. */
export async function setPriority(id, priority) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  if (!PRIORITIES.includes(priority)) return { error: "Unknown priority." };

  await audited(actor, async (session) => {
    engagement.priority = priority;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
  });

  revalidatePath(`/engagements/${id}`);
  return { ok: `Priority set to ${priority}.` };
}

/** Move the internal due date (the statutory one is Step 7's to set). */
export async function setInternalDue(id, date) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  assertCan(actor, "edit", "engagementsCreate", {
    branchId: String(engagement.branchId),
  });

  const due = date ? new Date(`${date}T00:00:00+05:30`) : null;
  if (date && Number.isNaN(due?.valueOf())) return { error: "Not a date." };

  await audited(actor, async (session) => {
    engagement.internalDue = due;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
  });

  revalidatePath(`/engagements/${id}`);
  return {
    ok: due ? "Internal due date moved." : "Internal due date cleared.",
  };
}

// --- talking about the work -------------------------------------------------

/** A comment on the thread, with @mentions (spec section 5). */
export async function addEngagementComment(id, formData) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id, "view");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write something first." };

  // @mentions are matched against the team by name, case-insensitively
  const names = [...body.matchAll(/@([\w.]+)/g)].map((m) => m[1].toLowerCase());
  const mentions = names.length
    ? await User.find({ active: true }).select("name").lean()
    : [];
  const mentioned = mentions
    .filter((u) =>
      names.some((n) => u.name.toLowerCase().replace(/\s+/g, "").startsWith(n)),
    )
    .map((u) => u._id);

  await audited(actor, (session) =>
    Comment.create(
      [
        {
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          kind: "Note",
          body,
          mentions: mentioned,
          internal: formData.get("internal") !== "off",
          createdBy: actor.id,
          createdByName: actor.name,
        },
      ],
      { session },
    ),
  );

  // the mentioned people are notified in Step 9
  revalidatePath(`/engagements/${id}`);
  return { ok: "Comment added." };
}

// --- the client's service subscriptions (spec section 5 defaults) -----------

/** Sign a client up for a service, with its fee and usual people. */
export async function saveClientService(clientId, formData) {
  const actor = await requireUser();
  await connectDB();
  const client = await Client.findById(clientId).lean();
  if (!client) return { error: "That client no longer exists." };
  assertCan(actor, "edit", "clients", { branchId: String(client.branchId) });

  const serviceTemplateId = String(formData.get("serviceTemplateId") ?? "");
  if (!serviceTemplateId) return { error: "Choose a service." };

  const template = await ServiceTemplate.findById(serviceTemplateId).lean();
  if (!template) return { error: "That service no longer exists." };

  let feePaise = 0;
  try {
    feePaise = toPaise(String(formData.get("fee") ?? "0") || "0");
  } catch {
    return { error: "That fee is not an amount." };
  }

  const assigneeId = formData.get("defaultAssigneeId") || null;
  const reviewerId = formData.get("defaultReviewerId") || null;
  const people = await loadPeople([assigneeId, reviewerId]);
  const allowed = checkAssignment(
    template,
    assigneeId ? people.get(String(assigneeId)) : null,
    reviewerId ? people.get(String(reviewerId)) : null,
  );
  if (!allowed.ok) return { error: allowed.error };

  try {
    await audited(actor, async (session) => {
      const existing = await ClientService.findOne({
        clientId,
        serviceTemplateId,
      }).session(session);

      if (existing) {
        existing.set({
          feePaise,
          defaultAssigneeId: assigneeId,
          defaultReviewerId: reviewerId,
          active: true,
          updatedBy: actor.id,
        });
        await existing.save({ session });
        return;
      }

      await ClientService.create(
        [
          {
            clientId,
            serviceTemplateId,
            feePaise,
            startPeriod: periodFor(template.recurrence).code,
            defaultAssigneeId: assigneeId,
            defaultReviewerId: reviewerId,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath(`/clients/${clientId}`);
  return { ok: `${template.name} added to this client.` };
}

/** Stop generating this service for this client. */
export async function removeClientService(clientId, id) {
  const actor = await requireUser();
  await connectDB();
  const client = await Client.findById(clientId).lean();
  if (!client) return { error: "That client no longer exists." };
  assertCan(actor, "edit", "clients", { branchId: String(client.branchId) });

  const subscription = await ClientService.findById(id);
  if (!subscription) return { error: "Already gone." };

  await audited(actor, async (session) => {
    subscription.active = false;
    subscription.updatedBy = actor.id;
    await subscription.save({ session });
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: "Service removed. Existing engagements are untouched." };
}

/** Used by the create form to prefill from the client's subscription. */
export async function subscriptionDefaults(clientId, serviceTemplateId) {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) return null;

  await connectDB();
  const found = await ClientService.findOne({
    clientId,
    serviceTemplateId,
    active: true,
  }).lean();
  if (!found) return null;

  return {
    feePaise: found.feePaise ?? 0,
    defaultAssigneeId: found.defaultAssigneeId
      ? String(found.defaultAssigneeId)
      : "",
    defaultReviewerId: found.defaultReviewerId
      ? String(found.defaultReviewerId)
      : "",
  };
}

// --- bulk actions (spec section 5) ------------------------------------------

/**
 * Bulk actions run the single-engagement action once per record rather than
 * one `updateMany`.
 *
 * Two reasons, both deliberate: `updateMany` cannot say which records it
 * touched, so the audit plugin refuses to cover it (Step 2), and every rule
 * — who may move this one, does it need a reason, is the maker the checker —
 * has to be asked per record anyway. Whatever passes is done; whatever does
 * not is reported back by name, so "all October GSTR-3B for Ludhiana" never
 * half-fails in silence.
 *
 * ponytail: sequential, not parallel. Every audited write touches the one
 * audit counter, so running these at once would just make them conflict and
 * retry. 200 records is the cap on a selection.
 */
const BULK_LIMIT = 200;

async function runBulk(ids, fn, verb) {
  const list = [...new Set((ids ?? []).map(String))].slice(0, BULK_LIMIT);
  if (list.length === 0) return { error: "Nothing was selected." };

  await connectDB();
  const done = [];
  const skipped = [];

  for (const id of list) {
    try {
      const result = await fn(id);
      if (result?.error) skipped.push({ id, why: result.error });
      else done.push(id);
    } catch (err) {
      skipped.push({ id, why: err.message });
    }
  }

  // name the ones that did not move, so nothing fails quietly
  const names = skipped.length
    ? await Engagement.find({ _id: { $in: skipped.map((s) => s.id) } })
        .select("code")
        .lean()
    : [];
  const codeOf = new Map(names.map((e) => [String(e._id), e.code]));

  revalidatePath("/engagements");
  return {
    ok: `${done.length} of ${list.length} ${verb}.`,
    skipped: skipped.map((s) => ({
      code: codeOf.get(s.id) ?? s.id,
      why: s.why,
    })),
  };
}

/** Move many engagements along the pipeline at once. */
export async function bulkStatus(ids, to, reason = "") {
  await requireUser();
  return runBulk(ids, (id) => changeStatus(id, to, reason), `moved to ${to}`);
}

/** Assign or reassign many at once. */
export async function bulkReassign(ids, { assigneeId, reviewerId }) {
  await requireUser();
  return runBulk(
    ids,
    (id) => reassign(id, { assigneeId, reviewerId }),
    "reassigned",
  );
}

/** Move the internal due date on many at once. */
export async function bulkInternalDue(ids, date) {
  await requireUser();
  return runBulk(ids, (id) => setInternalDue(id, date), "redated");
}

/** Change priority on many at once. */
export async function bulkPriority(ids, priority) {
  await requireUser();
  return runBulk(ids, (id) => setPriority(id, priority), `set to ${priority}`);
}
