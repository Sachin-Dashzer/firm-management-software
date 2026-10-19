// @ts-check

import { parseCSVObjects, normaliseHeader } from "../csv.js";
import { toPaise } from "../money.js";

/**
 * Opening receivables (spec section 17, step 2 of the go-live plan).
 *
 * On the day the firm switches over, clients already owe them money. If
 * that is not carried in, the receivables screen starts at zero and the
 * firm under-reports what it is owed from day one — which is the one
 * number nobody wants to under-report.
 *
 * These are brought in as **invoices in a separate series**, not as a
 * balance on the client record. Three reasons, all of which matter more
 * than the convenience of a single figure:
 *
 *  - a payment has to be allocated against *something*, and the allocation
 *    code already knows how to do that against an invoice;
 *  - the ageing report needs a date per amount, not one lump;
 *  - the gapless numbering of the firm's real GST invoices must not be
 *    disturbed by history, so these carry an `OB/` prefix and sit outside
 *    the statutory series entirely.
 *
 * They are marked `isOpeningBalance`, so every screen can say "this came
 * from the old system" rather than implying PHMG issued a tax invoice it
 * did not.
 */

export const OPENING_COLUMNS = [
  "clientCode",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "amountOutstanding",
  "notes",
];

/** @typedef {{ line: number, clientCode: string, value: object, errors: string[] }} OpeningRow */

/**
 * Read and check the sheet before anything is written.
 *
 * @param {string} csvText
 * @param {{ clients: Array<{ id: string, code: string, legalName: string, branchId: string }> }} context
 */
export function prepareOpeningBalances(csvText, { clients }) {
  const { headers, rows: raw } = parseCSVObjects(csvText);
  const byCode = new Map(clients.map((client) => [client.code, client]));

  const known = new Set(OPENING_COLUMNS.map((c) => normaliseHeader(c)));
  const unknownHeaders = headers.filter(
    (header) => header.trim() !== "" && !known.has(normaliseHeader(header)),
  );

  /** @type {Map<string, number>} */
  const seenNumbers = new Map();

  const rows = raw.map((row, index) => {
    const line = index + 2; // the header is row 1, as Excel shows it
    const errors = [];

    const code = String(row.clientcode ?? "")
      .trim()
      .toUpperCase();
    const client = byCode.get(code);
    if (!code) errors.push("Client code is missing");
    else if (!client) errors.push(`No client has the code ${code}`);

    const number = String(row.invoicenumber ?? "").trim();
    if (!number) errors.push("The old invoice number is missing");
    else if (seenNumbers.has(number)) {
      errors.push(`That number is also on row ${seenNumbers.get(number)}`);
    } else {
      seenNumbers.set(number, line);
    }

    const date = readDate(row.invoicedate);
    if (!date) errors.push("The invoice date is missing or not a date");

    const dueDate = row.duedate ? readDate(row.duedate) : null;
    if (row.duedate && !dueDate) errors.push("The due date is not a date");

    const paise = readRupees(row.amountoutstanding);
    if (paise === null) {
      errors.push("The outstanding amount is missing or not a number");
    } else if (paise <= 0) {
      errors.push("The outstanding amount has to be more than zero");
    }

    return {
      line,
      clientCode: code,
      clientName: client?.legalName ?? "",
      value: {
        clientId: client?.id,
        branchId: client?.branchId,
        number: number ? `OB/${number}` : "",
        originalNumber: number,
        date,
        // no due date given: it was due when it was raised
        dueDate: dueDate ?? date,
        amountPaise: paise ?? 0,
        notes: String(row.notes ?? "").trim(),
      },
      errors,
    };
  });

  const ready = rows.filter((row) => row.errors.length === 0);

  return {
    headers,
    unknownHeaders,
    rows,
    readyCount: ready.length,
    errorCount: rows.length - ready.length,
    totalPaise: ready.reduce((sum, row) => sum + row.value.amountPaise, 0),
  };
}

/**
 * Accepts what people actually type: 15-04-2026, 15/04/2026, 2026-04-15.
 * Day first, because that is how Indian dates are written — "04-05-2026"
 * is the 4th of May here, and guessing it as April would be wrong half the
 * time and silently so.
 * @param {string} text
 */
export function readDate(text) {
  const value = String(text ?? "").trim();
  if (!value) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    return new Date(`${value}T00:00:00+05:30`);
  }

  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(value);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    const date = new Date(
      `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00+05:30`,
    );
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  return null;
}

/**
 * Rupees as a person types them — "1,25,000", "125000.50", "₹1,25,000" —
 * into integer paise (CLAUDE.md rule 5).
 * @param {string} text
 * @returns {number|null}
 */
export function readRupees(text) {
  const value = String(text ?? "")
    .replace(/[₹,\s]/g, "")
    .trim();
  if (!value) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return null;
  return toPaise(Number(value));
}

/** The sheet a person downloads, fills in and uploads. */
export function openingTemplateRows() {
  return [
    OPENING_COLUMNS,
    [
      "PHMG-NOI-0001",
      "2025-26/114",
      "12-02-2026",
      "27-02-2026",
      "45000",
      "Statutory audit 2024-25, part paid",
    ],
    [
      "PHMG-LDH-0007",
      "2025-26/221",
      "03-03-2026",
      "",
      "1,25,000",
      "Carried over from the old register",
    ],
  ];
}
