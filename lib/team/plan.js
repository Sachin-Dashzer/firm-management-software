// @ts-check

import { startOfISTDay, isWorkingDay, formatISTDate } from "../dates.js";
import { CLOSED_STATUSES } from "../engagements/status.js";
import { isApproved } from "../engagements/gates.js";
import { targets, atRisk } from "../engagements/risk.js";
import { milestoneState, OVERDUE } from "../engagements/milestones.js";
import { tierOf } from "../services/catalog.js";
import { awayOn, coversDay, overlaps, hoursLost } from "./leave.js";

/**
 * The week, person by person, in two lanes (P3-16, spec section 9's
 * workload board).
 *
 * **The two lanes have different dates, and that is the whole point.** A
 * return due on the 20th has a preparation target on the 16th and a review
 * target on the 18th (P3-5), so it belongs to the preparer's week and the
 * reviewer's week — which may be different weeks. A board with one lane per
 * person shows the reviewer nothing until the work arrives, which is the day
 * before the deadline, which is how review becomes a rubber stamp.
 *
 * So a reviewer sees what is **coming at them** as well as what has
 * arrived, and the two are marked apart.
 *
 * **Hours are preparation hours only.** The catalog estimates the effort of
 * doing a job (`effortHours`); nobody has estimated what reviewing one
 * costs, and inventing a fraction of the preparation effort would be a
 * number the firm never agreed to (CLAUDE.md rule 8's habit, applied to a
 * figure rather than a date). The review lane is counted in jobs and the
 * screen says so.
 *
 * Pure: handed engagements, people and leave rows, it returns figures.
 */

const DAY = 86_400_000;

/** The Monday of the IST week this moment falls in. */
export function weekStart(date) {
  const start = startOfISTDay(date);
  // istWeekday: 0 Sunday … 6 Saturday, and the firm's week starts Monday
  const weekday = new Date(start.getTime() + 5.5 * 3_600_000).getUTCDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  return new Date(start.getTime() - back * DAY);
}

/** `{ start, end, label }` for the week holding this moment. End exclusive. */
export function weekOf(date) {
  const start = weekStart(date);
  const end = new Date(start.getTime() + 7 * DAY);
  return {
    start,
    end,
    label: `${formatISTDate(start)} – ${formatISTDate(new Date(end.getTime() - DAY))}`,
  };
}

/** This week and the next few, for the selector. */
export function weeksFrom(now, count = 4) {
  const first = weekStart(now);
  return Array.from({ length: count }, (_, index) =>
    weekOf(new Date(first.getTime() + index * 7 * DAY)),
  );
}

const isOpen = (engagement) => !CLOSED_STATUSES.includes(engagement.status);

/** Working days in a week, for the capacity line. */
function workingDays(week) {
  let days = 0;
  for (let at = week.start.getTime(); at < week.end.getTime(); at += DAY) {
    if (isWorkingDay(new Date(at))) days += 1;
  }
  return days;
}

const inWeek = (date, week) =>
  Boolean(date) &&
  startOfISTDay(new Date(date)).getTime() >= week.start.getTime() &&
  startOfISTDay(new Date(date)).getTime() < week.end.getTime();

/**
 * One job as the board shows it, in whichever lane.
 *
 * @param {any} engagement
 * @param {Date} date the lane's own target date
 * @param {Date} now
 */
function jobOf(engagement, date, now) {
  const overdue = (engagement.milestones ?? []).some(
    (milestone) => milestoneState(milestone, now) === OVERDUE,
  );
  return {
    id: String(engagement._id),
    code: engagement.code,
    service: engagement.templateSnapshot?.name ?? "Work",
    period: engagement.periodLabel || engagement.period || "",
    clientId: String(engagement.clientId ?? ""),
    tier: tierOf(engagement.templateSnapshot?.level) ?? "",
    status: engagement.status,
    target: date ? formatISTDate(date) : "",
    /** The same date as a number, for the "away while this is due" check. */
    targetAt: date ? startOfISTDay(new Date(date)).getTime() : null,
    effortHours: engagement.templateSnapshot?.effortHours ?? null,
    /** Overdue first, then at risk: a job in both lists is counted twice. */
    state: overdue ? "overdue" : atRisk(engagement, now) ? "at risk" : "",
    /** Has it actually reached the reviewer, or is it still being prepared? */
    arrived: engagement.status === "Under review",
  };
}

/**
 * The board for one week.
 *
 * @param {object} input
 * @param {any[]} input.engagements  open work, already branch-scoped
 * @param {Array<{_id: any, name: string, role: string, capacityHours?: number}>} input.people
 * @param {any[]} input.leaves       live leave rows for these people
 * @param {{start: Date, end: Date, label: string}} input.week
 * @param {Date} [input.now]
 */
export function planFor({
  engagements,
  people,
  leaves,
  week,
  now = new Date(),
}) {
  const open = engagements.filter(isOpen);
  const days = workingDays(week);

  const rows = people.map((person) => {
    const id = String(person._id);
    const capacityHours = (person.capacityHours ?? 8) * days;

    const away = leaves.filter((leave) => String(leave.userId) === id);
    const lostHours = away.reduce(
      (sum, leave) => sum + hoursLost(leave, week, person.capacityHours ?? 8),
      0,
    );

    /** @type {any[]} */
    const prepare = [];
    /** @type {any[]} */
    const review = [];

    for (const engagement of open) {
      const t = targets(engagement);
      const fallback = engagement.internalDue ?? null;

      if (
        String(engagement.assigneeId ?? "") === id &&
        !isApproved(engagement)
      ) {
        const date = t?.prepare ?? fallback;
        if (inWeek(date, week)) prepare.push(jobOf(engagement, date, now));
      }

      if (
        String(engagement.reviewerId ?? "") === id &&
        !isApproved(engagement)
      ) {
        const date = t?.review ?? fallback;
        if (inWeek(date, week)) review.push(jobOf(engagement, date, now));
      }
    }

    const known = prepare.filter((job) => typeof job.effortHours === "number");
    const hours = known.reduce((sum, job) => sum + job.effortHours, 0);

    return {
      person: { id, name: person.name, role: person.role },
      capacityHours: Math.max(0, capacityHours - lostHours),
      fullCapacityHours: capacityHours,
      lostHours,
      away: away.map((leave) => ({
        id: String(leave._id),
        from: formatISTDate(leave.from),
        to: formatISTDate(leave.to),
        kind: leave.kind,
        coverId: String(leave.coverId),
      })),
      /**
       * Whose work they are holding at any point in this week — not only
       * on the Monday, because a cover that starts on the Wednesday is
       * exactly the one somebody needs telling about.
       */
      covering: leaves
        .filter(
          (leave) =>
            String(leave.coverId) === id &&
            overlaps(leave, {
              from: week.start,
              to: new Date(week.end.getTime() - DAY),
            }),
        )
        .map((leave) => ({
          userId: String(leave.userId),
          to: formatISTDate(leave.to),
        })),
      prepare: {
        jobs: prepare,
        hours,
        /** How many have an estimate behind them, so the figure can be read. */
        estimated: known.length,
        unestimated: prepare.length - known.length,
      },
      review: {
        jobs: review,
        arrived: review.filter((job) => job.arrived).length,
        coming: review.filter((job) => !job.arrived).length,
      },
      /**
       * Over capacity only where every job in the lane has an estimate.
       * A partial total is a smaller number than the truth, and a board
       * that says "fine" because half the work has no estimate is worse
       * than one that says it cannot tell.
       */
      over:
        prepare.length > 0 &&
        prepare.length === known.length &&
        hours > Math.max(0, capacityHours - lostHours),
    };
  });

  /**
   * Spec section 9's warning, in the week it matters: somebody is away and
   * has work landing while they are gone.
   */
  const warnings = [];
  for (const row of rows) {
    if (!row.away.length) continue;
    const mine = leaves.filter(
      (leave) => String(leave.userId) === row.person.id,
    );
    /**
     * Not "has work this week" — **has work due on a day they are not
     * there**. A job whose target falls on the Friday they are back is
     * their own problem and does not need a warning.
     */
    const due = [...row.prepare.jobs, ...row.review.jobs].filter(
      (job) =>
        job.targetAt !== null &&
        mine.some((leave) => coversDay(leave, new Date(job.targetAt))),
    );
    if (!due.length) continue;
    warnings.push({
      userId: row.person.id,
      name: row.person.name,
      away: row.away,
      count: due.length,
    });
  }

  /** Work with no date at all — an unconfirmed due-date rule, usually. */
  const unscheduled = open.filter((engagement) => {
    const t = targets(engagement);
    return !t && !engagement.internalDue;
  }).length;

  return { week, days, rows, warnings, unscheduled };
}

/**
 * Who is away today and who is holding their work, for the strip at the top
 * of the board and the team list.
 *
 * @param {any[]} leaves
 * @param {Date} [now]
 */
export function awayToday(leaves, now = new Date()) {
  return [...awayOn(leaves, now).values()].map((leave) => ({
    id: String(leave._id),
    userId: String(leave.userId),
    coverId: String(leave.coverId),
    kind: leave.kind,
    from: formatISTDate(leave.from),
    to: formatISTDate(leave.to),
  }));
}
