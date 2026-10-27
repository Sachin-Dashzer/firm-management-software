// @ts-check

import { readDate, readNumber } from "./profile.js";
import { formatISTDate } from "../dates.js";

/**
 * The checks the data lab runs over a mapped sheet (P3-20).
 *
 * Every one of them is **true whatever the file is**: a duplicate
 * reference, a gap in a numbered series, a date outside the period, an
 * amount that is text. Nothing here knows anything about tax — a
 * tax-specific rule invented by me would be exactly what CLAUDE.md rule 8
 * forbids, and it would be wrong in a way nobody could see.
 *
 * Each finding carries **what it does not mean**. A duplicate invoice
 * number is usually a credit note; a round figure is usually a round
 * figure. A tool that cries wolf is a tool nobody opens in March.
 */

/** The columns a person can map. None of them is required. */
export const ROLES = [
  { key: "date", label: "Date", kinds: ["date"] },
  { key: "amount", label: "Amount", kinds: ["number"] },
  { key: "debit", label: "Debit", kinds: ["number"] },
  { key: "credit", label: "Credit", kinds: ["number"] },
  {
    key: "reference",
    label: "Reference or voucher number",
    kinds: ["text", "number"],
  },
  { key: "party", label: "Party", kinds: ["text"] },
];

const money = (value) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);

/** Pull one mapped column out of a row. */
const cell = (row, mapping, role) => {
  const index = mapping[role];
  if (index === undefined || index === null || index === "") return "";
  return String(row[Number(index)] ?? "").trim();
};

const has = (mapping, role) =>
  mapping[role] !== undefined && mapping[role] !== null && mapping[role] !== "";

/**
 * Everything worth looking at, in the order a person would.
 *
 * @param {string[][]} rows
 * @param {Record<string, number|string>} mapping column index per role
 * @param {{from?: Date|null, to?: Date|null, roundTo?: number}} [options]
 */
export function runChecks(rows, mapping, options = {}) {
  const findings = [];
  const add = (finding) => {
    if (finding.count > 0) findings.push(finding);
  };

  // --- the money adds up, where both sides were mapped --------------------
  if (has(mapping, "debit") && has(mapping, "credit")) {
    let debit = 0;
    let credit = 0;
    for (const row of rows) {
      debit += readNumber(cell(row, mapping, "debit")) ?? 0;
      credit += readNumber(cell(row, mapping, "credit")) ?? 0;
    }
    const difference = Math.round((debit - credit) * 100) / 100;
    add({
      key: "balance",
      title:
        difference === 0
          ? "Debits and credits agree"
          : `Debits and credits differ by ₹${money(Math.abs(difference))}`,
      count: difference === 0 ? 0 : 1,
      lines: [`Debits ₹${money(debit)} · credits ₹${money(credit)}`],
      note: "A difference is usually one row with the amount in the wrong column, or an opening balance that was not exported.",
    });
  }

  // --- the same reference twice -------------------------------------------
  if (has(mapping, "reference")) {
    const seen = new Map();
    for (const [index, row] of rows.entries()) {
      const key = cell(row, mapping, "reference");
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(index + 2);
    }
    const repeated = [...seen.entries()].filter(
      ([, lines]) => lines.length > 1,
    );
    add({
      key: "duplicates",
      title: `${repeated.length} reference${repeated.length === 1 ? "" : "s"} appear more than once`,
      count: repeated.length,
      lines: repeated
        .slice(0, 20)
        .map(([key, lines]) => `${key} — rows ${lines.join(", ")}`),
      note: "Usually a credit note against the same number, or the file exported twice. Worth opening, rarely wrong.",
    });

    // --- gaps in a numbered series ---------------------------------------
    const numbers = [...seen.keys()]
      .map((key) => {
        const match = /(\d+)\s*$/.exec(key);
        return match ? Number(match[1]) : null;
      })
      .filter((value) => value !== null)
      .sort((a, b) => a - b);

    if (numbers.length > 2) {
      const missing = [];
      for (
        let value = numbers[0];
        value < numbers[numbers.length - 1];
        value += 1
      ) {
        if (!numbers.includes(value)) missing.push(value);
        if (missing.length > 50) break;
      }
      add({
        key: "gaps",
        title: `${missing.length} number${missing.length === 1 ? "" : "s"} missing from the series`,
        count: missing.length,
        lines: [
          `Runs from ${numbers[0]} to ${numbers[numbers.length - 1]}`,
          missing.slice(0, 30).join(", "),
        ],
        note: "A sales register with gaps is the thing a department asks about. Cancelled invoices explain most of them — but somebody has to say so.",
      });
    }
  }

  // --- dates outside the period, and dates in the future ------------------
  if (has(mapping, "date")) {
    const outside = [];
    const future = [];
    const now = new Date();

    for (const [index, row] of rows.entries()) {
      const raw = cell(row, mapping, "date");
      const date = readDate(raw);
      if (!date) continue;

      if (options.from && date.getTime() < options.from.getTime()) {
        outside.push(`Row ${index + 2}: ${formatISTDate(date)}`);
      } else if (options.to && date.getTime() > options.to.getTime()) {
        outside.push(`Row ${index + 2}: ${formatISTDate(date)}`);
      }
      if (date.getTime() > now.getTime()) {
        future.push(`Row ${index + 2}: ${formatISTDate(date)}`);
      }
    }

    add({
      key: "outside",
      title: `${outside.length} row${outside.length === 1 ? "" : "s"} dated outside the period`,
      count: outside.length,
      lines: outside.slice(0, 20),
      note: "Often an opening entry or a prior-period correction, and sometimes the wrong file.",
    });

    add({
      key: "future",
      title: `${future.length} row${future.length === 1 ? "" : "s"} dated in the future`,
      count: future.length,
      lines: future.slice(0, 20),
      note: "Almost always a typing slip in the year.",
    });
  }

  // --- the amounts --------------------------------------------------------
  if (has(mapping, "amount")) {
    const amounts = [];
    const notNumbers = [];
    const negatives = [];

    for (const [index, row] of rows.entries()) {
      const raw = cell(row, mapping, "amount");
      if (!raw) continue;
      const value = readNumber(raw);
      if (value === null) {
        notNumbers.push(`Row ${index + 2}: "${raw}"`);
        continue;
      }
      amounts.push({ line: index + 2, value });
      if (value < 0) negatives.push(`Row ${index + 2}: ₹${money(value)}`);
    }

    add({
      key: "not-numbers",
      title: `${notNumbers.length} amount${notNumbers.length === 1 ? "" : "s"} that is not a number`,
      count: notNumbers.length,
      lines: notNumbers.slice(0, 20),
      note: 'A total that skips these is wrong by exactly their value. "n/a" and "-" are the usual two.',
    });

    add({
      key: "negatives",
      title: `${negatives.length} negative amount${negatives.length === 1 ? "" : "s"}`,
      count: negatives.length,
      lines: negatives.slice(0, 20),
      note: "A credit note in a sales register, or a reversal. Not wrong, worth seeing.",
    });

    const biggest = [...amounts]
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 5);
    add({
      key: "largest",
      title: `The ${biggest.length} largest`,
      count: biggest.length,
      lines: biggest.map((row) => `Row ${row.line}: ₹${money(row.value)}`),
      note: "Not a problem — the entries a reviewer should look at first.",
    });

    /** Round to the nearest `roundTo`, default ₹10,000. */
    const step = options.roundTo ?? 10_000;
    const round = amounts.filter(
      (row) => row.value !== 0 && Math.abs(row.value) % step === 0,
    );
    add({
      key: "round",
      title: `${round.length} amount${round.length === 1 ? "" : "s"} land on exactly ₹${money(step)}`,
      count: round.length,
      lines: round
        .slice(0, 20)
        .map((row) => `Row ${row.line}: ₹${money(row.value)}`),
      note: "Round figures are usually round figures. In a ledger of hundreds, a dozen identical ones is worth a question.",
    });
  }

  // --- the party column ---------------------------------------------------
  if (has(mapping, "party")) {
    const blank = [];
    for (const [index, row] of rows.entries()) {
      if (!cell(row, mapping, "party")) blank.push(`Row ${index + 2}`);
    }
    add({
      key: "no-party",
      title: `${blank.length} row${blank.length === 1 ? "" : "s"} with no party`,
      count: blank.length,
      lines: blank.slice(0, 20),
      note: "Cash sales, usually. A reconciliation cannot match them to anybody.",
    });
  }

  return findings;
}

/**
 * The summary in words, for the file — what was read, what was mapped, and
 * what was found. This is what gets posted to a job's internal thread, so
 * that a check somebody ran in March is on the record in June.
 *
 * @param {object} input
 * @param {string} input.fileName
 * @param {number} input.rowCount
 * @param {Array<{header: string, kind: string, total?: number}>} input.columns
 * @param {Record<string, any>} input.mapping
 * @param {Array<{title: string, count: number, note: string}>} input.findings
 * @param {string[]} input.headers
 */
export function summaryText({
  fileName,
  rowCount,
  columns,
  mapping,
  findings,
  headers,
}) {
  const mapped = ROLES.filter((role) => has(mapping, role.key)).map(
    (role) => `${role.label}: ${headers[Number(mapping[role.key])]}`,
  );

  const totals = columns
    .filter((column) => column.kind === "number" && column.total)
    .map((column) => `${column.header}: ₹${money(column.total)}`);

  return [
    `Checked ${fileName} — ${rowCount} rows.`,
    mapped.length ? `Columns read as — ${mapped.join("; ")}.` : "",
    totals.length ? `Totals — ${totals.join("; ")}.` : "",
    "",
    ...findings.map((finding) => `• ${finding.title}`),
    "",
    "The file itself is not kept: this is the record of what was looked at.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
