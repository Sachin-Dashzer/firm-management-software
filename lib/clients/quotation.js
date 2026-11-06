// @ts-check

import { formatPaise, toPaise } from "../money.js";

/**
 * The mini quotation a new client gets (06-11-2026).
 *
 * The wizard already collects, per service, a fee, how often it is billed
 * and how GST sits on it. That is a quotation — it was simply never shown
 * to the client. This turns those rows into the lines of one, and it is
 * pure so the screen can show the client exactly what the email will say
 * before anybody presses Create.
 *
 * It does **not** add fees of different bases together. ₹2,000 a month and
 * ₹5,000 a year are not ₹7,000 of anything, and a quotation that says they
 * are is the kind of number a client quotes back at you.
 */

/** The bases the wizard offers, in the order a quotation reads best. */
const BASES = ["per month", "per quarter", "per year", "per engagement"];

const GST_NOTE = {
  "plus GST": "plus GST",
  "inclusive of GST": "inclusive of GST",
  "no GST": "no GST",
};

/**
 * A fee as typed in the wizard — rupees, possibly blank — as paise.
 *
 * Blank is 0, not the catalog default: somebody who clears the fee has
 * said "we have not agreed one", and quoting the firm's rate card back at
 * them instead would be the system settling a fee on its own.
 *
 * @param {string|number|undefined} fee
 * @param {number} [fallbackPaise] used only when there is no number at all
 */
export function feeToPaise(fee, fallbackPaise = 0) {
  if (fee === undefined || fee === null) return fallbackPaise;
  try {
    return toPaise(fee);
  } catch {
    return fallbackPaise;
  }
}

/**
 * @param {Array<{name: string, feePaise: number, billingBasis?: string, gstTreatment?: string}>} rows
 * @returns {{lines: string[], totals: string[], totalLine: string, unpriced: number}}
 */
export function quotation(rows = []) {
  /** @type {string[]} */
  const lines = [];
  /** @type {Map<string, number>} */
  const byBasis = new Map();
  let unpriced = 0;

  for (const row of rows) {
    const name = String(row?.name ?? "").trim();
    if (!name) continue;

    const basis = BASES.includes(String(row.billingBasis))
      ? String(row.billingBasis)
      : "per engagement";
    const fee = Number(row.feePaise ?? 0);

    if (!Number.isFinite(fee) || fee <= 0) {
      // said out loud rather than printed as ₹0, which a client reads as free
      lines.push(`${name} — fee to be agreed`);
      unpriced += 1;
      continue;
    }

    const gst = GST_NOTE[String(row.gstTreatment)] ?? "plus GST";
    lines.push(`${name} — ${formatPaise(fee)} ${basis}, ${gst}`);
    byBasis.set(basis, (byBasis.get(basis) ?? 0) + fee);
  }

  const totals = BASES.filter((basis) => byBasis.has(basis)).map(
    (basis) => `${formatPaise(byBasis.get(basis) ?? 0)} ${basis}`,
  );

  return {
    lines,
    totals,
    totalLine: totals.length ? `Total: ${totals.join(" · ")}` : "",
    unpriced,
  };
}
