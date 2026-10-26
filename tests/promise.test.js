import { describe, it, expect } from "vitest";
import {
  promiseHolds,
  promiseDate,
  promiseBroken,
  checkPromise,
  splitByPromise,
} from "../lib/billing/promise.js";
import { invoiceReminders } from "../lib/mailer/sweep.js";

/**
 * Payment promises (P3-3).
 *
 * The property worth testing is that a promise **expires by itself**. A flag
 * somebody has to clear is a flag that stays set: the client pays, nobody
 * remembers, and the invoice is never chased again. So the sweep reads the
 * date, and the day after it passes the ordinary cadence resumes with no
 * human involved.
 *
 * The second is that it is per invoice. A client can be good for one bill
 * and arguing about another, and a promise about the first must not buy
 * silence on the second.
 */

const d = (s) => new Date(`${s}T00:00:00+05:30`);
const NOW = new Date("2026-10-26T09:00:00+05:30");

const invoice = (over = {}) => ({
  _id: "i1",
  number: "NOI/26-27/0087",
  status: "Sent",
  dueDate: d("2026-10-01"),
  totalPaise: 2_36_000_00,
  paidPaise: 0,
  tdsCreditedPaise: 0,
  promise: null,
  ...over,
});

const RULES = {
  invoiceReminder: {
    enabled: true,
    daysBefore: [3],
    everyDays: 7,
  },
};
const CONTACT = { email: "accounts@client.example", clientName: "Client" };

describe("whether a promise is holding", () => {
  it("holds on the promised day itself", () => {
    const i = invoice({ promise: { date: d("2026-10-26") } });
    expect(promiseHolds(i, NOW)).toBe(true);
  });

  it("holds for a date still to come", () => {
    const i = invoice({ promise: { date: d("2026-11-10") } });
    expect(promiseHolds(i, NOW)).toBe(true);
    expect(promiseBroken(i, NOW)).toBe(false);
  });

  it("stops holding the day after, with nobody clearing anything", () => {
    const i = invoice({ promise: { date: d("2026-10-25") } });
    // this is the whole point: it expires on its own
    expect(promiseHolds(i, NOW)).toBe(false);
    expect(promiseBroken(i, NOW)).toBe(true);
  });

  it("is not holding when there is no promise", () => {
    expect(promiseHolds(invoice(), NOW)).toBe(false);
    expect(promiseBroken(invoice(), NOW)).toBe(false);
    expect(promiseDate(invoice())).toBeNull();
  });
});

describe("checking a date before it becomes a promise", () => {
  it("takes today, because a client who rings at 9am means today", () => {
    expect(checkPromise(d("2026-10-26"), NOW).ok).toBe(true);
  });

  it("takes a future date", () => {
    expect(checkPromise(d("2026-11-30"), NOW).ok).toBe(true);
  });

  it("refuses a date already gone", () => {
    const out = checkPromise(d("2026-10-20"), NOW);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/already passed/i);
  });

  it("refuses nothing at all", () => {
    expect(checkPromise(null, NOW).ok).toBe(false);
  });
});

describe("the reminder sweep", () => {
  /** 25 days overdue: a multiple of seven, so the cadence would fire. */
  const overdue = invoice({ dueDate: d("2026-09-07") });

  it("would chase an overdue invoice with no promise", () => {
    const out = invoiceReminders(
      { invoice: overdue, contact: CONTACT },
      RULES,
      NOW,
    );
    expect(out).toHaveLength(1);
  });

  it("says nothing while a promise is holding", () => {
    const out = invoiceReminders(
      {
        invoice: { ...overdue, promise: { date: d("2026-11-05") } },
        contact: CONTACT,
      },
      RULES,
      NOW,
    );
    // chasing somebody who gave you a date is how a date becomes an argument
    expect(out).toEqual([]);
  });

  it("chases again once the promised date has passed", () => {
    const out = invoiceReminders(
      {
        invoice: { ...overdue, promise: { date: d("2026-10-20") } },
        contact: CONTACT,
      },
      RULES,
      NOW,
    );
    expect(out).toHaveLength(1);
  });

  it("still says nothing about a paid invoice, promise or not", () => {
    const out = invoiceReminders(
      {
        invoice: {
          ...overdue,
          paidPaise: overdue.totalPaise,
          promise: { date: d("2026-11-05") },
        },
        contact: CONTACT,
      },
      RULES,
      NOW,
    );
    expect(out).toEqual([]);
  });
});

describe("a promise covers one invoice, not the client", () => {
  it("splits a client's invoices into chaseable and held", () => {
    const list = [
      invoice({ _id: "a", number: "A", promise: { date: d("2026-11-10") } }),
      invoice({ _id: "b", number: "B" }),
      invoice({ _id: "c", number: "C", promise: { date: d("2026-10-01") } }),
    ];

    const { eligible, held } = splitByPromise(list, NOW);
    // B has no promise and C's has passed; only A is protected
    expect(held.map((i) => i.number)).toEqual(["A"]);
    expect(eligible.map((i) => i.number)).toEqual(["B", "C"]);
  });

  it("copes with nothing", () => {
    expect(splitByPromise([], NOW)).toEqual({ eligible: [], held: [] });
    expect(splitByPromise(undefined, NOW)).toEqual({ eligible: [], held: [] });
  });
});
