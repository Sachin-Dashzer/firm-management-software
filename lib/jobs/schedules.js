// @ts-check

import { istParts, istDate, istWeekday } from "../dates.js";

/**
 * The recurring work, defined in code (spec section 14).
 *
 * The runner offers every schedule to the queue on each pass; a `uniqueKey`
 * built from the schedule and the moment it was due means the second,
 * third and sixtieth offer that day collide harmlessly with the unique
 * index. So nothing needs to remember what has been queued, and a cron run
 * that fails or fires late still catches up at the next one.
 *
 * Times are IST, because the firm's day is.
 *
 * @typedef {object} Schedule
 * @property {string} key    stable name, used in the unique key
 * @property {string} type   the job handler to run
 * @property {string} at     "HH:MM" in IST
 * @property {number} [dow]  0 Sunday – 6 Saturday, for the weekly ones
 * @property {string} [rule] the notification rule whose time overrides `at`
 * @property {object} [payload]
 * @property {string} [why]  one line for the admin screen
 */

/** @type {Schedule[]} */
export const SCHEDULES = [
  {
    key: "purge-recycle-bin",
    type: "purgeRecycleBin",
    at: "02:40",
    why: "Erases files that have been in the recycle bin for 90 days.",
  },
  {
    key: "generate-recurring",
    type: "generateRecurring",
    at: "01:30",
    why: "Creates next period's recurring filings, a fortnight before they are due.",
  },
  {
    key: "expire-grants",
    type: "expireGrants",
    at: "02:10",
    why: "Switches off client access grants that have reached their end date. They already stop working on the date itself; this tidies the access list.",
  },
  {
    key: "reminders",
    type: "reminders",
    at: "08:00",
    why: "Sends the reminders due today: dates coming up, overdue work, documents awaited, unpaid invoices.",
  },
  {
    key: "daily-digest",
    type: "dailyDigest",
    at: "09:00",
    rule: "dailyDigest",
    why: "Emails every member of staff their day: due today, overdue, awaiting their review.",
  },
  {
    key: "weekly-summary",
    type: "weeklySummary",
    at: "09:00",
    dow: 1,
    rule: "weeklySummary",
    why: "Monday morning summary for the partners.",
  },
];

/**
 * The most recent moment this schedule was due, at or before `now`.
 *
 * With a `dow` it walks back to the last matching weekday, so a weekly
 * schedule is genuinely weekly rather than a daily job that does nothing
 * six days out of seven.
 *
 * @param {Schedule} schedule
 * @param {Date} [now]
 * @param {string} [at] overrides the schedule's own time
 * @returns {Date}
 */
export function lastDueAt(schedule, now = new Date(), at = schedule.at) {
  const [hour, minute] = String(at ?? schedule.at)
    .split(":")
    .map(Number);
  const { day, month, year } = istParts(now);

  let due = new Date(
    istDate(year, month, day).getTime() + (hour * 60 + minute) * 60_000,
  );
  // not yet today, so the last one was yesterday
  if (due > now) due = new Date(due.getTime() - 24 * 60 * 60 * 1000);

  if (schedule.dow !== undefined) {
    let guard = 7;
    while (istWeekday(due) !== schedule.dow && guard > 0) {
      due = new Date(due.getTime() - 24 * 60 * 60 * 1000);
      guard -= 1;
    }
  }

  return due;
}

/**
 * What to offer the queue on this pass: one entry per schedule, each with
 * the key that makes a repeat offer a no-op.
 *
 * @param {Date} [now]
 * @param {Record<string, string>} [times] the firm's own times for the
 *        schedules that have a notification rule behind them
 */
export function dueSchedules(now = new Date(), times = {}) {
  return SCHEDULES.map((schedule) => {
    const at = (schedule.rule && times[schedule.rule]) || schedule.at;
    const due = lastDueAt(schedule, now, at);
    return {
      ...schedule,
      at,
      due,
      uniqueKey: `${schedule.key}@${due.toISOString()}`,
    };
  });
}
