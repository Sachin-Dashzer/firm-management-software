// @ts-check

import { istDate, istParts, financialYearStart } from "../dates.js";

/**
 * The period an engagement covers: one month, one quarter, one half or one
 * financial year (spec section 5 — "one service for one client for one
 * period").
 *
 * Quarters and halves follow the Indian financial year, not the calendar:
 * Q1 is April–June, H1 is April–September. The code is sortable text, which
 * is what the engagement code and every period filter use.
 *
 * @typedef {object} Period
 * @property {string} code   e.g. "2026-10", "2026-Q3", "FY2026-27"
 * @property {string} label  e.g. "Oct 2026", "Q3 FY 2026-27", "FY 2026-27"
 * @property {Date} start    00:00 IST on the first day
 * @property {Date} end      00:00 IST on the day after the last (exclusive)
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const HALF_DAY = 12 * 60 * 60 * 1000;

/** @param {number} fyStart */
function fyLabel(fyStart) {
  return `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
}

/** Months since year zero, so month arithmetic never wraps wrongly. */
function addMonths(year, month, n) {
  const index = year * 12 + (month - 1) + n;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Quarter 1-4 of the Indian financial year for a calendar month 1-12. */
function fyQuarter(month) {
  return Math.floor(((month + 8) % 12) / 3) + 1;
}

/** The calendar month 1-12 that quarter 1-4 of the financial year starts in. */
function quarterStartMonth(quarter) {
  return (((quarter - 1) * 3 + 3) % 12) + 1;
}

/** @param {number} year @param {number} month 1-12 */
function monthPeriod(year, month) {
  const next = addMonths(year, month, 1);
  return {
    code: `${year}-${String(month).padStart(2, "0")}`,
    label: `${MONTHS[month - 1]} ${year}`,
    start: istDate(year, month, 1),
    end: istDate(next.year, next.month, 1),
  };
}

/** @param {number} fyStart @param {number} quarter 1-4 */
function quarterPeriod(fyStart, quarter) {
  const startMonth = quarterStartMonth(quarter);
  const startYear = quarter === 4 ? fyStart + 1 : fyStart;
  const last = addMonths(startYear, startMonth, 2);
  const end = addMonths(startYear, startMonth, 3);
  return {
    code: `${fyStart}-Q${quarter}`,
    label: `Q${quarter} FY ${fyLabel(fyStart)} (${MONTHS[startMonth - 1]}–${
      MONTHS[last.month - 1]
    } ${last.year})`,
    start: istDate(startYear, startMonth, 1),
    end: istDate(end.year, end.month, 1),
  };
}

/** @param {number} fyStart @param {1|2} half */
function halfPeriod(fyStart, half) {
  return half === 1
    ? {
        code: `${fyStart}-H1`,
        label: `H1 FY ${fyLabel(fyStart)} (Apr–Sep ${fyStart})`,
        start: istDate(fyStart, 4, 1),
        end: istDate(fyStart, 10, 1),
      }
    : {
        code: `${fyStart}-H2`,
        label: `H2 FY ${fyLabel(fyStart)} (Oct ${fyStart}–Mar ${fyStart + 1})`,
        start: istDate(fyStart, 10, 1),
        end: istDate(fyStart + 1, 4, 1),
      };
}

/** @param {number} fyStart */
function yearPeriod(fyStart) {
  return {
    code: `FY${fyLabel(fyStart)}`,
    label: `FY ${fyLabel(fyStart)}`,
    start: istDate(fyStart, 4, 1),
    end: istDate(fyStart + 1, 4, 1),
  };
}

/**
 * The period a date falls in, for a given recurrence.
 *
 * A one-time service has no natural period, so it is filed under the
 * financial year it starts in — otherwise one-off work could not be grouped,
 * filtered or found again next year.
 *
 * @param {string} recurrence
 * @param {Date} [date]
 * @returns {Period}
 */
export function periodFor(recurrence, date = new Date()) {
  const { month, year } = istParts(date);
  const fy = financialYearStart(date);

  switch (recurrence) {
    case "monthly":
      return monthPeriod(year, month);
    case "quarterly":
      return quarterPeriod(fy, fyQuarter(month));
    case "half-yearly":
      return halfPeriod(fy, month >= 4 && month <= 9 ? 1 : 2);
    case "annual":
    case "one-time":
      return yearPeriod(fy);
    default:
      throw new Error(`Unknown recurrence: ${recurrence}`);
  }
}

/**
 * Read a stored period code back into dates and a label, so an engagement
 * created last year still describes itself correctly.
 * @param {string} code
 * @returns {Period}
 */
export function parsePeriod(code) {
  let match;
  if ((match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(code))) {
    return monthPeriod(Number(match[1]), Number(match[2]));
  }
  if ((match = /^(\d{4})-Q([1-4])$/.exec(code))) {
    return quarterPeriod(Number(match[1]), Number(match[2]));
  }
  if ((match = /^(\d{4})-H([12])$/.exec(code))) {
    return halfPeriod(Number(match[1]), /** @type {1|2} */ (Number(match[2])));
  }
  if ((match = /^FY(\d{4})-\d{2}$/.exec(code))) {
    return yearPeriod(Number(match[1]));
  }
  throw new Error(`Not a period code: ${code}`);
}

/**
 * Periods to offer when creating an engagement: the next one, the current
 * one, and four back — monthly work is usually filed for the month just
 * gone.
 *
 * Each step lands half a day inside the neighbouring window rather than
 * counting days, so a 28-day February cannot skip a month.
 *
 * @param {string} recurrence
 * @param {Date} [around]
 * @returns {Period[]}
 */
export function periodOptions(recurrence, around = new Date()) {
  const current = periodFor(recurrence, around);
  const next = periodFor(
    recurrence,
    new Date(current.end.getTime() + HALF_DAY),
  );

  const out = [next, current];
  let cursor = current;
  for (let i = 0; i < 4; i += 1) {
    cursor = periodFor(recurrence, new Date(cursor.start.getTime() - HALF_DAY));
    out.push(cursor);
  }
  return out;
}
