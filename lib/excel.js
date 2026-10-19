// @ts-check

import ExcelJS from "exceljs";
import { IST } from "./dates.js";
import { firmName } from "./firm/settings.js";

/**
 * Writing a real .xlsx (spec section 17: every list exports to Excel).
 *
 * Until this existed every export was CSV, which Excel opens but as text:
 * the firm re-formatted the headings and the rupee columns every time, and
 * a date could be read as American. One helper fixes that for every list
 * at once, so no screen has to know anything about spreadsheets.
 *
 * Three things it insists on, because they are what makes a sheet usable
 * rather than merely openable:
 *
 *  - the heading row is frozen and bold, so scrolling 4,000 rows still
 *    tells you which column you are in;
 *  - money is a number with two decimals and Indian grouping, never a
 *    string — a column of text cannot be summed, which is the first thing
 *    anyone does to it;
 *  - a date is a real date, formatted DD-MM-YYYY.
 *
 * `money` takes paise, which is how the database holds it; `rupees` takes
 * a figure already converted, for the routes that had converted it before
 * this file existed. Both print the same way.
 *
 * @typedef {"text"|"money"|"rupees"|"date"|"number"|"int"} ColumnKind
 * @typedef {object} Column
 * @property {string} header
 * @property {string} [key]
 * @property {ColumnKind} [kind]  default "text"
 * @property {number} [width]
 */

/** Indian grouping, two decimals, negatives in brackets like a ledger. */
const MONEY_FORMAT = "#,##,##0.00;[Red](#,##,##0.00)";
const DATE_FORMAT = "dd-mm-yyyy";

const widthFor = (column) =>
  column.width ??
  (column.kind === "money" || column.kind === "rupees"
    ? 14
    : column.kind === "date"
      ? 12
      : column.kind === "number" || column.kind === "int"
        ? 10
        : Math.min(40, Math.max(12, column.header.length + 4)));

/**
 * A date as Excel wants it: the IST calendar day, so a sheet opened in
 * Mumbai and a sheet opened anywhere else show the same date.
 * @param {Date|string|null|undefined} value
 */
function excelDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  // the IST wall-clock date, pinned to midday UTC so no reader's time zone
  // can nudge it onto the day before
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return new Date(`${parts}T12:00:00Z`);
}

/**
 * One sheet.
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {object} sheet
 * @param {string} sheet.name
 * @param {Column[]} sheet.columns
 * @param {Array<Record<string, any>|Array<any>>} sheet.rows
 * @param {string} [sheet.title]  a line above the table, e.g. the filters used
 */
export function addSheet(workbook, { name, columns, rows, title }) {
  // Excel refuses these in a sheet name, and refuses one over 31 characters
  const safeName = name.replace(/[*?:/\\[\]]/g, " ").slice(0, 31) || "Sheet";
  const worksheet = workbook.addWorksheet(safeName, {
    views: [{ state: "frozen", ySplit: title ? 2 : 1 }],
  });

  if (title) {
    const line = worksheet.addRow([title]);
    line.font = { italic: true, size: 10, color: { argb: "FF6B6B6B" } };
    worksheet.mergeCells(line.number, 1, line.number, columns.length || 1);
  }

  const head = worksheet.addRow(columns.map((column) => column.header));
  head.font = { bold: true };
  head.alignment = { vertical: "middle" };
  head.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };

  for (const row of rows) {
    const values = columns.map((column, index) => {
      const raw = Array.isArray(row) ? row[index] : row[column.key ?? ""];
      if (raw === undefined || raw === null || raw === "") return null;

      switch (column.kind) {
        case "money":
          // paise in, rupees out: this column is read by a person
          return typeof raw === "number" ? raw / 100 : Number(raw) / 100;
        case "rupees":
          return typeof raw === "number" ? raw : Number(raw);
        case "date":
          return excelDate(raw);
        case "number":
        case "int":
          return typeof raw === "number" ? raw : Number(raw);
        default:
          return raw;
      }
    });

    const added = worksheet.addRow(values);
    columns.forEach((column, index) => {
      const cell = added.getCell(index + 1);
      if (column.kind === "money" || column.kind === "rupees") {
        cell.numFmt = MONEY_FORMAT;
      }
      if (column.kind === "date") cell.numFmt = DATE_FORMAT;
      if (column.kind === "int") cell.numFmt = "0";
    });
  }

  columns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = widthFor(column);
  });

  // only worth a filter if there is something to filter
  if (rows.length > 1 && columns.length > 0) {
    const headerRow = title ? 2 : 1;
    worksheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: columns.length },
    };
  }

  return worksheet;
}

/**
 * A whole workbook as bytes, ready to return from a route handler.
 *
 * @param {Array<{name: string, columns: Column[], rows: Array<any>, title?: string}>} sheets
 * @returns {Promise<Buffer>}
 */
export async function buildWorkbook(sheets) {
  const workbook = new ExcelJS.Workbook();
  // whose workbook this is, from the firm's own record (P2-6)
  workbook.creator = await firmName();
  workbook.created = new Date();

  for (const sheet of sheets) addSheet(workbook, sheet);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * The response a download route returns.
 *
 * @param {Buffer} buffer
 * @param {string} filename without the extension
 */
export function xlsxResponse(buffer, filename) {
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(buffer, {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
