// @ts-check

/**
 * Dates are stored in UTC and shown in IST (Asia/Kolkata) as DD-MM-YYYY.
 * The financial year runs 1 April to 31 March.
 *
 * Formatting uses Intl with an explicit time zone rather than the server's
 * clock, so a Vercel function in any region shows the same Indian date.
 */

export const IST = "Asia/Kolkata";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * The calendar day/month/year a moment falls on in IST.
 * @param {Date} date
 * @returns {{ day: number, month: number, year: number }} month is 1–12
 */
export function istParts(date) {
  const parts = Object.fromEntries(
    DATE_FMT.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    day: Number(parts.day),
    month: Number(parts.month),
    year: Number(parts.year),
  };
}

/**
 * @param {Date} date
 * @returns {string} e.g. "16-10-2026"
 */
export function formatISTDate(date) {
  return DATE_FMT.format(date).replace(/\//g, "-");
}

/**
 * @param {Date} date
 * @returns {string} e.g. "16-10-2026 14:30"
 */
export function formatISTDateTime(date) {
  return DATETIME_FMT.format(date).replace(/\//g, "-").replace(",", "");
}

/**
 * The calendar year the financial year starts in: April 2026 → 2026,
 * March 2027 → 2026.
 * @param {Date} date
 * @returns {number}
 */
export function financialYearStart(date) {
  const { month, year } = istParts(date);
  return month >= 4 ? year : year - 1;
}

/**
 * @param {Date} date
 * @returns {string} e.g. "2026-27"
 */
export function financialYearLabel(date) {
  const start = financialYearStart(date);
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * First and last instant of the financial year containing `date`,
 * as UTC moments for 1 April 00:00 IST and 1 April next year 00:00 IST.
 * The end is exclusive, which is what range queries want.
 * @param {Date} date
 * @returns {{ start: Date, end: Date }}
 */
export function financialYearRange(date) {
  const y = financialYearStart(date);
  // IST is UTC+5:30 year round (no daylight saving), so 1 Apr 00:00 IST is
  // 31 Mar 18:30 UTC.
  return {
    start: new Date(Date.UTC(y, 2, 31, 18, 30)),
    end: new Date(Date.UTC(y + 1, 2, 31, 18, 30)),
  };
}
