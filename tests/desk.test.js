import { describe, expect, it } from "vitest";
import {
  mergeAllocations,
  suggestForReceipts,
} from "../lib/billing/allocation.js";

/**
 * Where the accounts desk offers to put unapplied money (P3-31).
 *
 * The desk's one-click apply sends exactly what the screen showed, so the
 * arithmetic behind what it shows is the thing to be sure of. Two ways it
 * can go wrong, and both lose money: two receipts pointed at the same
 * invoice, and a top-up that forgets where the receipt already sits.
 */

/* The shape `openInvoicesFor` returns: the raw figures, because
   `suggestAllocation` works the outstanding out for itself. */
const invoices = [
  {
    id: "inv-1",
    number: "NOI/0001",
    totalPaise: 100_000,
    paidPaise: 0,
    tdsCreditedPaise: 0,
    outstandingPaise: 100_000,
  },
  {
    id: "inv-2",
    number: "NOI/0002",
    totalPaise: 50_000,
    paidPaise: 0,
    tdsCreditedPaise: 0,
    outstandingPaise: 50_000,
  },
];

describe("one receipt", () => {
  it("fills the oldest invoice first and leaves the rest as credit", () => {
    const [receipt] = suggestForReceipts(
      [{ id: "p1", date: "2026-10-01", paise: 120_000 }],
      invoices,
    );
    expect(receipt.suggested).toEqual([
      { invoiceId: "inv-1", amountPaise: 100_000, tdsPaise: 0 },
      { invoiceId: "inv-2", amountPaise: 20_000, tdsPaise: 0 },
    ]);
    expect(receipt.unallocatedPaise).toBe(0);
  });

  it("leaves what nothing is owed on as credit, which is not an error", () => {
    const [receipt] = suggestForReceipts(
      [{ id: "p1", date: "2026-10-01", paise: 200_000 }],
      invoices,
    );
    expect(receipt.unallocatedPaise).toBe(50_000);
  });

  it("suggests nothing when nothing is outstanding", () => {
    const [receipt] = suggestForReceipts(
      [{ id: "p1", date: "2026-10-01", paise: 5_000 }],
      [],
    );
    expect(receipt.suggested).toEqual([]);
    expect(receipt.unallocatedPaise).toBe(5_000);
  });
});

describe("several receipts at once", () => {
  it("does not offer the same invoice to two receipts", () => {
    /* The first receipt clears NOI/0001. Without taking that off the
       outstanding, the second would be offered it again and the desk
       would propose applying ₹2,000 of credit to a paid invoice. */
    const rows = suggestForReceipts(
      [
        { id: "p1", date: "2026-10-01", paise: 100_000 },
        { id: "p2", date: "2026-10-05", paise: 60_000 },
      ],
      invoices,
    );

    expect(rows[0].suggested).toEqual([
      { invoiceId: "inv-1", amountPaise: 100_000, tdsPaise: 0 },
    ]);
    expect(rows[1].suggested).toEqual([
      { invoiceId: "inv-2", amountPaise: 50_000, tdsPaise: 0 },
    ]);
    expect(rows[1].unallocatedPaise).toBe(10_000);
  });

  it("takes the oldest money first, whatever order it was handed in", () => {
    const rows = suggestForReceipts(
      [
        { id: "later", date: "2026-10-20", paise: 100_000 },
        { id: "earlier", date: "2026-10-01", paise: 100_000 },
      ],
      invoices,
    );
    expect(rows.map((row) => row.id)).toEqual(["earlier", "later"]);
    expect(rows[0].suggested[0].invoiceId).toBe("inv-1");
  });

  it("splits one invoice across two receipts when neither covers it", () => {
    const rows = suggestForReceipts(
      [
        { id: "p1", date: "2026-10-01", paise: 40_000 },
        { id: "p2", date: "2026-10-05", paise: 40_000 },
      ],
      [invoices[0]],
    );
    expect(rows[0].suggested[0].amountPaise).toBe(40_000);
    expect(rows[1].suggested[0].amountPaise).toBe(40_000);
    /* 80,000 of a 1,00,000 invoice: nothing is over-applied. */
    const total = rows
      .flatMap((row) => row.suggested)
      .reduce((sum, line) => sum + line.amountPaise, 0);
    expect(total).toBe(80_000);
  });
});

describe("merging with what is already there", () => {
  it("sends the existing allocations back, so credit is not taken off", () => {
    /* `reallocatePayment` replaces every allocation on the payment. A
       top-up that sent only the new line would strip the old one. */
    const [receipt] = suggestForReceipts(
      [
        {
          id: "p1",
          date: "2026-10-01",
          paise: 30_000,
          allocations: [
            { invoiceId: "inv-9", amountPaise: 70_000, tdsPaise: 0 },
          ],
        },
      ],
      invoices,
    );
    expect(receipt.allocations).toEqual([
      { invoiceId: "inv-9", amount: "700", tds: "0" },
      { invoiceId: "inv-1", amount: "300", tds: "0" },
    ]);
  });

  it("merges a top-up on the same invoice into one line", () => {
    /* Two lines for one invoice pass the arithmetic and then read as two
       separate payments on the ledger. */
    expect(
      mergeAllocations(
        [{ invoiceId: "inv-1", amountPaise: 40_000, tdsPaise: 1_000 }],
        [{ invoiceId: "inv-1", amountPaise: 20_000, tdsPaise: 500 }],
      ),
    ).toEqual([{ invoiceId: "inv-1", amount: "600", tds: "15" }]);
  });

  it("writes rupee strings that survive the round trip through paise", () => {
    /* The action reads these with `toPaise`, so an odd number of paise
       must not round away. */
    expect(
      mergeAllocations([], [{ invoiceId: "a", amountPaise: 25_051 }]),
    ).toEqual([{ invoiceId: "a", amount: "250.51", tds: "0" }]);
  });

  it("copes with no existing allocations and no suggestion", () => {
    expect(mergeAllocations(undefined, undefined)).toEqual([]);
  });
});
