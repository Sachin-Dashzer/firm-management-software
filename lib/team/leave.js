// @ts-check

import {
  startOfISTDay,
  istInputDate,
  isWorkingDay,
  istDate,
  istWeekday,
} from "../dates.js";

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
 * The cycle (owner decision, 01-11-2026): applied for, then decided.
 *
 * There is no "Withdrawn" — withdrawing is a soft delete like everything
 * else in this application (CLAUDE.md rule 3), so a withdrawn leave leaves
 * the lists rather than sitting in them as a fourth state nobody filters
 * out.
 */
export const LEAVE_STATUSES = ["Pending", "Approved", "Declined"];

/**
 * **The filter every query that means "is this person away" must carry.**
 *
 * Before the cycle existed, a `Leave` row *was* an absence, so four places
 * read the collection with nothing but dates: Issues (whose rows a cover
 * sees), the week plan (whose capacity is reduced), the take-over screen,
 * and the staff mailer (who gets a copy). A pending application is not an
 * absence — and because an applicant may suggest a cover, a pending row can
 * carry a `coverId`, which is exactly what would have handed somebody's
 * Issues and their mail to a colleague over leave nobody had approved.
 *
 * `$nin` is deliberate rather than `status: "Approved"`: it matches a
 * document where the field is **missing**, which is every row written before
 * 01-11-2026 — the same reading as `statusOf`.
 */
export const APPROVED_LEAVE = { status: { $nin: ["Pending", "Declined"] } };

/**
 * What state a row is in, including the rows that predate the cycle.
 *
 * Leave recorded before 01-11-2026 has no `status` field: under the
 * decision of 27-10-2026 a partner recorded it and that *was* the approval,
 * so a missing status means approved. Reading it anywhere else than through
 * here is how an old absence silently becomes a pending request.
 *
 * @param {{status?: string}} leave
 * @returns {"Pending"|"Approved"|"Declined"}
 */
export function statusOf(leave) {
  const status = leave?.status;
  return LEAVE_STATUSES.includes(status) ? status : "Approved";
}

/** Is this row an absence that is actually going to happen? */
export function isApproved(leave) {
  return statusOf(leave) === "Approved";
}

/**
 * How many days an absence covers, both ends counted.
 *
 * @param {{from: Date|string, to: Date|string}} leave
 */
export function leaveDays(leave) {
  const from = startOfISTDay(new Date(leave.from)).getTime();
  const to = startOfISTDay(new Date(leave.to)).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

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
 * @param {boolean} [input.requireCover] false while it is only an application
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
  requireCover = true,
}) {
  if (!userId) return { ok: false, error: "Whose leave is it?" };
  if (requireCover && !coverId) {
    return {
      ok: false,
      error:
        "Name who holds their work. An absence with nobody named is the state the firm is already in, and it is the one that loses a return.",
    };
  }
  if (coverId && String(coverId) === String(userId)) {
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

  const coverAway =
    coverId &&
    live.find(
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

/**
 * The attendance month: every person, every day (owner request, 01-11-2026).
 *
 * **Where a day's mark comes from.** This application has no clock-in and no
 * attendance register, so it cannot say somebody was *present* — and a grid
 * that printed "P" for every day nobody had recorded anything would be an
 * invention of exactly the kind rule 8 forbids. What the firm does have is
 * two real facts: the timesheet (`/team/time`, minutes against a day) and
 * approved leave. So each day reads:
 *
 *  - `worked`   — they logged time on it, and the cell carries the minutes
 *  - `leave`    — approved leave covers it
 *  - `weekend`  — Saturday or Sunday, whoever was away
 *  - `blank`    — a working day with nothing recorded either way. **Not
 *                 "absent".** It is "nothing was logged", which on a day
 *                 somebody was in the office and forgot the timesheet is
 *                 the truth and "absent" is a lie about a colleague.
 *  - `future`   — not reached yet
 *
 * **Logged time beats leave** when both exist on a day: a timesheet line is
 * evidence and a leave is a plan, and somebody who worked through two days
 * of their own holiday should see those two days as worked. The cell keeps
 * `onLeave` so the screen can say so.
 *
 * The firm's holiday list is deliberately not in here, for the same reason
 * `isWorkingDay` gives: nobody has verified one (rule 8).
 *
 * Pure: handed rows, returns a grid.
 *
 * @param {object} input
 * @param {{_id: any, name: string, role?: string}[]} input.people
 * @param {any[]} input.leaves   every leave touching the month, any status
 * @param {{userId: any, on: Date|string, minutes?: number}[]} input.time
 * @param {number} input.year
 * @param {number} input.month   1-12
 * @param {Date} [input.now]
 */
export function attendanceMonth({
  people,
  leaves,
  time,
  year,
  month,
  now = new Date(),
}) {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = startOfISTDay(now).getTime();

  const days = [];
  for (let day = 1; day <= count; day += 1) {
    const date = istDate(year, month, day);
    days.push({
      day,
      date,
      /** 0 Sunday to 6 Saturday, for the Indian calendar day. */
      weekday: istWeekday(date),
      weekend: !isWorkingDay(date),
      future: date.getTime() > today,
      today: date.getTime() === today,
    });
  }

  /** minutes logged, as `userId|YYYY-MM-DD → minutes`. */
  const logged = new Map();
  for (const entry of time ?? []) {
    const key = `${String(entry.userId)}|${istInputDate(entry.on)}`;
    logged.set(key, (logged.get(key) ?? 0) + (entry.minutes ?? 0));
  }

  const approved = (leaves ?? []).filter(isApproved);

  const rows = people.map((person) => {
    const id = String(person._id);
    const mine = approved.filter((leave) => String(leave.userId) === id);

    let workedDays = 0;
    let workedMinutes = 0;
    let leaveDaysCount = 0;
    let blankDays = 0;

    const cells = days.map((slot) => {
      const minutes = logged.get(`${id}|${istInputDate(slot.date)}`) ?? 0;
      const leave = mine.find((row) => coversDay(row, slot.date));

      if (minutes > 0) {
        workedDays += 1;
        workedMinutes += minutes;
        return {
          kind: "worked",
          minutes,
          onLeave: Boolean(leave),
          weekend: slot.weekend,
        };
      }
      if (slot.weekend) return { kind: "weekend" };
      if (leave) {
        leaveDaysCount += 1;
        return { kind: "leave", leaveKind: leave.kind, note: leave.note ?? "" };
      }
      if (slot.future) return { kind: "future" };
      blankDays += 1;
      return { kind: "blank" };
    });

    return {
      userId: id,
      name: person.name,
      role: person.role ?? "",
      cells,
      workedDays,
      workedMinutes,
      leaveDays: leaveDaysCount,
      blankDays,
    };
  });

  return { days, rows };
}
