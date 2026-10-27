// @ts-check

import { checkGSTIN } from "../validators.js";
import { GST_SHEETS } from "./template.js";

/**
 * Checking a client's monthly GST sheet before anybody prepares from it
 * (P3-12).
 *
 * The point is not to be clever. It is to send back, the same day, a list a
 * bookkeeper can act on — "row 14, supplier GSTIN is 14 characters" — rather
 * than a phone call a week later saying the figures look odd. Every error
 * names the sheet, the row as the client sees it in Excel, the column, and
 * what to do.
 *
 * What it deliberately does **not** do is decide anything. A sheet that
 * passes every check here is still only a sheet: the return is prepared from
 * the GSTR-2B reconciliation, and `lib/gst/compute.js` says so on every
 * figure it produces.
 */

/** @typedef {{ sheet: string, row: number, column: string, says: string, fix: string }} Issue */

/** Excel's row 1 is the title, row 2 the headers, so data starts at 3. */
const FIRST_DATA_ROW = 3;

const num = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const isDate = (value) =>
  value instanceof Date ? !Number.isNaN(value.valueOf()) : Boolean(value);

/**
 * Check one workbook's three sheets.
 *
 * @param {Record<string, Array<Record<string, any>>>} sheets  keyed by the
 *   keys of `GST_SHEETS`, each an array of rows keyed by column key
 * @returns {{ issues: Issue[], counts: Record<string, number>, ok: boolean }}
 */
export function validateGstSheets(sheets) {
  /** @type {Issue[]} */
  const issues = [];
  /** @type {Record<string, number>} */
  const counts = {};

  for (const [key, sheet] of Object.entries(GST_SHEETS)) {
    const rows = sheets?.[key] ?? [];
    counts[key] = rows.length;

    /** Invoice numbers already seen on this sheet. */
    const seen = new Map();

    rows.forEach((row, index) => {
      const at = FIRST_DATA_ROW + index;
      const add = (column, says, fix) =>
        issues.push({ sheet: sheet.name, row: at, column, says, fix });

      // a row with nothing in it is not an error, it is the end of the data
      if (isBlank(row, sheet.columns)) return;

      for (const column of sheet.columns) {
        const value = row[column.key];

        if (
          column.required &&
          (value === "" || value === null || value === undefined)
        ) {
          add(column.header, "is empty", "Fill it in, or delete the row.");
          continue;
        }

        if (column.kind === "rupees" && value !== "" && value !== undefined) {
          const amount = num(value);
          if (Number.isNaN(amount)) {
            add(
              column.header,
              `reads "${value}"`,
              "Put a number in, with no text.",
            );
          } else if (amount < 0) {
            add(
              column.header,
              "is negative",
              "A credit note goes in as its own row with a credit note number, not as a minus here.",
            );
          }
        }

        if (column.kind === "date" && value && !isDate(value)) {
          add(
            column.header,
            `reads "${value}"`,
            "Format the cell as a date, so it is not read as text.",
          );
        }
      }

      if (row.gstin) {
        const result = checkGSTIN(row.gstin);
        if (!result.ok) {
          add(
            "GSTIN",
            result.reason.toLowerCase(),
            "Check it against the invoice.",
          );
        }
      }

      /**
       * The same invoice number twice on one sheet is the commonest real
       * error in a hand-kept book, and it doubles the tax on that invoice.
       */
      if (row.invoiceNo) {
        const number = String(row.invoiceNo).trim().toUpperCase();
        if (seen.has(number)) {
          add(
            "Invoice no",
            `is the same as row ${seen.get(number)}`,
            "One row per invoice. If it is a revision, use the revised number.",
          );
        } else {
          seen.set(number, at);
        }
      }

      // the tax on a row has to be one thing or the other, never both
      if (num(row.igst) > 0 && (num(row.cgst) > 0 || num(row.sgst) > 0)) {
        add(
          "IGST / CGST / SGST",
          "has both IGST and CGST or SGST on one row",
          "A supply is either within the state or across it. Split the row if two invoices were merged.",
        );
      }

      if (key === "purchases") {
        const eligible = String(row.eligible ?? "")
          .trim()
          .toUpperCase();
        if (eligible && !["Y", "N", "YES", "NO"].includes(eligible)) {
          add(
            "ITC eligible (Y/N)",
            `reads "${row.eligible}"`,
            "Y or N. If you are not sure, put N and we will ask.",
          );
        }
        /**
         * Credit claimed on something that has not arrived. Not an error in
         * the sheet so much as the one thing the firm must not take on
         * trust, so it is raised as something to ask about rather than
         * silently excluded — `compute` excludes it too, and says which.
         */
        if (
          ["Y", "YES"].includes(eligible) &&
          !isDate(row.receivedOn) &&
          !row.receivedOn
        ) {
          add(
            "Goods / service received on",
            "is empty, but the credit is marked eligible",
            "Put the date it arrived. Credit is not taken on what has not arrived, so this row is left out of the computation until you do.",
          );
        }
      }
    });
  }

  return { issues, counts, ok: issues.length === 0 };
}

/** Is this row entirely empty? Trailing blank rows are normal in a workbook. */
function isBlank(row, columns) {
  return columns.every((column) => {
    const value = row[column.key];
    return value === "" || value === null || value === undefined;
  });
}

/**
 * The same list, grouped for the message that goes back to the client.
 *
 * A client who gets forty lines fixes none of them. Grouped by sheet, with
 * the row numbers together, it reads like something to work through.
 *
 * @param {Issue[]} issues
 */
export function summariseIssues(issues) {
  const bySheet = new Map();
  for (const issue of issues) {
    const list = bySheet.get(issue.sheet) ?? [];
    list.push(issue);
    bySheet.set(issue.sheet, list);
  }

  return [...bySheet.entries()].map(([sheet, list]) => ({
    sheet,
    count: list.length,
    lines: list.map(
      (issue) =>
        `Row ${issue.row}, ${issue.column}: ${issue.says}. ${issue.fix}`,
    ),
  }));
}
