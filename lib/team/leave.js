// @ts-check

import { startOfISTDay, istInputDate, isWorkingDay } from "../dates.js";

/**
 * Who is away, who is holding their work, and what that costs the week
 * (P3-16, spec section 9's leave calendar).
 *
 * Pure. It is handed leave rows and a day and answers questions; the
 * queries live in the pages and the actions. The arithmetic is here because
 * it is the part that goes wrong quietly — an off-by-one on the last day of
 * leave means somebody's work has no owner on exactly the day they are not
 * there to notice.
 *
 * **Both ends of a leave count.** "Away from the 10th to the 14th" includes
 * the 14th, which is what everybody means when they say it.
 *
 * **One hop, never a chain.** A cover may not themselves be away during the
 * leave, which is the rule that keeps "who holds this work today" to one
 * answer. Without it, A covered by B covered by C is a question nobody can
 * answer at a glance, and the glance is the whole point.
 */

/** The two kinds spec section 9 names. Exam leave is an articleship matter. */
export const LEAVE_KINDS = ["Leave", "Exam leave"];

/**
 * Is this leave in force on this day?
 *
 * @param {{from: Date|string, to: Date|string}} leave
 * @param {Date} day
 */
export function coversDay(leave, day) {
  const at = startOfISTDay(day).getTime();
  return (
    startOfISTDay(new Date(leave.from)).getTime() <= at &&
    startOfISTDay(new Date(leave.to)).getTime() >= at
  );
}

/**
 * Do two ranges touch at all? Used for the overlap checks, which are the
 * only reason a leave is ever refused on dates.
 *
 * @param {{from: Date|string, to: Date|string}} a
 * @param {{from: Date|string, to: Date|string}} b
 */
export function overlaps(a, b) {
  return (
    startOfISTDay(new Date(a.from)).getTime() <=
      startOfISTDay(new Date(b.to)).getTime() &&
    startOfISTDay(new Date(a.to)).getTime() >=
      startOfISTDay(new Date(b.from)).getTime()
  );
}

/**
 * Everybody away on one day, as `userId → leave`.
 *
 * @param {any[]} leaves
 * @param {Date} day
 */
export function awayOn(leaves, day) {
  const map = new Map();
  for (const leave of leaves) {
    if (!coversDay(leave, day)) continue;
    const id = String(leave.userId);
    if (!map.has(id)) map.set(id, leave);
  }
  return map;
}

/**
 * Whose work this person is holding on this day.
 *
 * @param {any[]} leaves
 * @param {string} userId the cover
 * @param {Date} day
 * @returns {any[]} the leaves they are covering
 */
export function coveringOn(leaves, userId, day) {
  const id = String(userId);
  return leaves.filter(
    (leave) => String(leave.coverId) === id && coversDay(leave, day),
  );
}

/**
 * How many hours of this person's week the absence takes away.
 *
 * Working days only, and the firm's own holiday list is deliberately not in
 * it — `isWorkingDay` says why (CLAUDE.md rule 8).
 *
 * @param {{from: Date|string, to: Date|string}} leave
 * @param {{start: Date, end: Date}} week  end exclusive
 * @param {number} capacityHours per working day
 */
export function hoursLost(leave, week, capacityHours) {
  let lost = 0;
  for (
    let at = startOfISTDay(week.start).getTime();
    at < startOfISTDay(week.end).getTime();
    at += 86_400_000
  ) {
    const day = new Date(at);
    if (!isWorkingDay(day)) continue;
    if (coversDay(leave, day)) lost += capacityHours;
  }
  return lost;
}

/**
 * Can this leave be recorded?
 *
 * Everything here is refused in the server action as well as hidden on the
 * screen. The two rules worth reading twice:
 *
 *  - **the cover may not be away themselves** for any day of it, which is
 *    both the obvious mistake and the thing that keeps cover one hop deep
 *  - **a person cannot be away twice over the same day**, because then
 *    "who covers them" has two answers
 *
 * @param {object} input
 * @param {string} input.userId
 * @param {string} input.coverId
 * @param {Date|string} input.from
 * @param {Date|string} input.to
 * @param {any[]} input.leaves      every live leave for either person
 * @param {string} [input.ignoreId] a leave being replaced
 * @param {{name?: string}} [input.person]
 * @param {{name?: string}} [input.cover]
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function checkLeave({
  userId,
  coverId,
  from,
  to,
  leaves,
  ignoreId = "",
  person = {},
  cover = {},
}) {
  if (!userId) return { ok: false, error: "Whose leave is it?" };
  if (!coverId) {
    return {
      ok: false,
      error:
        "Name who holds their work. An absence with nobody named is the state the firm is already in, and it is the one that loses a return.",
    };
  }
  if (String(coverId) === String(userId)) {
    return {
      ok: false,
      error: "Somebody cannot cover for themselves while they are away.",
    };
  }

  const start = startOfISTDay(new Date(from));
  const end = startOfISTDay(new Date(to));
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return { ok: false, error: "Those are not dates." };
  }
  if (end.getTime() < start.getTime()) {
    return { ok: false, error: "The last day is before the first day." };
  }

  const range = { from: start, to: end };
  const live = leaves.filter(
    (row) => String(row._id ?? "") !== String(ignoreId),
  );

  const clash = live.find(
    (row) => String(row.userId) === String(userId) && overlaps(row, range),
  );
  if (clash) {
    return {
      ok: false,
      error: `${person.name ?? "That person"} is already recorded as away from ${istInputDate(clash.from)} to ${istInputDate(clash.to)}. Change that one instead of adding a second — two absences over one day means two answers to who covers.`,
    };
  }

  const coverAway = live.find(
    (row) => String(row.userId) === String(coverId) && overlaps(row, range),
  );
  if (coverAway) {
    return {
      ok: false,
      error: `${cover.name ?? "That person"} is away themselves from ${istInputDate(coverAway.from)} to ${istInputDate(coverAway.to)}. A cover who is also away is how work ends up with nobody — name somebody who is here.`,
    };
  }

  return { ok: true };
}
