// @ts-check

import { canReview, tierLabel } from "../services/catalog.js";
import { roleName } from "./assign.js";

/**
 * The engagement pipeline from spec section 5, and the rules about who may
 * move work along it.
 *
 * This module is the only place those rules live. Every server action asks it
 * before writing, and the screens ask it to decide which buttons to show —
 * but the screens asking is a convenience, not the protection.
 *
 * "Billed" is deliberately not here. The spec runs the billing status
 * alongside the pipeline rather than inside it (section 7), so it is a
 * separate field: an engagement can be Completed and unbilled, or filed and
 * part-billed, without the two fighting over one column.
 */

export const STATUSES = [
  "Scheduled",
  "Awaiting documents",
  "In progress",
  "Under review",
  "Filed / delivered",
  "Completed",
  "On hold",
  "Cancelled",
];

export const BILLING_STATUSES = ["Unbilled", "Partly billed", "Billed"];

export const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

/** Work that is finished or abandoned: it leaves the board. */
export const CLOSED_STATUSES = ["Completed", "Cancelled"];

/**
 * Where each status can go next. Completed and Cancelled are terminal: the
 * spec locks a completed engagement to comments only, and nothing in it
 * reopens one.
 */
const TRANSITIONS = {
  Scheduled: ["Awaiting documents", "In progress", "On hold", "Cancelled"],
  "Awaiting documents": ["In progress", "On hold", "Cancelled"],
  "In progress": ["Awaiting documents", "Under review", "On hold", "Cancelled"],
  // the review gate: approve it on, or send it back for rework
  "Under review": ["Filed / delivered", "Completed", "In progress"],
  "Filed / delivered": ["Completed", "In progress"],
  "On hold": ["Scheduled", "In progress", "Awaiting documents", "Cancelled"],
  Completed: [],
  Cancelled: [],
};

/** A reason is mandatory on these, whoever sets them. */
export const NEEDS_REASON = ["On hold", "Cancelled"];

/**
 * How many C-tier jobs one press of "Approve selected" may sign off (owner
 * decision D5). It lives here rather than beside the action because a
 * `"use server"` module may only export async functions, and the bulk bar
 * needs to say the number before it sends anything.
 *
 * ponytail: 25, because the audit chain is serialised through one counter
 * document and each sign-off is a link in it — a longer batch holds the
 * transaction open and widens the retry-on-conflict window. Raise it if the
 * firm ever finds 25 limiting.
 */
export const BULK_APPROVE_LIMIT = 25;

/**
 * Where a status can go, without asking who is asking.
 *
 * The board uses this to decide which columns a card may be dropped into,
 * so it can refuse an impossible drag before it starts. It is an
 * affordance, not a permission: `checkStatusChange` on the server still
 * decides whether this person may make the move.
 *
 * @param {string} from
 * @returns {string[]}
 */
export function transitionsFrom(from) {
  return TRANSITIONS[from] ?? [];
}

/** Statuses only a CA or a Partner may set (spec section 5). */
const SENIOR_ONLY = ["On hold", "Cancelled", "Completed"];

/**
 * After this point the assignee can no longer edit deliverables — the work
 * has left their hands (spec section 5, "Under review").
 */
export const LOCKED_FOR_ASSIGNEE = [
  "Under review",
  "Filed / delivered",
  "Completed",
  "Cancelled",
];

/** @typedef {{id: string, role: string, branchIds?: string[]}} Actor */
/**
 * @typedef {object} EngagementLike
 * @property {string} status
 * @property {string} [assigneeId]
 * @property {string} [reviewerId]
 * @property {string} [minReviewRole] from the engagement's template snapshot
 * @property {string} [level] the snapshot's `L1`–`L3`, for the refusal's wording
 */

const isSenior = (role) => role === "ca" || role === "partner";

/**
 * May this person move this engagement to this status, and is anything else
 * required first?
 *
 * Returns `{ ok: true }` or `{ ok: false, error }` with a sentence the screen
 * can show as it stands.
 *
 * @param {Actor} actor
 * @param {EngagementLike} engagement
 * @param {string} to
 * @param {{ reason?: string }} [extra]
 */
export function checkStatusChange(actor, engagement, to, extra = {}) {
  const from = engagement.status;

  if (!STATUSES.includes(to)) return fail(`Unknown status: ${to}`);
  if (from === to) return fail(`It is already ${to}.`);

  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return fail(
      from === "Completed"
        ? "A completed engagement is locked. Only comments can be added."
        : from === "Cancelled"
          ? "A cancelled engagement cannot be restarted. Create a new one."
          : `${from} cannot go straight to ${to}.`,
    );
  }

  if (SENIOR_ONLY.includes(to) && !isSenior(actor.role)) {
    return fail(`Only a CA or a Partner can set ${to}.`);
  }

  // maker and checker are different people (CLAUDE.md rule 4)
  if (to === "Completed") {
    const review = checkReviewer(actor, engagement);
    if (!review.ok) return review;
  }

  if (NEEDS_REASON.includes(to) && !String(extra.reason ?? "").trim()) {
    return fail(`Say why it is going ${to.toLowerCase()}.`);
  }

  // sending work back is a judgement the assignee must be able to read
  if (isRework(from, to) && !String(extra.reason ?? "").trim()) {
    return fail("Say what needs redoing before sending it back.");
  }

  return { ok: true };
}

/**
 * May this person pass judgement on this work? CLAUDE.md rule 4, in one
 * place.
 *
 * Three conditions, and all of them are about identity rather than status:
 * the tier's review floor, maker ≠ checker, and the named reviewer. Marking
 * an engagement Completed asks this, and so does approving a version before
 * it is filed (P3-5) — the same rule, so the same function. Two copies of a
 * maker-checker rule is two rules, and the second one is always the loose
 * one.
 *
 * An A-tier job says a Partner signs it off, and that was not enforced until
 * this check existed: `checkAssignment` stops a CA being *named* as the
 * reviewer of an L3 service, but an engagement with no reviewer named could
 * be completed by any CA.
 *
 * `words` only changes the sentence, never the rule.
 *
 * @param {Actor} actor
 * @param {EngagementLike} engagement
 * @param {{ act?: string, instead?: string, only?: string }} [words]
 */
export function checkReviewer(actor, engagement, words = {}) {
  const act = words.act ?? "sign it off";
  const instead = words.instead ?? "complete it";
  const only = words.only ?? "complete this";

  const floor = engagement.minReviewRole || "ca";
  if (!canReview(actor.role, floor)) {
    return fail(
      `This work needs ${roleName(floor)} to ${act} (${tierLabel(engagement.level) || "its tier"}).`,
    );
  }
  if (String(engagement.assigneeId) === actor.id) {
    return fail(
      `You did this work, so you cannot ${act}. A different CA or Partner must ${instead}.`,
    );
  }
  if (
    engagement.reviewerId &&
    String(engagement.reviewerId) !== actor.id &&
    actor.role !== "partner"
  ) {
    return fail(`Only the named reviewer or a Partner can ${only}.`);
  }
  return { ok: true };
}

/** Returning reviewed work to the maker, which counts against rework. */
export function isRework(from, to) {
  return (
    (from === "Under review" || from === "Filed / delivered") &&
    to === "In progress"
  );
}

/**
 * The statuses to offer this person right now, so a screen never shows a
 * button that the server would refuse.
 * @param {Actor} actor
 * @param {EngagementLike} engagement
 * @returns {string[]}
 */
export function nextStatuses(actor, engagement) {
  return offeredStatuses(actor, engagement)
    .filter((move) => !move.why)
    .map((move) => move.to);
}

/**
 * Every move this status *could* make, each with the reason this person may
 * not make it, or null (P3-8).
 *
 * `nextStatuses` hides what is refused, which is right for a board where a
 * card is dragged between columns. On the engagement itself it is wrong: an
 * employee who sees no Completed button cannot tell the rule from a bug, and
 * the commonest next move is to ask a colleague to try it on their login.
 *
 * The reason comes from `checkStatusChange` — the same function the server
 * calls — so the screen can never explain a rule that is not the rule.
 *
 * @param {Actor} actor
 * @param {EngagementLike} engagement
 * @returns {{ to: string, why: string|null }[]}
 */
export function offeredStatuses(actor, engagement) {
  return (TRANSITIONS[engagement.status] ?? []).map((to) => {
    const check = checkStatusChange(actor, engagement, to, { reason: "probe" });
    return { to, why: check.ok ? null : check.error };
  });
}

/**
 * Can this person still tick tasks and checklist items?
 * @param {Actor} actor
 * @param {EngagementLike} engagement
 */
export function canEditWork(actor, engagement) {
  if (CLOSED_STATUSES.includes(engagement.status)) return false;
  if (!LOCKED_FOR_ASSIGNEE.includes(engagement.status)) return true;
  // under review the work belongs to the reviewer, not the maker
  return isSenior(actor.role) || String(engagement.reviewerId) === actor.id;
}

function fail(error) {
  return { ok: false, error };
}
