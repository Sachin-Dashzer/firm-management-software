// @ts-check

/**
 * Putting money against invoices (spec section 7).
 *
 * A payment is not simply "a receipt against an invoice": a client sends
 * one transfer covering four bills, deducts TDS from each, and rounds the
 * lot. So a payment holds allocations, anything not allocated sits as
 * credit on the client, and the invoice statuses follow from the sums.
 *
 * All of this is pure, because it is the part where being almost right
 * means the firm chases money it already has — or does not chase money it
 * has not.
 */

/** How money arrives (spec section 7). A plain list, so client components
 * can use it without importing the model and with it the whole of Mongoose. */
export const PAYMENT_MODES = [
  "Bank transfer",
  "UPI",
  "Cheque",
  "Cash",
  "Adjustment",
];

/**
 * @typedef {object} Allocation
 * @property {string} invoiceId
 * @property {number} amountPaise
 * @property {number} [tdsPaise]  TDS the client deducted on this invoice
 *
 * @typedef {object} OpenInvoice
 * @property {string} id
 * @property {number} totalPaise
 * @property {number} paidPaise
 * @property {number} tdsCreditedPaise
 * @property {Date|null} [date]
 */

/** What is still owed on an invoice. */
export function outstandingOf(invoice) {
  return Math.max(
    0,
    (invoice.totalPaise ?? 0) -
      (invoice.paidPaise ?? 0) -
      (invoice.tdsCreditedPaise ?? 0),
  );
}

/**
 * The status an invoice should now carry.
 *
 * Settled means paid plus TDS credited covers the total: a client who pays
 * 90% and deducts 10% TDS has settled the bill in full, and chasing them
 * for the balance would be wrong.
 *
 * @param {OpenInvoice & {status?: string}} invoice
 * @returns {string}
 */
export function statusAfterPayment(invoice) {
  // these say something a payment does not change
  if (["Cancelled", "Written off", "Draft"].includes(invoice.status)) {
    return invoice.status;
  }

  const settled = (invoice.paidPaise ?? 0) + (invoice.tdsCreditedPaise ?? 0);
  if (settled <= 0) return invoice.status === "Disputed" ? "Disputed" : "Sent";
  if (settled >= (invoice.totalPaise ?? 0)) return "Paid";
  return "Partially paid";
}

/**
 * Spread a receipt across open invoices, oldest first.
 *
 * Only ever a suggestion: it fills the screen so the common case is one
 * click, and the person can change every figure before saving. Nothing
 * here writes anything.
 *
 * @param {number} amountPaise what arrived in the bank
 * @param {OpenInvoice[]} invoices oldest first
 * @param {number} [tdsPaise] TDS the client says it deducted, in total
 * @returns {{ allocations: Allocation[], unallocatedPaise: number }}
 */
export function suggestAllocation(amountPaise, invoices, tdsPaise = 0) {
  let cash = Math.max(0, Math.round(amountPaise));
  let tds = Math.max(0, Math.round(tdsPaise));
  const allocations = [];

  for (const invoice of invoices) {
    if (cash <= 0 && tds <= 0) break;

    const owed = outstandingOf(invoice);
    if (owed <= 0) continue;

    // the TDS goes against the invoice first, because that is what the
    // client did: they withheld part of this bill, not part of the cash
    const tdsHere = Math.min(tds, owed);
    const cashHere = Math.min(cash, owed - tdsHere);

    if (tdsHere === 0 && cashHere === 0) continue;

    allocations.push({
      invoiceId: invoice.id,
      amountPaise: cashHere,
      tdsPaise: tdsHere,
    });

    cash -= cashHere;
    tds -= tdsHere;
  }

  // whatever is left is an advance: credit on the client, not lost
  return { allocations, unallocatedPaise: cash };
}

/**
 * Check what someone has typed before it is written.
 *
 * @param {object} input
 * @param {number} input.amountPaise
 * @param {number} [input.tdsPaise]
 * @param {Allocation[]} input.allocations
 * @param {Map<string, OpenInvoice>} input.invoices by id
 * @returns {string[]} the problems, empty if there are none
 */
export function checkAllocation({
  amountPaise,
  tdsPaise = 0,
  allocations,
  invoices,
}) {
  const problems = [];

  if (!(amountPaise > 0) && !(tdsPaise > 0)) {
    problems.push("A payment needs an amount.");
  }

  const allocatedCash = allocations.reduce(
    (sum, a) => sum + (a.amountPaise ?? 0),
    0,
  );
  const allocatedTds = allocations.reduce(
    (sum, a) => sum + (a.tdsPaise ?? 0),
    0,
  );

  if (allocatedCash > amountPaise) {
    problems.push(
      "More has been allocated than was received. Reduce the allocations or raise the amount.",
    );
  }
  if (allocatedTds > tdsPaise) {
    problems.push("More TDS has been allocated than the client deducted.");
  }

  for (const allocation of allocations) {
    const invoice = invoices.get(String(allocation.invoiceId));
    if (!invoice) {
      problems.push("One of the invoices no longer exists.");
      continue;
    }
    if ((allocation.amountPaise ?? 0) < 0 || (allocation.tdsPaise ?? 0) < 0) {
      problems.push("An allocation cannot be negative.");
      continue;
    }
    const against = (allocation.amountPaise ?? 0) + (allocation.tdsPaise ?? 0);
    if (against > outstandingOf(invoice)) {
      problems.push(
        `More has been put against ${invoice.number ?? "an invoice"} than it is owed.`,
      );
    }
  }

  return problems;
}

/**
 * Receivables ageing (spec section 7): 0–30, 31–60, 61–90, 90+ days past
 * the due date. An invoice not yet due sits in "current".
 *
 * @param {Array<{dueDate?: Date|null, outstandingPaise: number}>} invoices
 * @param {Date} [now]
 */
export function ageReceivables(invoices, now = new Date()) {
  const buckets = {
    current: 0,
    "0-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };

  for (const invoice of invoices) {
    const owed = invoice.outstandingPaise ?? 0;
    if (owed <= 0) continue;

    if (!invoice.dueDate) {
      buckets.current += owed;
      continue;
    }

    const days = Math.floor(
      (now.getTime() - new Date(invoice.dueDate).getTime()) / 86_400_000,
    );

    if (days < 0) buckets.current += owed;
    else if (days <= 30) buckets["0-30"] += owed;
    else if (days <= 60) buckets["31-60"] += owed;
    else if (days <= 90) buckets["61-90"] += owed;
    else buckets["90+"] += owed;
  }

  return {
    ...buckets,
    total: Object.values(buckets).reduce((sum, value) => sum + value, 0),
  };
}

/**
 * A client's running account (spec section 7): invoices owed, payments
 * received, TDS credited, and what is left.
 *
 * @param {Array<any>} invoices
 * @param {Array<any>} payments
 */
export function buildLedger(invoices, payments) {
  const entries = [];

  for (const invoice of invoices) {
    // a cancelled or written-off invoice is not owed, so it does not
    // belong in the running balance
    if (["Cancelled", "Written off", "Draft"].includes(invoice.status)) {
      continue;
    }
    const sign = invoice.type === "Credit note" ? -1 : 1;
    entries.push({
      date: invoice.date,
      kind: invoice.type === "Credit note" ? "Credit note" : "Invoice",
      reference: invoice.number,
      id: String(invoice._id ?? invoice.id),
      debitPaise: sign > 0 ? invoice.totalPaise : 0,
      creditPaise: sign < 0 ? invoice.totalPaise : 0,
    });
  }

  for (const payment of payments) {
    entries.push({
      date: payment.date,
      kind: "Payment",
      reference: payment.reference || payment.mode,
      id: String(payment._id ?? payment.id),
      debitPaise: 0,
      creditPaise: payment.amountPaise ?? 0,
    });
    if (payment.tdsPaise > 0) {
      entries.push({
        date: payment.date,
        kind: "TDS credited",
        reference: payment.reference || "",
        id: `${String(payment._id ?? payment.id)}-tds`,
        debitPaise: 0,
        creditPaise: payment.tdsPaise,
      });
    }
  }

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  let balance = 0;
  for (const entry of entries) {
    balance += entry.debitPaise - entry.creditPaise;
    entry.balancePaise = balance;
  }

  return { entries, closingPaise: balance };
}
