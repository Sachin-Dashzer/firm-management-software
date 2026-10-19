// @ts-check

import { formatPaise } from "../money.js";
import { formatISTDate } from "../dates.js";

/**
 * One report, three outputs: the screen, the spreadsheet and the printed
 * page. The spreadsheet wants raw numbers so Excel can sum them; the other
 * two want the same text. So formatting lives here, once, and both the
 * table and the PDF call it — otherwise a printed figure slowly stops
 * matching the one on screen.
 *
 * @param {{columns: Array<{key: string, kind?: string}>, rows: Array<Record<string, any>>}} report
 */
export function displayRows({ columns, rows }) {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [column.key, cell(row[column.key], column.kind)]),
    ),
  );
}

/** @param {any} value @param {string} [kind] */
export function cell(value, kind) {
  if (value === null || value === undefined || value === "") return "";

  switch (kind) {
    case "money":
      return formatPaise(Number(value));
    case "date":
      return formatISTDate(value instanceof Date ? value : new Date(value));
    case "int":
    case "number":
      return new Intl.NumberFormat("en-IN").format(Number(value));
    default:
      return String(value);
  }
}

/** A total is stored as paise or a count; the label says which it is. */
export function displayTotals(totals = []) {
  return totals.map((total) => ({
    label: total.label,
    value: /₹|fee|billed|outstanding|owed/i.test(total.label)
      ? formatPaise(Number(total.value))
      : cell(total.value, "int"),
  }));
}
