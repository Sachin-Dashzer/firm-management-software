// @ts-check

/**
 * CSV in and out, to RFC 4180.
 *
 * ponytail: CSV rather than real .xlsx, so there is no spreadsheet library to
 * keep patched and nothing that executes on open. Excel reads and writes it
 * natively — "Save as → CSV UTF-8". Swap in a workbook writer in Step 10 if
 * the firm wants formatting on exports.
 */

/**
 * Parse CSV text into rows of strings. Handles quoted fields, embedded commas,
 * doubled quotes, embedded newlines, and both line ending styles.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCSV(text) {
  // strip the byte-order mark Excel writes, or the first header is unmatchable
  const input = String(text ?? "").replace(/^﻿/, "");
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // \r\n counts once
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // whatever is left after the last line ending
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // a trailing newline should not produce a row of one empty string
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Parse into objects keyed by the header row, which is matched loosely:
 * case, spaces and punctuation in the header do not have to be exact.
 *
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCSVObjects(text) {
  const [headerRow, ...dataRows] = parseCSV(text);
  if (!headerRow) return { headers: [], rows: [] };

  const headers = headerRow.map((h) => h.trim());
  const keys = headers.map(normaliseHeader);

  const rows = dataRows.map((cells) => {
    /** @type {Record<string, string>} */
    const object = {};
    keys.forEach((key, i) => {
      if (key) object[key] = (cells[i] ?? "").trim();
    });
    return object;
  });

  return { headers, rows };
}

/** "Legal name" / "LEGAL_NAME" / "Legal Name *" all become "legalname". */
export function normaliseHeader(header) {
  return String(header ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** RFC 4180: quote a field only when it needs it, and double inner quotes. */
export function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows to CSV text, with the marker that makes Excel read it as UTF-8 so
 * Indian names and ₹ survive the trip.
 *
 * @param {(string|number|null|undefined)[][]} rows
 * @returns {string}
 */
export function toCSV(rows) {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
