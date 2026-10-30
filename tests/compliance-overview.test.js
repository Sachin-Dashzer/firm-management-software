import { describe, it, expect } from "vitest";
import { buildHeads, frequencySummary } from "../lib/compliance/heads.js";
import { missingCells, periodsInYear } from "../lib/compliance/grid.js";

/**
 * The compliance overview's arithmetic (P3-34 phase 4).
 *
 * Two things here decide what a partner does on a Monday: the on-time
 * figure, and the list of periods nobody opened a job for. The second one
 * is also what a button writes fifty engagements from, so it is tested as
 * carefully as the money code.
 */

const now = new Date("2026-10-30T06:00:00Z");
const FY = 2026;

const services = [
  {
    id: "gst",
    code: "GSTR1-3B",
    name: "GSTR-1 / 3B",
    category: "Indirect tax",
    recurrence: "monthly",
  },
  {
    id: "tds",
    code: "TDS-RET",
    name: "TDS returns",
    category: "Direct tax",
    recurrence: "quarterly",
  },
  {
    id: "itr",
    code: "ITR-BUS",
    name: "Income tax return",
    category: "Direct tax",
    recurrence: "annual",
  },
  {
    id: "pf",
    code: "PF-ESI",
    name: "PF / ESI",
    category: "Payroll",
    recurrence: "half-yearly",
  },
];

/** A finished job whose single filing went in `late` days after its date. */
const filed = (serviceId, period, late) => ({
  serviceTemplateId: serviceId,
  period,
  status: "Completed",
  milestones: [
    {
      name: "Return",
      dueDate: new Date("2026-05-11T00:00:00Z"),
      filedOn: new Date(
        new Date("2026-05-11T00:00:00Z").getTime() + late * 86_400_000,
      ),
    },
  ],
});

describe("the on-time figure", () => {
  it("is a ratio of counts, so a tiny head cannot swing a big one", () => {
    const heads = buildHeads({
      services,
      // 9 of 10 GST filings on time; the one ITR was late
      engagements: [
        ...Array.from({ length: 9 }, (_, i) => filed("gst", `2026-${i}`, 0)),
        filed("gst", "2026-9", 2),
        filed("itr", "2026-27", 30),
      ],
      subscribers: new Map([
        ["gst", 1],
        ["itr", 1],
      ]),
      fyStart: FY,
      now,
    });

    // 9 of 11, not the average of 90% and 0%
    expect(heads.totals.met).toBe(9);
    expect(heads.totals.judged).toBe(11);
    expect(frequencySummary(heads).all.onTime).toBe(82);
  });

  it("says nothing rather than nought when nothing can be judged", () => {
    // a firm that has filed nothing is not a firm that is 0% on time
    const heads = buildHeads({
      services,
      engagements: [
        { serviceTemplateId: "gst", period: "2026-04", status: "In progress" },
      ],
      subscribers: new Map([["gst", 1]]),
      fyStart: FY,
      now,
    });
    expect(frequencySummary(heads).all.onTime).toBeNull();
  });

  it("leaves out work that was filed with no date behind it", () => {
    // `wasOnTime()` is three-valued and the third value is the point
    const heads = buildHeads({
      services,
      engagements: [
        filed("gst", "2026-04", 0),
        {
          serviceTemplateId: "gst",
          period: "2026-05",
          status: "Completed",
          milestones: [{ name: "Return", filedOn: new Date(), dueDate: null }],
        },
      ],
      subscribers: new Map([["gst", 1]]),
      fyStart: FY,
      now,
    });
    expect(heads.totals.judged).toBe(1);
    expect(frequencySummary(heads).all.onTime).toBe(100);
  });
});

describe("the frequency cards", () => {
  const heads = buildHeads({
    services,
    engagements: [
      {
        serviceTemplateId: "gst",
        period: "2026-04",
        status: "In progress",
        statutoryDue: new Date("2026-05-11"),
      },
      {
        serviceTemplateId: "gst",
        period: "2026-05",
        status: "In progress",
        statutoryDue: new Date("2027-05-11"),
      },
      {
        serviceTemplateId: "tds",
        period: "2026-Q1",
        status: "In progress",
        statutoryDue: new Date("2027-01-31"),
      },
    ],
    subscribers: new Map([
      ["gst", 2],
      ["tds", 1],
      ["itr", 1],
      ["pf", 1],
    ]),
    fyStart: FY,
    now,
  });
  const summary = frequencySummary(heads);

  it("puts half-yearly with annual rather than giving it a card of its own", () => {
    // two filings a year is an annual rhythm to the person reading this
    expect(summary.annual.heads).toContain("PF / ESI");
    expect(summary.annual.heads).toContain("Income tax return");
    expect(summary.quarterly.heads).toEqual(["TDS returns"]);
  });

  it("counts in hand as open work that is not yet late", () => {
    expect(summary.monthly.overdue).toBe(1);
    expect(summary.monthly.inHand).toBe(1);
  });

  it("totals the three rhythms into All heads", () => {
    const parts =
      summary.monthly.count + summary.quarterly.count + summary.annual.count;
    expect(summary.all.count).toBe(parts);
    expect(summary.all.count).toBe(services.length);
  });
});

describe("the periods nobody opened a job for", () => {
  const periodsOf = (id) => {
    const service = services.find((s) => s.id === id);
    return periodsInYear(service.recurrence, FY);
  };

  const monthly = periodsInYear("monthly", FY);
  const closed = monthly.filter((p) => p.end <= now);

  it("finds every closed period of a subscription with nothing in it", () => {
    const holes = missingCells({
      subscriptions: [{ clientId: "c1", serviceTemplateId: "gst" }],
      engagements: [],
      periodsOf,
      now,
    });
    expect(holes).toHaveLength(closed.length);
    expect(holes.every((hole) => hole.clientId === "c1")).toBe(true);
  });

  it("leaves the period the firm is still in alone", () => {
    // October's return is not missing on the 30th of October
    const holes = missingCells({
      subscriptions: [{ clientId: "c1", serviceTemplateId: "gst" }],
      engagements: [],
      periodsOf,
      now,
    });
    const open = monthly.find((p) => p.end > now);
    expect(holes.map((h) => h.period)).not.toContain(open.code);
  });

  it("counts a cancelled job as an answer, because somebody looked", () => {
    const holes = missingCells({
      subscriptions: [{ clientId: "c1", serviceTemplateId: "gst" }],
      engagements: [
        {
          clientId: "c1",
          serviceTemplateId: "gst",
          period: closed[0].code,
          status: "Cancelled",
        },
      ],
      periodsOf,
      now,
    });
    expect(holes.map((h) => h.period)).not.toContain(closed[0].code);
  });

  it("leaves out a period somebody has explained (P3-9)", () => {
    const holes = missingCells({
      subscriptions: [{ clientId: "c1", serviceTemplateId: "gst" }],
      engagements: [],
      reasons: [
        { clientId: "c1", serviceTemplateId: "gst", period: closed[1].code },
      ],
      periodsOf,
      now,
    });
    expect(holes.map((h) => h.period)).not.toContain(closed[1].code);
  });

  /**
   * The `startPeriod` rule. `buildHeads` counts expected periods without
   * it and reads one short per client who joined mid-year; this is the
   * exact answer, and it is the one the button acts on.
   */
  it("never asks for a period before the client signed up", () => {
    const from = closed[3].code;
    const holes = missingCells({
      subscriptions: [
        { clientId: "c1", serviceTemplateId: "gst", startPeriod: from },
      ],
      engagements: [],
      periodsOf,
      now,
    });
    expect(holes.every((hole) => hole.period >= from)).toBe(true);
    expect(holes).toHaveLength(closed.length - 3);
  });

  it("keeps two clients' holes apart", () => {
    const holes = missingCells({
      subscriptions: [
        { clientId: "c1", serviceTemplateId: "gst" },
        { clientId: "c2", serviceTemplateId: "gst" },
      ],
      engagements: [
        { clientId: "c1", serviceTemplateId: "gst", period: closed[0].code },
      ],
      periodsOf,
      now,
    });
    const forC1 = holes.filter((h) => h.clientId === "c1");
    const forC2 = holes.filter((h) => h.clientId === "c2");
    expect(forC2).toHaveLength(closed.length);
    expect(forC1).toHaveLength(closed.length - 1);
  });

  it("does not confuse two services that share a period code", () => {
    const holes = missingCells({
      subscriptions: [
        { clientId: "c1", serviceTemplateId: "gst" },
        { clientId: "c1", serviceTemplateId: "tds" },
      ],
      // a GST job for Q1's code would not answer for the TDS quarter
      engagements: [
        { clientId: "c1", serviceTemplateId: "gst", period: closed[0].code },
      ],
      periodsOf,
      now,
    });
    expect(holes.some((h) => h.serviceTemplateId === "tds")).toBe(true);
  });

  it("says nothing when every closed period has an answer", () => {
    const holes = missingCells({
      subscriptions: [{ clientId: "c1", serviceTemplateId: "gst" }],
      engagements: closed.map((period) => ({
        clientId: "c1",
        serviceTemplateId: "gst",
        period: period.code,
      })),
      periodsOf,
      now,
    });
    expect(holes).toEqual([]);
  });

  it("carries the period's own words, so the report can be read", () => {
    const [hole] = missingCells({
      subscriptions: [{ clientId: "c1", serviceTemplateId: "gst" }],
      engagements: [],
      periodsOf,
      now,
    });
    expect(hole.periodLabel).toBeTruthy();
    expect(hole.periodLabel).not.toBe(hole.period);
  });
});
