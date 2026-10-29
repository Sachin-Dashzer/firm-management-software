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
 * What a client owes, and how much of it is late — the figure in the client
 * header (spec section 3: every invoice hangs off the client record).
 *
 * The overdue part is separated because it is the half that changes the
 * conversation: ₹2,00,000 outstanding on this month's bills is a business,
 * and ₹2,00,000 overdue since June is a problem. Credit notes never reach
 * here and TDS counts as paid, both through `outstandingOf` — a client who
 * pays 90% and deducts 10% has settled the bill.
 *
 * @param {Array<{totalPaise?: number, paidPaise?: number, tdsCreditedPaise?: number, dueDate?: Date|string|null}>} invoices
 *   the invoices still owed on; the caller filters the statuses
 * @param {Date} [now]
 * @returns {{totalPaise: number, overduePaise: number, oldest: Date|null}}
 */
export function outstandingSummary(invoices, now = new Date()) {
  let totalPaise = 0;
  let overduePaise = 0;
  /** @type {Date|null} */
  let oldest = null;

  for (const invoice of invoices) {
    const left = outstandingOf(invoice);
    if (left <= 0) continue;
    totalPaise += left;

    const due = invoice.dueDate ? new Date(invoice.dueDate) : null;
    if (due && due < now) {
      overduePaise += left;
      if (!oldest || due < oldest) oldest = due;
    }
  }

  return { totalPaise, overduePaise, oldest };
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

/**
 * Where a client's unapplied receipts would go, taken oldest first
 * (P3-31, the accounts desk).
 *
 * One receipt at a time is easy; several at once is where it goes wrong.
 * The desk shows every unapplied receipt a client has with a suggestion
 * against each, and **two suggestions must not point at the same invoice
 * twice**: the first receipt would clear it, and the second would then be
 * offered an invoice with nothing left owing. So what each suggestion
 * claims is taken off the outstanding before the next one is worked out.
 *
 * The receipts are sequenced by date, the oldest money first, because that
 * is the order a ledger reads and the order the firm's own rule applies.
 *
 * @param {{id: string, date: any, paise: number,
 *          allocations?: {invoiceId: string, amountPaise?: number, tdsPaise?: number}[]}[]} receipts
 * @param {OpenInvoice[]} invoices open invoices, oldest first
 */
export function suggestForReceipts(receipts, invoices) {
  /** @type {Map<string, number>} */
  const claimed = new Map();

  return [...receipts]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((receipt) => {
      /**
       * What an earlier receipt has claimed is added to `paidPaise`, not
       * subtracted from `outstandingPaise`.
       *
       * `suggestAllocation` works the outstanding out for itself with
       * `outstandingOf`, which reads the total and what is paid — so
       * adjusting a precomputed `outstandingPaise` would be ignored and
       * the deduplication would do nothing at all, silently. Both are set,
       * so a caller reading either gets the same answer.
       */
      const left = invoices.map((invoice) => {
        const taken = claimed.get(invoice.id) ?? 0;
        return {
          ...invoice,
          paidPaise: (invoice.paidPaise ?? 0) + taken,
          outstandingPaise: Math.max(
            0,
            (invoice.outstandingPaise ?? outstandingOf(invoice)) - taken,
          ),
        };
      });

      const { allocations, unallocatedPaise } = suggestAllocation(
        receipt.paise,
        left,
      );

      for (const line of allocations) {
        claimed.set(
          line.invoiceId,
          (claimed.get(line.invoiceId) ?? 0) + line.amountPaise + line.tdsPaise,
        );
      }

      return {
        ...receipt,
        suggested: allocations,
        unallocatedPaise,
        /** Ready for `reallocatePayment`: the old lines plus the new. */
        allocations: mergeAllocations(receipt.allocations, allocations),
      };
    });
}

/**
 * A receipt's existing allocations plus newly suggested ones, as the rupee
 * strings `reallocatePayment` reads.
 *
 * **Merged by invoice, never appended.** A receipt already partly on an
 * invoice and now being topped up on the same invoice has to arrive as one
 * line: two lines for one invoice pass the arithmetic and then read as two
 * separate payments on the client's ledger.
 *
 * `reallocatePayment` replaces every allocation on the payment, so the
 * existing lines have to be sent back with the new ones — leaving them out
 * would quietly take credit off the invoices they are sitting on.
 */
export function mergeAllocations(existing, suggested) {
  /** @type {Map<string, {amountPaise: number, tdsPaise: number}>} */
  const byInvoice = new Map();

  for (const line of [...(existing ?? []), ...(suggested ?? [])]) {
    const key = String(line.invoiceId);
    const row = byInvoice.get(key) ?? { amountPaise: 0, tdsPaise: 0 };
    row.amountPaise += line.amountPaise ?? 0;
    row.tdsPaise += line.tdsPaise ?? 0;
    byInvoice.set(key, row);
  }

  return [...byInvoice.entries()].map(([invoiceId, row]) => ({
    invoiceId,
    amount: String(row.amountPaise / 100),
    tds: String(row.tdsPaise / 100),
  }));
}
