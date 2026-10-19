import { describe, it, expect } from "vitest";
import {
  outstandingOf,
  statusAfterPayment,
  suggestAllocation,
  checkAllocation,
  ageReceivables,
  buildLedger,
} from "../lib/billing/allocation.js";

/**
 * Money against invoices. Getting this almost right means chasing a client
 * who has paid, or failing to chase one who has not — so the cases below
 * are the awkward real ones: TDS, part payments, advances, and a client
 * who sends one transfer for four bills.
 */

const invoice = (id, total, paid = 0, tds = 0, over = {}) => ({
  id,
  number: id,
  totalPaise: total,
  paidPaise: paid,
  tdsCreditedPaise: tds,
  status: "Sent",
  ...over,
});

describe("what is still owed", () => {
  it("takes off both the cash and the TDS", () => {
    expect(outstandingOf(invoice("A", 118000, 90000, 10000))).toBe(18000);
  });

  it("never goes below nothing, even if overpaid", () => {
    expect(outstandingOf(invoice("A", 100000, 150000))).toBe(0);
  });
});

describe("the status a payment leaves behind", () => {
  it("is Paid when cash and TDS together cover the bill", () => {
    // ₹1,18,000 invoice: client pays ₹1,08,000 and deducts ₹10,000 TDS
    const settled = invoice("A", 11800000, 10800000, 1000000);
    expect(statusAfterPayment(settled)).toBe("Paid");
  });

  it("is Partially paid when something is still owed", () => {
    expect(statusAfterPayment(invoice("A", 11800000, 5000000))).toBe(
      "Partially paid",
    );
  });

  it("goes back to Sent when nothing has been received", () => {
    expect(statusAfterPayment(invoice("A", 11800000))).toBe("Sent");
  });

  it("leaves a dispute alone until it is settled", () => {
    expect(
      statusAfterPayment(invoice("A", 100000, 0, 0, { status: "Disputed" })),
    ).toBe("Disputed");
  });

  it("does not revive a cancelled or written-off invoice", () => {
    for (const status of ["Cancelled", "Written off", "Draft"]) {
      expect(
        statusAfterPayment(invoice("A", 100000, 100000, 0, { status })),
      ).toBe(status);
    }
  });
});

describe("spreading one receipt across several invoices", () => {
  const open = [
    invoice("oldest", 100000),
    invoice("middle", 200000),
    invoice("newest", 300000),
  ];

  it("fills the oldest first", () => {
    const { allocations, unallocatedPaise } = suggestAllocation(250000, open);
    expect(allocations).toEqual([
      { invoiceId: "oldest", amountPaise: 100000, tdsPaise: 0 },
      { invoiceId: "middle", amountPaise: 150000, tdsPaise: 0 },
    ]);
    expect(unallocatedPaise).toBe(0);
  });

  it("leaves the rest as credit on the client rather than losing it", () => {
    const { allocations, unallocatedPaise } = suggestAllocation(700000, open);
    expect(allocations).toHaveLength(3);
    expect(unallocatedPaise).toBe(100000);
  });

  it("puts TDS against the invoice, not against the cash", () => {
    // a ₹1,180 bill where the client sends ₹1,080 and deducts ₹100
    const one = [invoice("A", 118000)];
    const { allocations, unallocatedPaise } = suggestAllocation(
      108000,
      one,
      10000,
    );
    expect(allocations).toEqual([
      { invoiceId: "A", amountPaise: 108000, tdsPaise: 10000 },
    ]);
    expect(unallocatedPaise).toBe(0);
    // and that settles it
    expect(
      statusAfterPayment({
        ...one[0],
        paidPaise: 108000,
        tdsCreditedPaise: 10000,
      }),
    ).toBe("Paid");
  });

  it("skips an invoice that is already settled", () => {
    const mixed = [invoice("settled", 100000, 100000), invoice("open", 50000)];
    const { allocations } = suggestAllocation(50000, mixed);
    expect(allocations).toEqual([
      { invoiceId: "open", amountPaise: 50000, tdsPaise: 0 },
    ]);
  });

  it("handles an advance against nothing at all", () => {
    const { allocations, unallocatedPaise } = suggestAllocation(500000, []);
    expect(allocations).toEqual([]);
    expect(unallocatedPaise).toBe(500000);
  });

  it("never allocates more than an invoice is owed", () => {
    const { allocations } = suggestAllocation(999999, [invoice("A", 100000)]);
    expect(allocations[0].amountPaise).toBe(100000);
  });
});

describe("checking what someone typed", () => {
  const invoices = new Map([
    ["A", invoice("A", 100000)],
    ["B", invoice("B", 200000, 50000)],
  ]);

  it("accepts a sensible allocation", () => {
    expect(
      checkAllocation({
        amountPaise: 150000,
        allocations: [
          { invoiceId: "A", amountPaise: 100000 },
          { invoiceId: "B", amountPaise: 50000 },
        ],
        invoices,
      }),
    ).toEqual([]);
  });

  it("refuses allocating more than arrived", () => {
    const problems = checkAllocation({
      amountPaise: 50000,
      allocations: [{ invoiceId: "A", amountPaise: 100000 }],
      invoices,
    });
    expect(problems[0]).toMatch(/More has been allocated than was received/);
  });

  it("refuses putting more against an invoice than it is owed", () => {
    const problems = checkAllocation({
      amountPaise: 500000,
      allocations: [{ invoiceId: "B", amountPaise: 400000 }],
      invoices,
    });
    expect(problems.some((p) => /than it is owed/.test(p))).toBe(true);
  });

  it("refuses more TDS than the client deducted", () => {
    const problems = checkAllocation({
      amountPaise: 10000,
      tdsPaise: 1000,
      allocations: [{ invoiceId: "A", amountPaise: 10000, tdsPaise: 5000 }],
      invoices,
    });
    expect(problems.some((p) => /More TDS/.test(p))).toBe(true);
  });

  it("refuses a payment of nothing", () => {
    expect(
      checkAllocation({ amountPaise: 0, allocations: [], invoices }),
    ).toHaveLength(1);
  });

  it("refuses a negative allocation", () => {
    const problems = checkAllocation({
      amountPaise: 10000,
      allocations: [{ invoiceId: "A", amountPaise: -5000 }],
      invoices,
    });
    expect(problems.some((p) => /cannot be negative/.test(p))).toBe(true);
  });
});

describe("receivables ageing", () => {
  const now = new Date("2026-10-17T00:00:00+05:30");
  const due = (daysAgo, amount) => ({
    dueDate: new Date(now.getTime() - daysAgo * 86_400_000),
    outstandingPaise: amount,
  });

  it("sorts invoices into the four buckets", () => {
    const aged = ageReceivables(
      [
        due(-5, 100000), // not due yet
        due(10, 200000),
        due(45, 300000),
        due(75, 400000),
        due(200, 500000),
      ],
      now,
    );

    expect(aged.current).toBe(100000);
    expect(aged["0-30"]).toBe(200000);
    expect(aged["31-60"]).toBe(300000);
    expect(aged["61-90"]).toBe(400000);
    expect(aged["90+"]).toBe(500000);
    expect(aged.total).toBe(1500000);
  });

  it("treats an invoice with no due date as current", () => {
    expect(
      ageReceivables([{ dueDate: null, outstandingPaise: 50000 }], now).current,
    ).toBe(50000);
  });

  it("ignores anything already settled", () => {
    expect(ageReceivables([due(100, 0)], now).total).toBe(0);
  });

  it("puts the boundary days in the lower bucket", () => {
    expect(ageReceivables([due(30, 1000)], now)["0-30"]).toBe(1000);
    expect(ageReceivables([due(31, 1000)], now)["31-60"]).toBe(1000);
  });
});

describe("the client ledger", () => {
  it("runs a balance down the page", () => {
    const { entries, closingPaise } = buildLedger(
      [
        {
          _id: "i1",
          number: "NOI/26-27/0001",
          type: "Tax invoice",
          status: "Paid",
          date: new Date("2026-04-10"),
          totalPaise: 118000,
        },
        {
          _id: "i2",
          number: "NOI/26-27/0002",
          type: "Tax invoice",
          status: "Sent",
          date: new Date("2026-06-10"),
          totalPaise: 59000,
        },
      ],
      [
        {
          _id: "p1",
          date: new Date("2026-05-05"),
          amountPaise: 108000,
          tdsPaise: 10000,
          mode: "Bank transfer",
          reference: "NEFT001",
        },
      ],
    );

    expect(entries.map((e) => e.kind)).toEqual([
      "Invoice",
      "Payment",
      "TDS credited",
      "Invoice",
    ]);
    // 1,180 owed, 1,080 paid, 100 TDS, then 590 more owed
    expect(entries[0].balancePaise).toBe(118000);
    expect(entries[2].balancePaise).toBe(0);
    expect(closingPaise).toBe(59000);
  });

  it("subtracts a credit note instead of adding it", () => {
    const { closingPaise } = buildLedger(
      [
        {
          _id: "i1",
          number: "A",
          type: "Tax invoice",
          status: "Sent",
          date: new Date("2026-04-10"),
          totalPaise: 100000,
        },
        {
          _id: "c1",
          number: "B",
          type: "Credit note",
          status: "Sent",
          date: new Date("2026-04-20"),
          totalPaise: 40000,
        },
      ],
      [],
    );
    expect(closingPaise).toBe(60000);
  });

  it("leaves drafts, cancellations and write-offs out of the balance", () => {
    const { entries, closingPaise } = buildLedger(
      [
        {
          _id: "d",
          type: "Tax invoice",
          status: "Draft",
          date: new Date(),
          totalPaise: 999999,
        },
        {
          _id: "c",
          type: "Tax invoice",
          status: "Cancelled",
          date: new Date(),
          totalPaise: 999999,
        },
        {
          _id: "w",
          type: "Tax invoice",
          status: "Written off",
          date: new Date(),
          totalPaise: 999999,
        },
      ],
      [],
    );
    expect(entries).toHaveLength(0);
    expect(closingPaise).toBe(0);
  });
});
