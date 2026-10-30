// @ts-check

import { CLOSED_STATUSES } from "../engagements/status.js";
import { tierOf, TIERS } from "../services/catalog.js";

/**
 * Counting what is on somebody's desk (spec sections 9 and 10).
 *
 * Pure: it is handed engagements and a moment and returns figures. The
 * queries live in the pages, the arithmetic lives here, and the arithmetic is
 * what goes wrong quietly — a person shown as having nothing overdue when
 * they have four is the kind of mistake nobody reports because it looks fine.
 */

/**
 * How many open jobs one person can hold before the firm should look at it
 * (P3-34 phase 3).
 *
 * A constant, not a setting, **until the owner says otherwise** (D-C). It
 * is the marker on every team-load bar, and the marker is the whole point
 * of that panel: a bar scaled to the busiest person says only that
 * somebody is busiest, which everybody already knows. Scaled past a line
 * drawn at the limit, the same bar says who is over it and by how much.
 *
 * Ten is the reference's own figure and is not a measurement of this firm.
 * When it becomes `FirmSettings.comfortJobLimit` this stays as the default.
 */
export const COMFORT_JOB_LIMIT = 10;

/**
 * Who to move work to, and how much — or nothing at all.
 *
 * Pure, and tested, because it is the one line on the dashboard that tells
 * a partner to *do* something to a colleague. Getting it wrong by naming
 * somebody who is also over the limit turns a useful sentence into a bad
 * instruction.
 *
 * The target is the person with the lowest load who has room for the whole
 * move. If nobody has that much room the least-loaded person is named
 * anyway: the suggestion is a conversation starter, and "move two to
 * whoever has most room" is still the right conversation.
 *
 * @param {Array<{id: string, name: string, load: number}>} rows
 * @param {number} limit
 * @returns {{from: string, to: string, jobs: number} | null}
 */
export function rebalanceHint(rows, limit) {
  if (!Array.isArray(rows) || rows.length < 2) return null;

  const busiest = rows.reduce((worst, row) =>
    row.load > worst.load ? row : worst,
  );
  const move = busiest.load - limit;
  if (move <= 0) return null;

  const others = rows
    .filter((row) => row.id !== busiest.id)
    .sort((a, b) => a.load - b.load);
  if (others.length === 0) return null;

  const target = others.find((row) => limit - row.load >= move) ?? others[0];

  // moving work to somebody who is also over the limit is not a suggestion
  if (target.load >= limit) return null;

  return { from: busiest.name, to: target.name, jobs: move };
}

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
    /**
     * Open work by tier (owner decision D4), from each engagement's own
     * snapshot. Three counts, not a weighted score: what the firm wants to
     * see is who is carrying the crucial work, and a single "load index"
     * would hide exactly that.
     */
    byTier: tierCounts(open),
  };
}

/**
 * @param {any[]} engagements
 * @returns {{A: number, B: number, C: number}}
 */
export function tierCounts(engagements) {
  const counts = Object.fromEntries(TIERS.map((tier) => [tier, 0]));
  for (const engagement of engagements) {
    const tier = tierOf(engagement.templateSnapshot?.level);
    if (tier) counts[tier] += 1;
  }
  return /** @type {{A: number, B: number, C: number}} */ (counts);
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
