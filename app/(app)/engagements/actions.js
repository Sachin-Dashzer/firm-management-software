"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan, can, seesOnlyOwnRecords } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { mentionsIn } from "@/lib/inbox";
import { recordAudit, ACTIONS } from "@/lib/audit";
import {
  engagementAssigned,
  engagementForReview,
  engagementReworked,
  checklistReplacement,
  checklistAnswer,
  commentMentioned,
  clientThreadMessage,
} from "@/lib/mailer/events";
import { toPaise, formatPaise } from "@/lib/money";
import { istInputDate } from "@/lib/dates";
import Engagement from "@/models/Engagement";
import ServiceTemplate from "@/models/ServiceTemplate";
import ClientService from "@/models/ClientService";
import Client from "@/models/Client";
import Invoice from "@/models/Invoice";
import Udin from "@/models/Udin";
import { cascadeSoftDelete, OF_ENGAGEMENT } from "@/lib/cascade";
import ClientAccess from "@/models/ClientAccess";
import Branch from "@/models/Branch";
import Comment from "@/models/Comment";
import User from "@/models/User";
import { periodFor, parsePeriod } from "@/lib/engagements/period";
import { buildEngagement } from "@/lib/engagements/create";
import { checkAssignment, roleName, stepFloor } from "@/lib/engagements/assign";
import { nextEngagementCode } from "@/lib/engagements/code";
import { stepBlock } from "@/lib/engagements/steps";
import { isId } from "@/lib/routes/id";
import {
  recordFiling,
  correctFiling,
  latenessDays,
} from "@/lib/engagements/milestones";
import {
  approve,
  recordClientConfirmation,
  changedAfterApproval,
  needsClientConfirmation,
} from "@/lib/engagements/gates";
import {
  setFee,
  setScope,
  requestWaiver,
  decideWaiver,
  scopeOf,
  scopeLine,
} from "@/lib/engagements/scope";
import {
  accept,
  requestReplacement,
  markNotRequired,
  answerClient,
  blockingItems,
} from "@/lib/engagements/checklist";
import {
  checkStatusChange,
  checkReviewer,
  canEditWork,
  isRework,
  PRIORITIES,
  BULK_APPROVE_LIMIT,
} from "@/lib/engagements/status";
import { canExecute, tierOf, LEVEL_DEFAULTS } from "@/lib/services/catalog";
import {
  checkUdinShape,
  linkUdinToEngagement,
  unlinkUdinFromEngagement,
} from "@/lib/practice/udin";
import { bookOf, checkAssurance, missingOpinion } from "@/lib/practice/books";

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
    // the others working on it are on it as far as permission is concerned
    assignedUserIds: (engagement.helperIds ?? []).map(String),
  });
  return engagement;
}

/**
 * Steps are done in order (owner request, 02-11-2026).
 *
 * The template's steps are a sequence, not a set — documents, then the
 * working, then the review, then the filing — and a job where step four is
 * ticked and step two is open is a job nobody can read the state of. So the
 * rule is the obvious one: a step cannot be ticked while an earlier one is
 * open, and cannot be reopened while a later one is still ticked.
 *
 * **A CA or a Partner may go out of order**, because the person who has to
 * fix a mis-tick at nine in the evening is the one signing the file, and
 * the override is written into the audit entry in those words. Everybody
 * else is refused here, on the server, so the lock is a rule and not a
 * disabled checkbox (CLAUDE.md rule 1).
 *
 * @returns {string|null} why this tick is out of order, or null
 */
function outOfOrder(engagement, task, done) {
  const tasks = engagement.tasks ?? [];
  const at = tasks.findIndex((row) => String(row._id) === String(task._id));
  if (at < 0) return null;

  if (done) {
    const open = tasks.slice(0, at).find((row) => !row.done);
    return open ? `Finish “${open.name}” first.` : null;
  }

  // walking back: only the last thing ticked can be untied
  const later = tasks.slice(at + 1).find((row) => row.done);
  return later ? `“${later.name}” is already done — reopen that first.` : null;
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
  /** Read only when the service is "other": what the one-off work is. */
  otherName: z.string().trim().max(120).default(""),
  period: z.string().min(1, "Choose a period"),
  assigneeId: z.string().optional(),
  reviewerId: z.string().optional(),
  priority: z.enum(PRIORITIES).default("Normal"),
  fee: z.string().trim().default(""),
  /** The firm's own target date; blank means the service's turnaround. */
  internalDue: z.string().trim().default(""),
});

/**
 * The catalog row behind "Other — not in the catalog" (owner request,
 * 02-11-2026).
 *
 * An engagement is always a service: the snapshot, the engagement code, the
 * duplicate guard and the compliance books all read one. So one-off work
 * does not get a special case inside the engagement — it gets a real
 * service, named by whoever is raising it, and from then on it is in the
 * catalog like everything else, where a partner can price it, give it a
 * checklist or archive it.
 *
 * Two consequences, both deliberate:
 *
 *  - **It is a Partner's to do.** Adding to the catalog is `serviceCatalog`
 *    (spec section 2), which a CA may read and not write, so a CA raising
 *    one-off work asks a partner for the service first. The form says so
 *    rather than offering a button that fails.
 *  - **The same name is the same service.** Typing "Fire insurance
 *    certificate" twice reuses the row instead of making a second one, so
 *    the catalog does not fill with near-duplicates — and the engagement's
 *    own duplicate guard (one per client, service and period) then does its
 *    usual job.
 *
 * ponytail: the service is created in its own transaction, before the
 * engagement's. If the engagement is then refused, an unused catalog row is
 * left for a partner to archive — cheaper than one transaction spanning two
 * decisions.
 *
 * @param {object} actor
 * @param {string} name
 */
async function adHocService(actor, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = await ServiceTemplate.findOne({
    name: new RegExp(`^${escaped}$`, "i"),
  }).lean();
  if (existing) return existing;

  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 12) || "OTHER";

  let code = base;
  for (let n = 2; await ServiceTemplate.exists({ code }); n += 1) {
    code = `${base.slice(0, 10)}-${n}`;
  }

  return audited(actor, async (session) => {
    const [created] = await ServiceTemplate.create(
      [
        {
          name,
          code,
          category: "Other",
          level: "L2",
          ...LEVEL_DEFAULTS.L2,
          recurrence: "one-time",
          turnaroundDays: null,
          turnaroundNote: "As agreed with the client",
          /*
           * Nothing is invented for work nobody has described: no
           * checklist, no steps, no fee, no UDIN rule. The person raising
           * it knows what it is; Settings → Services is where it gets
           * filled in if it happens again.
           */
          checklist: [],
          steps: [],
          defaultFeePaise: 0,
          udinRequired: false,
          version: 1,
          active: true,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
    return created.toObject();
  });
}

/** Create one engagement from a service template (spec section 5). */
export async function createEngagement(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "engagementsCreate");

  const parsed = createInput.safeParse({
    clientId: formData.get("clientId") ?? "",
    serviceTemplateId: formData.get("serviceTemplateId") ?? "",
    otherName: formData.get("otherName") ?? "",
    period: formData.get("period") ?? "",
    assigneeId: formData.get("assigneeId") || undefined,
    reviewerId: formData.get("reviewerId") || undefined,
    priority: formData.get("priority") || "Normal",
    fee: formData.get("fee") ?? "",
    internalDue: formData.get("internalDue") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  await connectDB();

  /**
   * "Other" is a service the firm has not met before, so it becomes one.
   * The permission checked is the catalog's, not the engagement's, because
   * the catalog is what is being written.
   */
  const other = data.serviceTemplateId === "other";
  if (other) {
    if (!can(actor, "edit", "serviceCatalog")) {
      return {
        error:
          "Only a partner can add a service. Ask one to add it in Settings → Services, then raise the work against it.",
      };
    }
    if (data.otherName.length < 3) {
      return { error: "Say what the work is, in a few words." };
    }
  }

  const [client, template] = await Promise.all([
    Client.findById(data.clientId).lean(),
    other
      ? adHocService(actor, data.otherName)
      : ServiceTemplate.findById(data.serviceTemplateId).lean(),
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

  // the target date typed on the form, read as an IST calendar day like
  // every other date input; blank leaves the service's turnaround to decide
  const internalDue = data.internalDue
    ? new Date(`${data.internalDue}T00:00:00+05:30`)
    : null;
  if (internalDue && Number.isNaN(internalDue.valueOf())) {
    return { error: "That internal due date is not a date." };
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
        internalDue,
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
      // the tier's own sign-off rule, from the snapshot the work started from
      minReviewRole: engagement.templateSnapshot?.minReviewRole ?? "",
      level: engagement.templateSnapshot?.level ?? "",
    },
    to,
    { reason },
  );
  if (!check.ok) return { error: check.error };

  // completing locks the engagement, so the last checks happen here
  if (to === "Completed") {
    /**
     * Settled means accepted **or** deliberately waived with a reason
     * (P3-2). The gate used to demand `Verified` and nothing else, so an
     * item a CA had decided was not needed blocked the engagement for ever
     * and the only way out was to tick it as received — which is a lie
     * about a document that does not exist.
     */
    const missing = blockingItems(engagement);
    if (missing.length > 0) {
      return {
        error: `${missing.length} mandatory checklist ${missing.length === 1 ? "item is" : "items are"} not accepted yet: ${missing
          .map((i) => i.name)
          .join(
            ", ",
          )}. Accept each one, or mark it not required with a reason.`,
      };
    }
    const unticked = engagement.reviewChecklist.filter((i) => !i.checked);
    if (unticked.length > 0) {
      return { error: "Tick every review point before completing." };
    }
    if (engagement.templateSnapshot?.udinRequired && !engagement.udin) {
      return { error: "This service needs a UDIN before it can be completed." };
    }
    /**
     * An audit cannot be signed off without saying what was concluded. The
     * opinion is the report; a completed audit file with a blank one reads
     * as a clean audit to everyone who opens it afterwards and says nothing
     * at all to a reviewer or a regulator.
     *
     * Code never fills this in — see `missingOpinion()`.
     */
    if (missingOpinion(engagement)) {
      return {
        error:
          "Record the audit opinion on the filing panel before completing this engagement.",
      };
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
/**
 * Who is on this job and when it is due, saved in one go (owner request,
 * 02-11-2026).
 *
 * The panel used to write on every keystroke: picking a reviewer saved,
 * then moving the date saved, then the priority — three writes, three audit
 * entries, three notifications, and no way to change your mind halfway. It
 * is a form with a Save button now, so this is the one action behind it:
 * one transaction, one audit entry naming what actually changed, and the
 * emails sent once at the end.
 *
 * `reassign`, `setPriority` and `setInternalDue` stay as they are — the
 * bulk reassign, the leave cover and the offboarding hand-over all call
 * them, and each of those is genuinely one field.
 *
 * @param {string} id
 * @param {{assigneeId?: string, helperIds?: string[], reviewerId?: string,
 *   internalDue?: string, priority?: string}} input
 */
export async function saveAssignment(id, input) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  // deciding who does the work is a CA's call, as it is in `reassign`
  assertCan(actor, "edit", "engagementsCreate", {
    branchId: String(engagement.branchId),
  });

  const wantedAssignee = String(input.assigneeId ?? "");
  const wantedReviewer = String(input.reviewerId ?? "");
  const wantedHelpers = [
    ...new Set((input.helperIds ?? []).map(String).filter(Boolean)),
  ];

  if (input.priority && !PRIORITIES.includes(input.priority)) {
    return { error: "Unknown priority." };
  }

  const due = input.internalDue
    ? new Date(`${input.internalDue}T00:00:00+05:30`)
    : null;
  if (input.internalDue && Number.isNaN(due?.valueOf())) {
    return { error: "That internal due date is not a date." };
  }

  const people = await loadPeople([
    wantedAssignee,
    wantedReviewer,
    ...wantedHelpers,
  ]);
  const assignee = wantedAssignee ? people.get(wantedAssignee) : null;
  const reviewer = wantedReviewer ? people.get(wantedReviewer) : null;
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

  /**
   * The helpers have to clear the same bar as the assignee — the service's
   * `minExecRole`, which is what the tier means — and the checker can never
   * be one of them (CLAUDE.md rule 4). The assignee is the accountable one
   * and is not repeated in the list.
   */
  const floor = engagement.templateSnapshot?.minExecRole ?? "intern";
  const helpers = [];
  for (const helperId of wantedHelpers) {
    if (helperId === wantedAssignee) continue;
    const person = people.get(helperId);
    if (!person) return { error: "Unknown person on the helpers list." };
    if (person.active === false) {
      return { error: `${person.name}'s account is deactivated.` };
    }
    if (helperId === wantedReviewer) {
      return {
        error: `${person.name} is reviewing this. The person checking the work cannot also be doing it.`,
      };
    }
    if (!canExecute(person.role, floor)) {
      return {
        error: `${person.name} is ${roleName(person.role)}; this work needs ${roleName(floor)} or above.`,
      };
    }
    helpers.push(person);
  }

  const before = {
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
    helperIds: (engagement.helperIds ?? []).map(String),
    priority: engagement.priority,
    internalDue: engagement.internalDue
      ? istInputDate(engagement.internalDue)
      : "",
  };

  const after = {
    assigneeId: assignee?.id ?? "",
    reviewerId: reviewer?.id ?? "",
    helperIds: helpers.map((person) => person.id),
    priority: input.priority ?? engagement.priority,
    internalDue: input.internalDue ?? "",
  };

  /** Only what moved goes in the audit diff. */
  const diff = {};
  for (const key of Object.keys(after)) {
    const was = Array.isArray(before[key])
      ? before[key].join(",")
      : before[key];
    const now = Array.isArray(after[key]) ? after[key].join(",") : after[key];
    if (was !== now) diff[key] = [was, now];
  }
  if (Object.keys(diff).length === 0) return { ok: "Nothing to save." };

  await audited(actor, async (session) => {
    engagement.assigneeId = assignee?.id ?? null;
    engagement.reviewerId = reviewer?.id ?? null;
    engagement.helperIds = helpers.map((person) => person.id);
    engagement.priority = after.priority;
    if (input.internalDue !== undefined) engagement.internalDue = due;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });

    await recordAudit(
      {
        action: ACTIONS.reassign,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        diff,
      },
      session,
    );

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

  const added = helpers.filter(
    (person) => !before.helperIds.includes(person.id),
  );
  return {
    ok:
      added.length > 0
        ? `Saved. ${added.map((person) => person.name).join(", ")} ${added.length === 1 ? "is" : "are"} now on this job too.`
        : "Saved.",
    hint: await accessHint(engagement, assignee),
  };
}

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

  /**
   * A step can demand more than the engagement does. Before P2-4 anybody who
   * could work the engagement could tick any step, so "Sign the report" on an
   * audit was tickable by the intern who collected the data.
   */
  const floor = stepFloor(engagement, task);
  if (!canExecute(actor.role, floor)) {
    return {
      error: `"${task.name}" needs at least ${roleName(floor)}.`,
    };
  }

  /** In order, unless the person signing the file says otherwise. */
  const jumped = outOfOrder(engagement, task, done);
  const mayJump = actor.role === "ca" || actor.role === "partner";
  if (jumped && !mayJump) return { error: jumped };

  /**
   * The step's own precondition, which is a different thing from the
   * order (owner, 03-11-2026). “Collect documents” is not finished
   * because somebody ticked it; it is finished when the documents are
   * in. The screen now hides every step after the open one, so this is
   * the rule that hiding is a courtesy to — and a CA or a Partner may
   * push past it, the same override the order rule already gives them.
   */
  const at = engagement.tasks.findIndex(
    (row) => String(row._id) === String(task._id),
  );
  const blocked = done ? stepBlock(engagement, at) : null;
  if (blocked && !mayJump) return { error: blocked.say };

  let bump = null;
  await audited(actor, async (session) => {
    task.done = Boolean(done);
    task.doneAt = done ? new Date() : null;
    task.doneBy = done ? actor.id : null;
    engagement.updatedBy = actor.id;
    bump = await resetGatesIfApproved(
      engagement,
      actor,
      `"${task.name}" ${done ? "ticked" : "reopened"}${
        jumped ? " out of order" : ""
      }`,
      session,
    );
    await engagement.save({ session });

    if (jumped) {
      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          note: `"${task.name}" ${done ? "ticked" : "reopened"} out of order — ${jumped}`,
        },
        session,
      );
    }
  });

  revalidatePath(`/engagements/${id}`);
  const said = done ? `${task.name} done.` : `${task.name} reopened.`;
  return { ok: bump ? `${said} ${bump.note}` : said };
}

/**
 * "Does this work need a UDIN?", answered (owner request, 02-11-2026).
 *
 * The steps panel asks once every step is ticked, because that is the
 * moment the answer is knowable and the last moment it is useful. *Yes*
 * needs no action here — it sends the person to the register, and the
 * number comes back onto the engagement the way it always has. This is only
 * the *no*, which has to be recorded or the question is asked for ever.
 *
 * A service whose catalog entry says a UDIN is required cannot be waived:
 * `changeStatus` refuses to complete it without one, and a screen that
 * accepted "no" here would be promising something the pipeline will not
 * honour.
 *
 * @param {string} id
 * @param {boolean} notRequired
 */
export async function setUdinNotRequired(id, notRequired) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  if (!canEditWork(actor, engagement)) {
    return { error: `Nothing can be edited while it is ${engagement.status}.` };
  }

  if (notRequired && engagement.templateSnapshot?.udinRequired) {
    return {
      error:
        "This service needs a UDIN — it cannot be completed without one. Record the number instead, or change the service in the catalog.",
    };
  }
  if (notRequired && (engagement.udin ?? "").trim()) {
    return { error: "A UDIN is already recorded against this work." };
  }

  await audited(actor, async (session) => {
    engagement.udinNotRequired = Boolean(notRequired);
    engagement.updatedBy = actor.id;
    await engagement.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        note: notRequired
          ? "recorded that this work needs no UDIN"
          : "reopened the question of whether this work needs a UDIN",
      },
      session,
    );
  });

  revalidatePath(`/engagements/${id}`);
  return {
    ok: notRequired
      ? "Noted — no UDIN for this work."
      : "The UDIN question is open again.",
  };
}

/**
 * Put a name against one step (spec section 5: "sub-tasks from the template's
 * step list, each with its own assignee").
 *
 * `tasks[].assigneeId` has been on the model since Step 5a and no action ever
 * set it, so the field existed and the feature did not. The same floor
 * applies as for ticking: a step nobody may do is a step nobody may be given.
 *
 * @param {string} id
 * @param {string} taskId
 * @param {string} userId empty to take the name off again
 */
export async function assignTask(id, taskId, userId) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  if (!canEditWork(actor, engagement)) {
    return { error: `Nothing can be edited while it is ${engagement.status}.` };
  }

  const task = engagement.tasks.id(taskId);
  if (!task) return { error: "That task is gone." };

  const floor = stepFloor(engagement, task);
  let person = null;

  if (userId) {
    person = (await loadPeople([userId])).get(String(userId)) ?? null;
    if (!person) return { error: "Unknown person." };
    if (person.active === false) {
      return { error: "That person's account is deactivated." };
    }
    if (!canExecute(person.role, floor)) {
      return {
        error: `${person.name} cannot do "${task.name}": it needs at least ${roleName(floor)}.`,
      };
    }
  }

  await audited(actor, async (session) => {
    task.assigneeId = person?.id ?? null;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
  });

  revalidatePath(`/engagements/${id}`);
  return {
    ok: person
      ? `${task.name} is ${person.name}'s.`
      : `${task.name} is unassigned.`,
  };
}

/**
 * Load an engagement and one of its checklist items, for the four actions
 * below. The permission question is the same one every time (P3-2).
 */
async function loadItem(actor, id, itemId) {
  const engagement = await loadForWork(actor, id);
  if (!canEditWork(actor, engagement)) {
    return {
      error: `Nothing can be edited while it is ${engagement.status}.`,
    };
  }
  const item = engagement.checklist.id(itemId);
  if (!item) return { error: "That checklist item is gone." };
  return { engagement, item };
}

/**
 * Save the engagement and write one audit line about the item (P3-2).
 *
 * @param {any} actor
 * @param {any} engagement
 * @param {string} note
 * @param {Record<string, [unknown, unknown]>} diff
 */
/**
 * @param {string} [changedWhat] when this write changes what was reviewed —
 *   a document accepted, rejected or dropped — so the gates reset (P3-5).
 *   Asking for a document and answering a question do not: neither moves a
 *   figure.
 */
async function saveItem(actor, engagement, note, diff, changedWhat) {
  let bump = null;
  await audited(actor, async (session) => {
    engagement.updatedBy = actor.id;
    if (changedWhat) {
      bump = await resetGatesIfApproved(
        engagement,
        actor,
        changedWhat,
        session,
      );
    }
    await engagement.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        diff,
        note,
      },
      session,
    );
  });
  return bump;
}

/*
 * `requestChecklistItem` was here: ask the client for one item, one call
 * per document. It is gone (owner, 11-11-2026).
 *
 * It only moved the status to Requested. No link, no email — so a row
 * could read "Requested" while the client had been told nothing, and the
 * firm's actual asking happened separately in `createDocRequest`. Two
 * routes to one outcome, one of which did not reach the client.
 *
 * `createDocRequest` is the only route now. It takes `itemIds`, so one
 * document and six are the same call, and it marks every item Requested
 * inside the same transaction that writes the request and the message.
 */

/**
 * A person accepts what arrived.
 *
 * Not the format check — a person. The automatic check can say a spreadsheet
 * has the right columns; it cannot say it is the right client's, for the
 * right month, complete and legible.
 */
export async function acceptChecklistItem(id, itemId) {
  const actor = await requireUser();
  const loaded = await loadItem(actor, id, itemId);
  if (loaded.error) return { error: loaded.error };
  const { engagement, item } = loaded;

  const was = item.status;
  const out = accept(item, { id: actor.id, name: actor.name });
  if (!out.ok) return { error: out.error };

  const bump = await saveItem(
    actor,
    engagement,
    `${item.name}: accepted (submission ${item.acceptedSubmission})`,
    { [item.name]: [was, "Accepted"] },
    `${item.name} accepted`,
  );
  revalidatePath(`/engagements/${id}`);
  return {
    ok: bump ? `${item.name} accepted. ${bump.note}` : `${item.name} accepted.`,
  };
}

/**
 * Send it back with a reason the client actually receives.
 *
 * A client told "rejected" sends the same wrong file again. A client told
 * "these are August challans, we need September" sends the right one.
 */
export async function replaceChecklistItem(id, itemId, formData) {
  const actor = await requireUser();
  const loaded = await loadItem(actor, id, itemId);
  if (loaded.error) return { error: loaded.error };
  const { engagement, item } = loaded;

  const reason = String(formData.get("reason") ?? "");
  const was = item.status;
  const out = requestReplacement(item, reason);
  if (!out.ok) return { error: out.error };

  const bump = await saveItem(
    actor,
    engagement,
    `${item.name}: replacement requested — ${item.rejectReason}`,
    { [item.name]: [was, "Replacement requested"] },
    `a replacement was asked for on ${item.name}`,
  );

  await checklistReplacement(engagement, item).catch(() => {});

  revalidatePath(`/engagements/${id}`);
  const said =
    "Asked for a replacement. The client is told why, in your words.";
  return { ok: bump ? `${said} ${bump.note}` : said };
}

/** Decide the firm does not need it after all, with a reason. */
export async function waiveChecklistItem(id, itemId, formData) {
  const actor = await requireUser();
  const loaded = await loadItem(actor, id, itemId);
  if (loaded.error) return { error: loaded.error };
  const { engagement, item } = loaded;

  const reason = String(formData.get("reason") ?? "");
  const was = item.status;
  const out = markNotRequired(item, reason, {
    id: actor.id,
    name: actor.name,
  });
  if (!out.ok) return { error: out.error };

  const bump = await saveItem(
    actor,
    engagement,
    `${item.name}: not required — ${item.notRequiredReason}`,
    { [item.name]: [was, "Not required"] },
    `${item.name} marked not required`,
  );
  revalidatePath(`/engagements/${id}`);
  const said = `${item.name} marked not required. The reason is on the record.`;
  return { ok: bump ? `${said} ${bump.note}` : said };
}

/** Answer a question the client asked about one item. */
export async function answerChecklistQuestion(id, itemId, formData) {
  const actor = await requireUser();
  const loaded = await loadItem(actor, id, itemId);
  if (loaded.error) return { error: loaded.error };
  const { engagement, item } = loaded;

  const answer = String(formData.get("answer") ?? "");
  const out = answerClient(item, answer, { id: actor.id, name: actor.name });
  if (!out.ok) return { error: out.error };

  await saveItem(
    actor,
    engagement,
    `${item.name}: answered the client — ${item.clientReply.answer}`,
    { [item.name]: ["question", "answered"] },
  );

  await checklistAnswer(engagement, item).catch(() => {});

  revalidatePath(`/engagements/${id}`);
  return { ok: "Answered. The client sees it on their portal." };
}

/**
 * The reviewer's own checklist (spec section 5), which is the
 * second-to-last step on the screen since 03-11-2026.
 *
 * This used to carry its own idea of who the reviewer is — the named
 * reviewer, **or any partner**. Two things were wrong with it. A partner
 * who had done the work themselves could tick their own review, which is
 * CLAUDE.md rule 4 broken by the one person nobody would question; and the
 * tier's review floor was not consulted at all, so an L3 job's points
 * could be ticked by a CA.
 *
 * `checkReviewer` is where that rule lives, and completing an engagement
 * and approving a version both already ask it. A second copy of a
 * maker-checker rule is a second rule, and the second one is always the
 * loose one — so this asks the same function.
 */
export async function setReviewItem(id, itemId, checked) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);

  const allowed = checkReviewer(
    actor,
    {
      status: engagement.status,
      assigneeId: engagement.assigneeId,
      reviewerId: engagement.reviewerId,
      minReviewRole: engagement.templateSnapshot?.minReviewRole ?? "",
      level: engagement.templateSnapshot?.level ?? "",
    },
    { act: "tick these", instead: "review it", only: "tick these" },
  );
  if (!allowed.ok) return { error: allowed.error };

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

/**
 * Acknowledgement number, UDIN, the date it was filed, and — for audit work
 * — the report and its opinion (P2-8a). One panel and one action, so the
 * three practice books read what the engagement already says rather than
 * asking anybody to update a register by hand.
 */
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
  if (udin && !checkUdinShape(udin).ok) {
    return { error: "A UDIN is 18 letters and digits." };
  }

  const filedOn = readDate(formData.get("filedOn"));
  if (filedOn === undefined)
    return { error: "That filing date is not a date." };
  if (filedOn && filedOn.getTime() > Date.now()) {
    return { error: "A filing date cannot be in the future." };
  }

  /**
   * Assurance fields are read only for audit work. A form that posts them
   * against a GST return — by hand, or by a field left in the markup — must
   * not write an opinion onto something that has no audit report.
   */
  const category = engagement.templateSnapshot?.category ?? "";
  const isAudit = bookOf(category) === "audits";
  let assurance = null;
  if (isAudit) {
    const appointmentDate = readDate(formData.get("appointmentDate"));
    const reportDate = readDate(formData.get("reportDate"));
    if (appointmentDate === undefined || reportDate === undefined) {
      return { error: "That audit date is not a date." };
    }
    assurance = {
      auditType: String(formData.get("auditType") ?? "").trim(),
      appointmentDate,
      reportDate,
      opinion: String(formData.get("opinion") ?? "").trim(),
      qualificationNote: String(formData.get("qualificationNote") ?? "").trim(),
    };
    const checked = checkAssurance(assurance);
    if (!checked.ok) return { error: checked.error };
  }

  const before = engagement.udin ?? "";
  /** What the database holds afterwards, read back inside the transaction. */
  let saved = null;

  /**
   * The register is the record and this field is a copy of it (P2-7), so the
   * two are written together or not at all. A number already recorded
   * against other work is refused by name, which is what a register is for.
   */
  /**
   * A new or changed number has to name the partner or CA it was generated
   * against (owner decision, 24-10-2026). Only then: re-saving an
   * acknowledgement number on work whose UDIN is already in the register
   * must not ask for the signer again.
   */
  const changed = udin && udin !== before;
  const member = changed
    ? await signingMember(actor, formData.get("udinMemberId"))
    : null;
  if (changed && !member) {
    return {
      error:
        "Name the partner or CA whose ICAI membership the UDIN was generated against.",
    };
  }

  /**
   * A UDIN is generated against a signed report, and a report is its
   * opinion. So the number cannot be recorded while the opinion on this
   * same panel is blank — that combination is how a file ends up looking
   * signed and saying nothing.
   */
  if (
    changed &&
    missingOpinion({ templateSnapshot: { category }, assurance })
  ) {
    return {
      error:
        "Record the audit opinion before the UDIN. A UDIN is generated against a signed report, and the report is its opinion.",
    };
  }

  try {
    await audited(actor, async (session) => {
      if (changed) {
        const linked = await linkUdinToEngagement(
          { udin, engagement, actor, member },
          session,
        );
        // throwing is what takes the audit entry back with it
        if (!linked.ok) throw new Error(linked.error);
      }
      if (!udin && before) {
        await unlinkUdinFromEngagement(engagement, actor, session);
      }

      /**
       * Since P3-1 the acknowledgement and the filing date belong to a
       * milestone, and this panel no longer writes them — `recordFiling`
       * below does, one return at a time. Work created before P3-1 has no
       * milestones, so the old fields stay writable for it rather than
       * stranding it.
       */
      if (!(engagement.milestones ?? []).length) {
        engagement.ackNo = ackNo;
        engagement.filedOn = filedOn;
      }
      engagement.udin = udin;
      if (assurance) engagement.assurance = assurance;
      engagement.updatedBy = actor.id;
      await engagement.save({ session });

      /**
       * **Read it back before saying it saved.**
       *
       * The audit report is the one thing on this panel that nobody can
       * check by eye later — a blank opinion looks exactly like an audit
       * still in progress. So the record is read out of the transaction it
       * was just written in and compared with what was asked for, and a
       * difference throws rather than returning "saved". That covers a
       * dropped field, a silent cast and a second write landing in between,
       * without needing to know which of them happened.
       */
      if (assurance) {
        const written = await Engagement.findById(engagement._id)
          .select("assurance")
          .session(session)
          .lean();
        if ((written?.assurance?.opinion ?? "") !== assurance.opinion) {
          throw new Error(
            `The audit opinion did not save: the record says ${
              written?.assurance?.opinion
                ? `"${written.assurance.opinion}"`
                : "nothing"
            }. Nothing has been changed — please try again.`,
          );
        }
        saved = written.assurance;
      }
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath(`/engagements/${id}`);
  revalidatePath("/practice/udin");
  const book = bookOf(category);
  if (book) revalidatePath(`/practice/${book}`);
  /**
   * The persisted assurance goes back with the message so the panel shows
   * what the database holds rather than what was typed into it.
   */
  return { ok: "Filing details saved.", assurance: saved };
}

/**
 * Record one statutory filing — GSTR-1, or GSTR-3B, or AOC-4 (P3-1).
 *
 * One return at a time, because they fall on different days and finish
 * independently. The acknowledgement number is mandatory: a filing nobody
 * can evidence is a claim and not a record.
 */
export async function recordMilestoneFiling(id, formData) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);

  const milestoneId = String(formData.get("milestoneId") ?? "").trim();
  const ackNo = String(formData.get("ackNo") ?? "").trim();

  const filedOn = readDate(formData.get("filedOn"));
  if (filedOn === undefined)
    return { error: "That filing date is not a date." };

  const result = recordFiling({
    engagement,
    milestoneId,
    ackNo,
    filedOn,
    actor: { id: actor.id, name: actor.name },
  });
  if (!result.ok) return { error: result.error };

  const name = result.milestone.name;
  const late = latenessDays(result.milestone);

  try {
    await audited(actor, async (session) => {
      engagement.updatedBy = actor.id;
      await engagement.save({ session });

      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          diff: { [`${name} filed`]: ["", istInputDate(filedOn)] },
          note: `${name} recorded as filed, acknowledgement ${ackNo}${
            late ? ` — ${late} day${late === 1 ? "" : "s"} late` : ""
          }`,
        },
        session,
      );
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath(`/engagements/${id}`);
  revalidatePath("/engagements");
  revalidatePath("/compliance");

  const tail = result.complete
    ? " Every filing on this work is now recorded."
    : " The remaining filings stay open.";
  return {
    ok: `${name} recorded${late ? `, ${late} day${late === 1 ? "" : "s"} late` : " on time"}.${tail} Attach the acknowledgement so the client can see it.`,
  };
}

/**
 * Replace a filing record that was wrong (P3-1).
 *
 * The old record is kept with the reason, because what the firm reported is
 * a fact about what was reported even once it turns out to be wrong.
 */
export async function correctMilestoneFiling(id, formData) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);

  const milestoneId = String(formData.get("milestoneId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const before = (engagement.milestones ?? []).find(
    (m) => String(m._id) === String(milestoneId),
  );
  const wasAck = before?.ackNo ?? "";

  const result = correctFiling({
    engagement,
    milestoneId,
    reason,
    actor: { id: actor.id, name: actor.name },
  });
  if (!result.ok) return { error: result.error };

  const name = result.milestone.name;

  try {
    await audited(actor, async (session) => {
      engagement.updatedBy = actor.id;
      await engagement.save({ session });

      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          diff: { [`${name} filed`]: [wasAck, ""] },
          note: `${name} filing record corrected: ${reason}`,
        },
        session,
      );
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath(`/engagements/${id}`);
  return {
    ok: `${name} is open again. The record it replaced is kept with your reason.`,
  };
}

/**
 * A date from a `<input type="date">`: null for empty, `undefined` for
 * something that is not a date, so a caller can tell the two apart. Stored
 * at the start of the IST day, like every other date the firm types.
 *
 * @param {FormDataEntryValue|null} value
 * @returns {Date|null|undefined}
 */
function readDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(`${text}T00:00:00+05:30`);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

/**
 * The member a UDIN is recorded against.
 *
 * A UDIN is generated on the ICAI portal against a member's own membership,
 * so the person saving it is recorded when they are one. Somebody who is not
 * a member — an employee typing in what the partner generated — leaves it
 * blank rather than claiming it, and the register screen can set it.
 */
async function signingMember(actor, memberId) {
  // whoever the filing panel named, or the person saving it when they are a
  // member themselves and named nobody
  const id =
    String(memberId ?? "") ||
    (["ca", "partner"].includes(actor.role) ? actor.id : "");
  if (!id) return null;

  const person = await User.findById(id).select("icai role").lean();
  if (!person || !["ca", "partner"].includes(person.role)) return null;
  return { id, membershipNo: person.icai?.membershipNo ?? "" };
}

/**
 * Delete a job, Partner only (owner, 12-11-2026).
 *
 * The owner's case is the ordinary one: a job created against the wrong
 * client or the wrong period, noticed an hour later. Cancelling it keeps it
 * on every list for ever, so there is a delete — a **soft** one
 * (CLAUDE.md rule 3), with its reason, and it takes the job's own files,
 * letters, document requests, time entries and comments with it rather than
 * leaving them pointing at a job nobody can open.
 *
 * It refuses twice, for the two records that are not the firm's to erase: a
 * UDIN on the statutory register, and an invoice that has gone out to the
 * client. Both have to be dealt with on their own terms first.
 *
 * @param {string} id
 * @param {string} reason
 */
export async function deleteEngagement(id, reason) {
  const actor = await requireUser();
  assertCan(actor, "approve", "deleteRecord");
  if (!String(reason ?? "").trim()) {
    return { error: "Give a reason for deleting this job." };
  }

  await connectDB();
  const engagement = await Engagement.findById(id);
  if (!engagement) return { error: "That job no longer exists." };

  const udin = await Udin.findOne({ engagementId: id }).select("udin").lean();
  if (udin || (engagement.udin ?? "").trim()) {
    return {
      error: `UDIN ${udin?.udin || engagement.udin} is recorded against this job. The UDIN register is a statutory record — cancel the job instead, so the number keeps its file.`,
    };
  }

  const billed = await Invoice.findOne({
    "lines.engagementId": id,
    status: { $nin: ["Draft", "Cancelled"] },
  })
    .select("number")
    .lean();
  if (billed) {
    return {
      error: `This job is billed on invoice ${billed.number}, which has gone out. Cancel or credit-note the invoice first, or cancel the job instead.`,
    };
  }

  let went = [];
  await audited(actor, async (session) => {
    went = await cascadeSoftDelete(OF_ENGAGEMENT, [id], actor.id, session);
    engagement.deletedAt = new Date();
    engagement.deletedBy = actor.id;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
    await recordAudit(
      {
        action: ACTIONS.softDelete,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        note: went.length
          ? `${String(reason).trim()} — and with it ${went.join(", ")}`
          : String(reason).trim(),
      },
      session,
    );
  });

  revalidatePath("/engagements");
  revalidatePath(`/clients/${engagement.clientId}`);
  return {
    ok: went.length
      ? `${engagement.code} deleted, and with it ${went.join(", ")}.`
      : `${engagement.code} deleted.`,
  };
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

// --- the gates before a filing ----------------------------------------------

/**
 * A reviewer approves the version in front of them (P3-5).
 *
 * This is not "Completed" — it is the gate that lets a filing be recorded at
 * all. The identity rules are the same ones completion uses, because they
 * are the same rule: `checkReviewer` in `lib/engagements/status.js`.
 */
export async function approveWork(id) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);
  assertCan(actor, "approve", "engagementsReview", {
    branchId: String(engagement.branchId),
  });

  const result = approve(engagement, {
    id: actor.id,
    role: actor.role,
    name: actor.name,
  });
  if (!result.ok) return { error: result.error };

  await audited(actor, async (session) => {
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
    await recordAudit(
      {
        action: ACTIONS.statusChange,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        note: `Version ${result.version} approved for filing`,
      },
      session,
    );
  });

  revalidatePath(`/engagements/${id}`);
  revalidatePath("/engagements");

  return {
    ok: needsClientConfirmation(engagement)
      ? `Version ${result.version} approved. The client confirms the figures next — nothing can be filed until they do.`
      : `Version ${result.version} approved. The filings can be recorded now.`,
  };
}

/**
 * Record that the client confirmed the figures (P3-5).
 *
 * Usually the firm records it, because the confirmation arrives on WhatsApp
 * or over the phone — hence the mandatory evidence line saying where it can
 * be found.
 */
export async function recordConfirmation(id, formData) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);

  const when = readDate(formData.get("when"));
  if (when === undefined) return { error: "That date is not a date." };

  const result = recordClientConfirmation(
    engagement,
    {
      who: formData.get("who"),
      when,
      evidence: formData.get("evidence"),
    },
    { id: actor.id, name: actor.name },
  );
  if (!result.ok) return { error: result.error };

  await audited(actor, async (session) => {
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        note: `Client confirmed version ${result.version}: ${engagement.clientConfirmation.who} on ${istInputDate(when)} — ${engagement.clientConfirmation.evidence}`,
      },
      session,
    );
  });

  revalidatePath(`/engagements/${id}`);
  return {
    ok: `Confirmation recorded against version ${result.version}, with its evidence. The filings can be recorded now.`,
  };
}

/**
 * Called by every action that changes the work itself, inside that action's
 * own transaction.
 *
 * Does nothing in the ordinary case — most edits happen before anyone has
 * approved anything. When an approval was standing it raises the version,
 * drops both gates, sends the job back, and leaves the assignee a note they
 * will actually read, which is the same reasoning `changeStatus` applies to
 * a rejection.
 */
async function resetGatesIfApproved(engagement, actor, what, session) {
  const from = engagement.status;
  const bump = changedAfterApproval(engagement, actor, what);
  if (!bump.bumped) return null;

  if (engagement.status !== from) {
    engagement.statusHistory.push({
      from,
      to: engagement.status,
      at: new Date(),
      byId: actor.id,
      byName: actor.name,
      reason: bump.note,
    });
  }

  await recordAudit(
    {
      action: ACTIONS.statusChange,
      entityType: "Engagement",
      entityId: engagement._id,
      clientId: engagement.clientId,
      diff: { version: [bump.version - 1, bump.version] },
      note: bump.note,
    },
    session,
  );

  await Comment.create(
    [
      {
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        kind: "Note",
        body: bump.note,
        internal: true,
        createdBy: actor.id,
        createdByName: actor.name,
      },
    ],
    { session },
  );

  return bump;
}

// --- what the work is worth -------------------------------------------------

/**
 * Load an engagement for a change to its money.
 *
 * Pricing is the billing team's and the partners', which the matrix already
 * says: `invoices` is edit for a partner, for a CA within their branch, and
 * for accounts. The person who did the work does not price it, and does not
 * ask for the fee to be dropped either — that request comes from whoever is
 * billing, which is where it can be weighed against the ledger.
 */
async function loadForMoney(actor, id) {
  await connectDB();
  const engagement = await Engagement.findById(id);
  if (!engagement) {
    const err = new Error("That engagement no longer exists.");
    err.code = "NOT_FOUND";
    throw err;
  }
  assertCan(actor, "edit", "invoices", {
    branchId: String(engagement.branchId),
  });
  return engagement;
}

/** Everything the fee screens refresh together. */
function revalidateMoney(id) {
  revalidatePath(`/engagements/${id}`);
  revalidatePath("/engagements");
  revalidatePath("/billing");
  revalidatePath("/reports/unbilled");
}

/**
 * Agree the fee for one job (P3-4).
 *
 * Positive whole rupees, enforced in `lib/engagements/scope.js` so the
 * billing screen and this one refuse the same things in the same words.
 */
export async function setEngagementFee(id, formData) {
  const actor = await requireUser();
  const engagement = await loadForMoney(actor, id);

  const before = engagement.feePaise ?? 0;
  const result = setFee(engagement, formData.get("fee"));
  if (!result.ok) return { error: result.error };

  await audited(actor, async (session) => {
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        diff: { feePaise: [before, result.paise] },
        note: `Fee agreed at ${formatPaise(result.paise)}`,
      },
      session,
    );
  });

  revalidateMoney(id);
  return { ok: `Fee agreed at ${formatPaise(result.paise)}.` };
}

/**
 * Move a job between billable and covered-by-a-retainer (P3-4).
 *
 * Waived is deliberately not reachable here: free work needs a partner, and
 * that is `decideFeeWaiver`.
 */
export async function setEngagementScope(id, scope, reason = "") {
  const actor = await requireUser();
  const engagement = await loadForMoney(actor, id);

  const before = scopeOf(engagement);
  const result = setScope(engagement, scope, reason);
  if (!result.ok) return { error: result.error };

  await audited(actor, async (session) => {
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        diff: { scope: [before, result.scope] },
        note:
          result.scope === "retainer"
            ? `Covered by a retainer — ${engagement.scopeReason}`
            : "Back on the billable list",
      },
      session,
    );
  });

  revalidateMoney(id);
  return {
    ok:
      result.scope === "retainer"
        ? "Marked as covered by the retainer. It stays on the unbilled list with the reason."
        : "Back on the list to bill.",
  };
}

/**
 * Ask a partner to waive the fee (P3-4). The job does not move: it stays
 * chargeable and unbilled until the partner decides.
 */
export async function requestFeeWaiver(id, formData) {
  const actor = await requireUser();
  const engagement = await loadForMoney(actor, id);

  const reason = String(formData.get("reason") ?? "");
  const result = requestWaiver(engagement, reason, {
    id: actor.id,
    name: actor.name,
  });
  if (!result.ok) return { error: result.error };

  await audited(actor, async (session) => {
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        note: `Fee waiver requested: ${engagement.waiver.reason}`,
      },
      session,
    );
  });

  revalidateMoney(id);
  return {
    ok: "Sent to a partner. The job stays on the list to bill until they decide.",
  };
}

/**
 * A partner approves or declines a waiver (P3-4).
 *
 * `feeWriteOff` is partner-only in the matrix and has been since Phase 1, so
 * no new permission is needed — which is also the answer to "who may do
 * this": exactly whoever may write a debt off.
 */
export async function decideFeeWaiver(id, approve, reason = "") {
  const actor = await requireUser();
  assertCan(actor, "approve", "feeWriteOff");
  await connectDB();
  const engagement = await Engagement.findById(id);
  if (!engagement) return { error: "That engagement no longer exists." };

  const result = decideWaiver(engagement, Boolean(approve), reason, {
    id: actor.id,
    name: actor.name,
  });
  if (!result.ok) return { error: result.error };

  await audited(actor, async (session) => {
    engagement.updatedBy = actor.id;
    await engagement.save({ session });
    await recordAudit(
      {
        action: result.approved ? ACTIONS.writeOff : ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        diff: result.approved ? { scope: ["billable", "waived"] } : undefined,
        note: result.approved
          ? scopeLine(engagement)
          : `Waiver declined — ${engagement.waiver.declineReason} (asked: ${result.reason})`,
      },
      session,
    );
  });

  revalidateMoney(id);
  return {
    ok: result.approved
      ? "Fee waived. The reason and both names are on the record."
      : "Waiver declined. The job is still chargeable and the fee is still to agree.",
  };
}

// --- talking about the work -------------------------------------------------

/**
 * A comment on the thread, with @mentions (spec section 5, P3-17a).
 *
 * **The mention now tells the person.** It was collected here from Step 5
 * and the line under it said "the mentioned people are notified in Step 9";
 * Step 9 never did it, so for twelve steps somebody could type a
 * colleague's name into a box and nobody was told. The matching moved to
 * `lib/inbox`, where it is tested — it used to match on `startsWith`, so
 * `@pri` reached Priya and `@a` reached everybody beginning with an A.
 */
export async function addEngagementComment(id, formData) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id, "view");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write something first." };

  /**
   * The tick on the box, and the one place its meaning is decided: a
   * comment is internal unless somebody says otherwise, and saying
   * otherwise now **sends it** (P3-17b).
   */
  const internal = formData.get("internal") !== "off";

  const team = body.includes("@")
    ? await User.find({ active: true }).select("name email").lean()
    : [];
  /** Never the writer: nobody needs telling what they just typed. */
  const mentioned = mentionsIn(body, team).filter(
    (person) => String(person._id) !== actor.id,
  );

  /**
   * A with-client message needs the contacts, and a mention inside one is
   * refused rather than quietly stripped: `@priya` in a paragraph the
   * client reads is the firm talking to itself in front of them.
   */
  let client = null;
  if (!internal) {
    if (mentioned.length) {
      return {
        error:
          "This one goes to the client, and it names a colleague. Say it in the internal thread, or take the @mention out.",
      };
    }
    client = await Client.findById(engagement.clientId)
      .select("legalName tradeName contacts")
      .lean();
    if (!(client?.contacts ?? []).some((contact) => contact.email)) {
      return {
        error:
          "Nobody at this client has an email address on their record, so there is nowhere to send it. Add one on the client, or write it in the internal thread.",
      };
    }
  }

  let delivered = false;

  await audited(actor, async (session) => {
    if (!internal) {
      delivered = await clientThreadMessage(
        engagement,
        client,
        actor,
        body,
        session,
      );
    }

    await Comment.create(
      [
        {
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          kind: "Note",
          body,
          mentions: mentioned.map((person) => person._id),
          internal,
          sentToClientAt: delivered ? new Date() : null,
          createdBy: actor.id,
          createdByName: actor.name,
        },
      ],
      { session },
    );

    if (mentioned.length) {
      await commentMentioned(engagement, actor, mentioned, body, session);
    }
  });

  revalidatePath(`/engagements/${id}`);

  if (!internal) {
    return {
      ok: delivered
        ? "Sent to the client, and on the with-client thread."
        : "On the with-client thread, and held: client email is switched off, so nothing has reached them. What was held is on Settings → Messages.",
    };
  }

  return {
    ok: mentioned.length
      ? `Added to the internal thread. ${mentioned.map((person) => person.name.split(" ")[0]).join(" and ")} ${mentioned.length === 1 ? "was" : "were"} told.`
      : "Added to the internal thread.",
  };
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

/**
 * Used by the create form to prefill from the client's subscription.
 *
 * **Neither id is trusted to be one.** The form's service list carries a
 * sentinel — `other`, the one-off job that is not in the catalog — and
 * handing that to Mongoose threw a `CastError` 500 the moment anybody
 * picked it. A one-off has no subscription by definition, and nor has any
 * other string somebody posts at this action: there is nothing to prefill,
 * which is exactly what "no subscription" already means here.
 */
export async function subscriptionDefaults(clientId, serviceTemplateId) {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) return null;
  if (!isId(clientId) || !isId(serviceTemplateId)) return null;

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

/**
 * Delete a batch of jobs, Partner only (owner, 12-11-2026).
 *
 * The owner's case is a run of recurring work generated against the wrong
 * period, which is a list and not one record. Each one goes through
 * `deleteEngagement`, so each gets its own refusals, its own cascade and
 * its own audit entry — the batch is a convenience over the single delete
 * and never a second rule. One reason covers the batch, which is how the
 * mistake happened in the first place.
 *
 * @param {string[]} ids
 * @param {string} reason
 */
export async function bulkDelete(ids, reason) {
  const actor = await requireUser();
  assertCan(actor, "approve", "deleteRecord");
  if (!String(reason ?? "").trim()) {
    return { error: "Give a reason for deleting these jobs." };
  }
  return runBulk(ids, (id) => deleteEngagement(id, reason), "deleted");
}

/**
 * Sign off several C-tier engagements at once (owner decision D5).
 *
 * The owner asked whether routine work could close without a CA reading it.
 * The answer was no — maker-checker stays — so this makes the signing light
 * rather than making it optional: **nothing here skips a single rule.** It
 * loops `changeStatus(id, "Completed")`, so for every engagement separately
 * the server still refuses self-approval, refuses a reviewer who is not the
 * named one, demands every mandatory checklist item verified, demands every
 * review point ticked, and demands a UDIN where the service needs one. Each
 * sign-off writes its own audit entry.
 *
 * What makes it faster is only that the CA presses one button instead of
 * twelve. What comes back names every row that would not go through and why.
 *
 * A-tier and B-tier are not offered: those are the ones that want somebody
 * reading the file.
 *
 * The cap is `BULK_APPROVE_LIMIT` in `lib/engagements/status.js`.
 */
export async function bulkApprove(ids) {
  const actor = await requireUser();

  const list = [...new Set((ids ?? []).map(String))];
  if (list.length === 0) return { error: "Nothing was selected." };
  if (list.length > BULK_APPROVE_LIMIT) {
    return {
      error: `${BULK_APPROVE_LIMIT} at a time. Each one is a separate sign-off with its own entry in the log, and a longer run holds the log open too long.`,
    };
  }

  await connectDB();

  // only C-tier is bulk-approvable, checked here and not only in the UI
  const rows = await Engagement.find({ _id: { $in: list } })
    .select("code templateSnapshot")
    .lean();
  const wrongTier = rows.filter(
    (row) => tierOf(row.templateSnapshot?.level) !== "C",
  );
  if (wrongTier.length > 0) {
    return {
      error: `Only routine (C) work can be approved in a batch. ${wrongTier
        .map((r) => r.code)
        .slice(0, 3)
        .join(", ")} ${wrongTier.length === 1 ? "is" : "are"} not.`,
    };
  }

  return runBulk(list, (id) => changeStatus(id, "Completed"), "signed off");
}
