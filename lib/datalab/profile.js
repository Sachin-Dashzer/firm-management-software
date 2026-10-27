// @ts-check

import { parseCSV } from "../csv.js";

/**
 * Reading a spreadsheet the firm was sent (P3-20).
 *
 * **It profiles; it does not interpret.** It cannot know that column F is
 * a voucher number unless somebody says so, and a tool that guesses is a
 * tool that quietly analyses the wrong column and reports with confidence.
 * So this says what each column *looks* like, and a person maps them
 * before a single check runs.
 *
 * Spec §1 puts the accounting ledger out of scope, and this keeps it
 * there: the firm's own software does the accounting, and this reads a
 * file somebody exported from it. Nothing is stored — the rows are read in
 * the request and thrown away (D66).
 */

/** How many rows are enough to tell what a column is. */
const SAMPLE = 200;

/**
 * Indian dates as people actually type them, plus the one Excel writes.
 * Ambiguity is the point: 03-04-2026 is 3 April here, and reading it as 4
 * March would move every entry in the file into the wrong month.
 */
const DATE_PATTERNS = [
  /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/, // 03-04-2026, day first
  /^(\d{4})-(\d{2})-(\d{2})$/, // 2026-04-03, the ISO one
];

/** A number as a spreadsheet writes it: 1,23,456.78, (450), -450, ₹450. */
export function readNumber(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const negative = /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/^\(|\)$/g, "")
    .replace(/[₹$,\s]/g, "")
    .replace(/^-/, "");

  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  return negative || /^-/.test(raw) ? -value : value;
}

/**
 * A date, read **day first**, or null.
 *
 * @param {string} text
 * @returns {Date|null}
 */
export function readDate(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(raw);
    if (!match) continue;

    let day;
    let month;
    let year;
    if (pattern === DATE_PATTERNS[1]) {
      [, year, month, day] = match.map(Number);
    } else {
      [, day, month, year] = match.map(Number);
      if (year < 100) year += 2000;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    // IST midnight, like every other date in this system
    const date = new Date(Date.UTC(year, month - 1, day - 1, 18, 30));
    if (Number.isNaN(date.valueOf())) return null;
    return date;
  }

  return null;
}

/**
 * What kind of column this is, from what is in it.
 *
 * A column is a date or a number only when **everything filled in it**
 * reads as one. One stray "n/a" in an amount column means the column is
 * text, and saying so is the honest answer — the alternative is a total
 * that silently skipped a row.
 *
 * @param {string[]} values
 * @returns {"date"|"number"|"text"|"empty"}
 */
export function kindOf(values) {
  const filled = values.filter((value) => String(value ?? "").trim());
  if (filled.length === 0) return "empty";

  if (filled.every((value) => readDate(value) !== null)) return "date";
  if (filled.every((value) => readNumber(value) !== null)) return "number";
  return "text";
}

/**
 * Read a CSV into columns and rows, with nothing decided about meaning.
 *
 * @param {string} csvText
 * @returns {{
 *   headers: string[],
 *   rows: string[][],
 *   columns: Array<{
 *     index: number, header: string, kind: string, filled: number,
 *     blanks: number, distinct: number, sample: string[],
 *     total?: number, min?: string, max?: string
 *   }>,
 *   rowCount: number,
 * }}
 */
export function profileSheet(csvText) {
  /**
   * `parseCSV` already drops rows where every cell is empty, so a sheet
   * with gaps in it simply has fewer rows — there is no honest count of
   * "blank rows skipped" to report without parsing the file a second way,
   * and a number the lab cannot stand behind is worse than no number.
   */
  const table = parseCSV(csvText);

  if (table.length === 0) {
    return { headers: [], rows: [], columns: [], rowCount: 0 };
  }

  const headers = table[0].map(
    (header, index) => String(header ?? "").trim() || `Column ${index + 1}`,
  );
  const rows = table.slice(1);

  const columns = headers.map((header, index) => {
    const values = rows.map((row) => String(row[index] ?? "").trim());
    const filled = values.filter(Boolean);
    const kind = kindOf(values.slice(0, SAMPLE));

    /** @type {any} */
    const column = {
      index,
      header,
      kind,
      filled: filled.length,
      blanks: values.length - filled.length,
      distinct: new Set(filled).size,
      sample: filled.slice(0, 3),
    };

    if (kind === "number") {
      column.total = filled.reduce(
        (sum, value) => sum + (readNumber(value) ?? 0),
        0,
      );
    }
    if (kind === "date") {
      const dates = filled
        .map((value) => readDate(value))
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime());
      column.min = dates[0]?.toISOString() ?? "";
      column.max = dates[dates.length - 1]?.toISOString() ?? "";
    }

    return column;
  });

  return {
    headers,
    rows,
    columns,
    rowCount: rows.length,
  };
}
