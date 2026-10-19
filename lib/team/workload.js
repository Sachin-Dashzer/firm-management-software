// @ts-check

import { CLOSED_STATUSES } from "../engagements/status.js";

/**
 * Counting what is on somebody's desk (spec sections 9 and 10).
 *
 * Pure: it is handed engagements and a moment and returns figures. The
 * queries live in the pages, the arithmetic lives here, and the arithmetic is
 * what goes wrong quietly — a person shown as having nothing overdue when
 * they have four is the kind of mistake nobody reports because it looks fine.
 */

/** Work that is still somebody's problem. */
export function isOpen(engagement) {
  return !CLOSED_STATUSES.includes(engagement.status);
}

/**
 * Is this engagement past its date? The statutory date governs where there is
 * one, the firm's own target otherwise — the same rule as the engagement's
 * `dueDate` virtual and the list chips.
 */
export function isOverdue(engagement, now = new Date()) {
  if (!isOpen(engagement)) return false;
  const due = engagement.statutoryDue ?? engagement.internalDue ?? null;
  return Boolean(due && new Date(due) < now);
}

/**
 * One person's load.
 *
 * `asAssignee` and `asReviewer` are counted apart, because a CA with thirty
 * engagements to review and none to do is not the same as an employee with
 * thirty to do — and one number for both would hide the difference.
 *
 * @param {{status: string, statutoryDue?: Date|null, internalDue?: Date|null, assigneeId?: any, reviewerId?: any, reworkCount?: number}[]} engagements
 * @param {string} userId
 * @param {Date} [now]
 */
export function loadFor(engagements, userId, now = new Date()) {
  const id = String(userId);
  const mine = engagements.filter((e) => String(e.assigneeId ?? "") === id);
  const theirs = engagements.filter((e) => String(e.reviewerId ?? "") === id);

  const open = mine.filter(isOpen);

  return {
    asAssignee: open.length,
    asReviewer: theirs.filter(isOpen).length,
    overdue: mine.filter((e) => isOverdue(e, now)).length,
    awaitingMyReview: theirs.filter((e) => e.status === "Under review").length,
    sentForReview: open.filter((e) => e.status === "Under review").length,
    awaitingDocuments: open.filter((e) => e.status === "Awaiting documents")
      .length,
    completed: mine.filter((e) => e.status === "Completed").length,
    /**
     * Work that came back from review, totalled rather than averaged.
     * "3 of 12" and "30 of 120" are different conversations, so the figure is
     * reported as a count beside a count and never as a percentage — the same
     * decision as the CA dashboard in Step 10.
     */
    rework: mine.reduce((sum, e) => sum + (e.reworkCount ?? 0), 0),
    reworked: mine.filter((e) => (e.reworkCount ?? 0) > 0).length,
    total: mine.length,
  };
}

/**
 * The same figures for a list of people in one pass, so a team list of twenty
 * runs one query rather than twenty.
 *
 * @param {any[]} engagements
 * @param {string[]} userIds
 * @param {Date} [now]
 * @returns {Map<string, ReturnType<typeof loadFor>>}
 */
export function loadForEach(engagements, userIds, now = new Date()) {
  return new Map(
    userIds.map((id) => [String(id), loadFor(engagements, id, now)]),
  );
}

/**
 * Group a person's work by status, in pipeline order, for the Work tab.
 *
 * @param {any[]} engagements
 * @param {string[]} order the pipeline, from lib/engagements/status.js
 */
export function groupByStatus(engagements, order) {
  const groups = new Map(order.map((status) => [status, []]));
  for (const engagement of engagements) {
    if (!groups.has(engagement.status)) groups.set(engagement.status, []);
    groups.get(engagement.status).push(engagement);
  }
  // an empty status is not worth a heading
  return [...groups.entries()].filter(([, rows]) => rows.length > 0);
}
