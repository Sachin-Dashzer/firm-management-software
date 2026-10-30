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

/** `26 Oct` — a date in a column where the year is the same on every row. */
const SHORT_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "numeric",
  month: "short",
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
 * The short form, for a date sitting in a column of its own (P3-34).
 *
 * `26 Oct` across the top of a heatmap, `2 Nov` in a chip. The long form
 * stays `DD-MM-YYYY` everywhere a date is a record — this is for the
 * places where the year is the same on every row and printing it four
 * hundred times only makes the column wider.
 *
 * @param {Date} date
 * @returns {string} e.g. "26 Oct"
 */
export function formatISTShort(date) {
  return SHORT_FMT.format(date).replace(/,/g, "");
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
 * The quarter of the financial year a day falls in: Q1 is April to June,
 * Q4 is January to March (P3-22b).
 *
 * TDS is matched against Form 26AS a quarter at a time, because that is how
 * the deductor files it, so the TDS list groups by this rather than by the
 * calendar quarter a date would otherwise suggest.
 *
 * @param {Date} date
 * @returns {string} e.g. "Q3 2026-27"
 */
export function financialQuarterLabel(date) {
  const { month } = istParts(date);
  const quarter = Math.floor(((month + 8) % 12) / 3) + 1;
  return `Q${quarter} ${financialYearLabel(date)}`;
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

/**
 * The UTC instant of 00:00 IST on an Indian calendar date. Due dates are a
 * day, not a moment, so they are all stored at the start of that IST day.
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day
 * @returns {Date}
 */
export function istDate(year, month, day) {
  // IST is UTC+5:30 all year round, so 00:00 IST is 18:30 UTC the day before
  return new Date(Date.UTC(year, month - 1, day - 1, 18, 30));
}

/** The IST midnight at the start of the day this moment falls on. */
export function startOfISTDay(date) {
  const { day, month, year } = istParts(date);
  return istDate(year, month, day);
}

/**
 * A date the way `<input type="date">` wants it, for the Indian calendar day
 * it actually falls on.
 *
 * `toISOString().slice(0, 10)` looks like it does this and does not: a date
 * stored at IST midnight is 18:30 UTC the *previous* day, so the naive form
 * fills every date box with yesterday, and buckets work into the wrong day
 * of the month view. Anything that turns a stored date back into a date
 * input or a day bucket goes through here.
 *
 * @param {Date|string|null|undefined} date
 * @returns {string} `YYYY-MM-DD`, or "" when there is no date
 */
export function istInputDate(date) {
  if (!date) return "";
  const { day, month, year } = istParts(new Date(date));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 0 Sunday to 6 Saturday, for the Indian calendar day this moment falls on.
 * @param {Date} date
 */
/**
 * The hour of the IST day, 0–23 (P3-10).
 *
 * Arithmetic rather than a formatter: IST is a fixed +05:30 with no summer
 * time, so the offset is exact, and `istParts` is a date-only formatter that
 * would have to grow a second one to answer this.
 *
 * @param {Date} date
 * @returns {number}
 */
export function istHour(date) {
  const ist = new Date(date.getTime() + 5.5 * 3_600_000);
  return ist.getUTCHours();
}

export function istWeekday(date) {
  const { day, month, year } = istParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Saturdays and Sundays are not working days.
 *
 * Public holidays are not here: the firm's holiday list belongs with the
 * due-date master in Step 7, and guessing one would quietly move every
 * internal deadline (CLAUDE.md rule 8).
 * @param {Date} date
 */
export function isWorkingDay(date) {
  const weekday = istWeekday(date);
  return weekday !== 0 && weekday !== 6;
}

/**
 * Add working days to a date, landing on the start of an IST day.
 * `addWorkingDays(friday, 1)` is the following Monday.
 * @param {Date} from
 * @param {number} days
 * @returns {Date}
 */
export function addWorkingDays(from, days) {
  let result = startOfISTDay(from);
  let left = Math.max(0, Math.trunc(days));
  while (left > 0) {
    result = new Date(result.getTime() + 24 * 60 * 60 * 1000);
    if (isWorkingDay(result)) left -= 1;
  }
  return result;
}

/**
 * Whole Indian calendar days from today to a date: 0 is today, negative is
 * overdue. This drives the green / amber / red ageing in spec section 5.
 * @param {Date} date
 * @param {Date} [now]
 * @returns {number}
 */
export function daysUntil(date, now = new Date()) {
  const ms = startOfISTDay(date).getTime() - startOfISTDay(now).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
