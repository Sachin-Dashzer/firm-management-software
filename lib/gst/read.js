// @ts-check

import ExcelJS from "exceljs";
import { GST_SHEETS } from "./template.js";

/**
 * Reading back the workbook the client filled in (P3-12).
 *
 * The one impure file in `lib/gst/`: everything else takes rows and returns
 * answers, so it is all testable without a file. ExcelJS is already a
 * dependency — `lib/excel.js` writes with it — and it reads too, so no new
 * one was added.
 *
 * It is forgiving on purpose. A client who renames "Sales B2B" to "B2B
 * Sales", or moves a column, or leaves the template's instruction sheet in,
 * has not done anything wrong, and a parser that refuses the file teaches
 * them to stop sending it. So sheets are matched loosely and columns by
 * their header text wherever they ended up.
 */

/**
 * @param {Buffer|ArrayBuffer} buffer
 * @returns {Promise<{ sheets: Record<string, Array<Record<string, any>>>, missing: string[] }>}
 */
export async function readGstWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  /** @type {Record<string, Array<Record<string, any>>>} */
  const sheets = {};
  const missing = [];

  for (const [key, spec] of Object.entries(GST_SHEETS)) {
    const worksheet = findSheet(workbook, spec.name);
    if (!worksheet) {
      missing.push(spec.name);
      sheets[key] = [];
      continue;
    }
    sheets[key] = readSheet(worksheet, spec.columns);
  }

  return { sheets, missing };
}

/** Match a sheet by name, ignoring case, spaces and the order of the words. */
function findSheet(workbook, name) {
  const want = normalise(name);
  const wanted = new Set(want.split(" "));

  return (
    workbook.worksheets.find((sheet) => normalise(sheet.name) === want) ??
    workbook.worksheets.find((sheet) => {
      const words = new Set(normalise(sheet.name).split(" "));
      return (
        wanted.size === words.size &&
        [...wanted].every((word) => words.has(word))
      );
    }) ??
    null
  );
}

const normalise = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Read one sheet into rows keyed by column key.
 *
 * The header row is found rather than assumed: `addSheet` puts a title above
 * it, and a client who adds a line of their own above that has still sent a
 * usable file.
 */
function readSheet(worksheet, columns) {
  const byHeader = new Map(
    columns.map((column) => [normalise(column.header), column.key]),
  );

  let headerRow = 0;
  /** @type {Map<number, string>} */
  const columnAt = new Map();

  worksheet.eachRow((row, rowNumber) => {
    if (headerRow) return;
    const found = new Map();
    row.eachCell((cell, colNumber) => {
      const key = byHeader.get(normalise(cell.value));
      if (key) found.set(colNumber, key);
    });
    // a row that matches at least two of our headers is the header row; one
    // match could be any cell that happens to say "Invoice no"
    if (found.size >= 2) {
      headerRow = rowNumber;
      for (const [colNumber, key] of found) columnAt.set(colNumber, key);
    }
  });

  if (!headerRow) return [];

  /** @type {Array<Record<string, any>>} */
  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;

    /** @type {Record<string, any>} */
    const out = {};
    for (const column of columns) out[column.key] = "";

    let any = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = columnAt.get(colNumber);
      if (!key) return;
      const value = cellValue(cell);
      out[key] = value;
      if (value !== "" && value !== null && value !== undefined) any = true;
    });

    if (any) rows.push(out);
  });

  return rows;
}

/** A cell's value, with formulas and rich text flattened to what they show. */
function cellValue(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return value.result ?? "";
    if ("text" in value) return value.text ?? "";
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("");
    }
    return "";
  }
  return value;
}
