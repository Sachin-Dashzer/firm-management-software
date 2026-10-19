// @ts-check

import Counter from "../../models/Counter.js";
import { financialYearLabel } from "../dates.js";

/**
 * Invoice numbers (spec section 7): `NOI/26-27/0087`, one series per branch
 * per financial year, with no gaps.
 *
 * "No gaps" is why a number is handed out when an invoice is **issued**,
 * never when a draft is created. A draft that is abandoned, or edited for a
 * week, or deleted, must not leave a hole in a statutory series — so it has
 * no number at all until the moment it becomes a tax invoice, and that
 * moment is one transaction with the `$inc` below.
 *
 * The counter id is the series itself (`NOI/26-27`), so two people issuing
 * at once from the same branch contend on one document and one of them
 * waits, rather than both being handed 0087.
 */

/**
 * @param {string} branchPrefix e.g. "NOI"
 * @param {Date} date the invoice date, which decides the financial year
 * @returns {string} e.g. "NOI/26-27"
 */
export function seriesFor(branchPrefix, date = new Date()) {
  const prefix = String(branchPrefix ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(prefix)) {
    throw new Error(`Not a branch prefix: ${branchPrefix}`);
  }
  // 2026-27 is printed 26-27 on the invoice
  const fy = financialYearLabel(date).slice(2);
  return `${prefix}/${fy}`;
}

/**
 * Take the next number in a series. Must be inside the transaction that
 * writes the invoice, so a failed write gives the number back.
 *
 * @param {string} branchPrefix
 * @param {Date} date
 * @param {import("mongoose").ClientSession} session
 * @returns {Promise<{ number: string, series: string, seq: number }>}
 */
export async function nextInvoiceNumber(branchPrefix, date, session) {
  if (!session) {
    throw new Error(
      "An invoice number must be taken inside the transaction that writes the invoice, or the series will gap.",
    );
  }

  const series = seriesFor(branchPrefix, date);
  const counter = await Counter.findOneAndUpdate(
    { _id: series },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true, session },
  );

  return {
    series,
    seq: counter.seq,
    number: `${series}/${String(counter.seq).padStart(4, "0")}`,
  };
}

/**
 * Check a series for holes (spec section 7: no gaps).
 *
 * Used by the hardening checklist in Step 12 and available to a partner who
 * wants to be sure. A gap means something went wrong that nobody noticed,
 * which is exactly the kind of thing an auditor asks about.
 *
 * @param {number[]} sequences the seq numbers issued in one series
 * @returns {{ ok: boolean, missing: number[], highest: number }}
 */
export function findGaps(sequences) {
  const sorted = [...new Set(sequences)].sort((a, b) => a - b);
  const highest = sorted.length ? sorted[sorted.length - 1] : 0;
  const missing = [];

  for (let n = 1; n <= highest; n += 1) {
    if (!sorted.includes(n)) missing.push(n);
  }

  return { ok: missing.length === 0, missing, highest };
}
