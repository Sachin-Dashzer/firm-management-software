// @ts-check

import {
  checkReviewer,
  canEditWork,
  CLOSED_STATUSES,
} from "../engagements/status.js";
import { canExecute } from "../services/catalog.js";
import { stepFloor } from "../engagements/assign.js";
import {
  nextOpenMilestone,
  proofPending,
  milestoneState,
  OVERDUE,
} from "../engagements/milestones.js";
import {
  isApproved,
  isClientConfirmed,
  needsClientConfirmation,
  blocksFiling,
  versionOf,
} from "../engagements/gates.js";
import { feeState, isChargeable } from "../engagements/scope.js";
/*
  The `href`s below are **same-page** links, read only by the next-action
  band on the engagement screen (`lib/issues/list.js` builds its own
  `/engagements/<id>`). Since that screen became tabbed (03-11-2026) a bare
  `#documents` would land on an anchor that is not on the Work tab, so the
  document links name the tab as well as the anchor.
*/
import { itemsForStep, udinAnswered } from "../engagements/steps.js";
import { formatPaise } from "../money.js";

/**
 * The one next thing on one job, and whose it is (P3-6).
 *
 * The same conditions `lib/issues/list.js` computes for the whole firm, read
 * for a single engagement — which is why they are neighbours. A card that
 * names one next action is the per-job view of the Issues page, not a
 * separate idea, and two separate ideas would drift.
 *
 * Role-aware, in the prototype's three shapes:
 *
 *   - it is yours to do → your button
 *   - it is somebody else's → **Nudge <name>**, and no button that would be
 *     refused
 *   - you may step in → **Help: <action>**, which is recorded as help on the
 *     job rather than passed off as the preparer's own work
 *
 * Pure, so the screens and the tests read the same function.
 */

/**
 * @param {any} engagement
 * @param {{id: string, role: string}} actor
 * @param {{assigneeName?: string, reviewerName?: string}} [names]
 * @param {Date} [now]
 */
export function nextStep(engagement, actor, names = {}, now = new Date()) {
  const assignee = engagement.assigneeId ? String(engagement.assigneeId) : null;
  const reviewer = engagement.reviewerId ? String(engagement.reviewerId) : null;
  const assigneeName = names.assigneeName || "the preparer";
  const reviewerName = names.reviewerName || "the reviewer";
  const isSenior = actor.role === "ca" || actor.role === "partner";

  /** Whose turn it is, and what that means for this reader. */
  const turn = (ownerId, ownerName) => {
    if (ownerId && String(ownerId) === String(actor.id)) return "mine";
    if (isSenior) return "help";
    return ownerName ? "nudge" : "watch";
  };

  const step = (text, ownerId, ownerName, action = null) => ({
    text,
    who: ownerName,
    stance: turn(ownerId, ownerName),
    action,
  });

  // --- finished work, which still owes a couple of things ------------------
  if (CLOSED_STATUSES.includes(engagement.status)) {
    if (proofPending(engagement)) {
      const missing = (engagement.milestones ?? []).find(
        (m) => m.filedOn && !m.proofDocumentId,
      );
      return step(
        `Attach the acknowledgement for ${missing.name}`,
        assignee,
        assigneeName,
        { label: "Go to the steps", href: "#steps" },
      );
    }
    if (engagement.billingStatus === "Unbilled" && isChargeable(engagement)) {
      const state = feeState(engagement);
      return state.key === "fee-not-agreed"
        ? step("Agree the fee, then bill it", null, "Accounts", {
            label: "Open the billing list",
            href: "/billing?tab=ready",
          })
        : step(
            `Bill this job (${formatPaise(engagement.feePaise ?? 0)})`,
            null,
            "Accounts",
            {
              label: "Raise an invoice",
              href: `/invoices/new?client=${engagement.clientId}`,
            },
          );
    }
    return {
      text: "Nothing left to do on this job",
      who: "",
      stance: "done",
      action: null,
    };
  }

  // --- documents ------------------------------------------------------------
  const checklist = engagement.checklist ?? [];

  const toCheck = checklist.find((i) =>
    ["Received", "Format checked"].includes(i.status),
  );
  if (toCheck) {
    return step(`Check the upload: ${toCheck.name}`, assignee, assigneeName, {
      label: "Go to the documents",
      href: "?tab=files#documents",
    });
  }

  const cannot = checklist.find((i) => i.clientReply?.kind === "cannot");
  const question = checklist.find(
    (i) => i.clientReply?.kind === "question" && !i.clientReply.answer,
  );
  if (cannot || question) {
    return step(
      cannot
        ? `The client cannot provide ${cannot.name} — decide how to proceed`
        : `Answer the client: “${question.clientReply.question.slice(0, 70)}”`,
      assignee,
      assigneeName,
      { label: "Go to the documents", href: "?tab=files#documents" },
    );
  }

  /*
    Only what the **client** owes, and only for the step the job is
    actually on.

    Two narrowings, both so this card and the steps panel cannot contradict
    each other. A firm-side item sitting at Pending is the job's own
    unwritten paper, not a thing to chase anybody for — naming it produced
    "waiting on the client for Working papers" on every job that had not
    started yet. And since a checklist is divided by step (03-11-2026), a
    document a *later* step will ask for is not what is holding this one
    up: `stepBlock` ignores it, so this has to as well, or the card says
    the job is waiting on the client while the open step sits there
    finishable.
  */
  const openStep = (engagement.tasks ?? []).findIndex((t) => !t.done);
  const awaited = itemsForStep(
    engagement,
    openStep < 0 ? (engagement.tasks ?? []).length : openStep,
  ).filter(
    (i) =>
      i.mandatory &&
      i.side === "client" &&
      ["Pending", "Requested", "Replacement requested"].includes(i.status),
  );
  if (engagement.status === "Awaiting documents" || awaited.length) {
    return step(
      `Waiting on the client for ${
        awaited.length ? awaited.map((i) => i.name).join("; ") : "documents"
      }`,
      assignee,
      assigneeName,
      { label: "Go to the documents", href: "?tab=files#documents" },
    );
  }

  // --- the gates ------------------------------------------------------------
  if (engagement.status === "Under review" && !isApproved(engagement)) {
    const allowed = checkReviewer(
      actor,
      {
        status: engagement.status,
        assigneeId: assignee,
        reviewerId: reviewer,
        minReviewRole: engagement.templateSnapshot?.minReviewRole ?? "",
        level: engagement.templateSnapshot?.level ?? "",
      },
      { act: "approve it", instead: "approve it", only: "approve this" },
    );
    if (!allowed.ok) {
      return {
        text: `With ${reviewerName} for review`,
        who: reviewerName,
        // the preparer's own job is to wait, so there is nothing to nudge
        stance: String(actor.id) === assignee ? "watch" : "nudge",
        action: null,
        why: allowed.error,
      };
    }
    return step(
      "Review the work and approve it, or send it back with a point",
      reviewer ?? actor.id,
      reviewerName,
      { act: "approve-work", label: "Approve", id: String(engagement._id) },
    );
  }

  if (
    isApproved(engagement) &&
    needsClientConfirmation(engagement) &&
    !isClientConfirmed(engagement)
  ) {
    return step(
      `The client confirms version ${versionOf(engagement)} of the figures`,
      assignee,
      assigneeName,
      { label: "Go to the review", href: "?tab=work#review" },
    );
  }

  if (!blocksFiling(engagement)) {
    const next =
      nextOpenMilestone(engagement) ??
      (engagement.milestones ?? []).find((m) => !m.filedOn);
    if (next) {
      const late = milestoneState(next, now) === OVERDUE;
      return step(
        `File ${next.name} in the department's utility, then record the acknowledgement${
          late ? " — the date has already passed" : ""
        }`,
        assignee,
        assigneeName,
        { label: "Go to the filing step", href: "#steps" },
      );
    }
  }

  // --- the work itself ------------------------------------------------------
  const tasks = engagement.tasks ?? [];
  const index = tasks.findIndex((t) => !t.done);
  if (index >= 0) {
    const task = tasks[index];
    /**
     * The UDIN step (owner, 12-11-2026).
     *
     * Offering "Mark it done" here would offer a button the server is
     * going to refuse — `stepBlock` holds this step shut until a number is
     * on the register. So the card names the thing that actually has to
     * happen, and points at the register with the client and the job
     * already filled in.
     */
    if (task.kind === "udin" && !udinAnswered(engagement)) {
      return step(
        "Generate the UDIN on the ICAI portal and record it on the register",
        assignee,
        assigneeName,
        {
          label: "Go to the register",
          href: `/practice/udin?new=1&client=${engagement.clientId}&engagement=${engagement._id}`,
        },
      );
    }
    const mayTick =
      canEditWork(actor, engagement) &&
      canExecute(actor.role, stepFloor(engagement, task));
    return {
      /*
        No "of N" here. Since 03-11-2026 the steps panel counts the
        template's steps plus the firm's own closing stage, and a second
        total computed from `tasks` alone would quietly disagree with it on
        every job. The card's business is naming the next thing; the count
        belongs on the panel that owns it.
      */
      text: `Step ${index + 1}: ${task.name}`,
      who: assigneeName,
      stance: mayTick
        ? String(actor.id) === assignee
          ? "mine"
          : "help"
        : "nudge",
      action: mayTick
        ? {
            act: "tick-task",
            label: "Mark it done",
            id: String(engagement._id),
            taskId: String(task._id),
          }
        : null,
    };
  }

  if (engagement.status !== "Under review") {
    return step("Send it for review", assignee, assigneeName, {
      act: "to-review",
      label: "Send for review",
      id: String(engagement._id),
    });
  }

  return {
    text: "Nothing obvious — open the job and decide",
    who: assigneeName,
    stance: "watch",
    action: null,
  };
}
