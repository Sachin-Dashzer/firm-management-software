import { describe, it, expect } from "vitest";
import { buildHeads, periodsElapsed } from "../lib/compliance/heads.js";

/**
 * The head view answers "where does GST stand this year", which the grid
 * cannot: the grid is one service at a time. The two counts that matter are
 * overdue (created, late, not done) and not created at all.
 */

const NOW = new Date("2026-10-17T06:00:00Z"); // 17 Oct 2026, IST afternoon

const SERVICES = [
  {
    id: "gst",
    code: "GSTR3B",
    name: "GSTR-1 / GSTR-3B filing",
    category: "Indirect Tax",
    recurrence: "monthly",
  },
  {
    id: "tds",
    code: "TDS-RET",
    name: "TDS return (24Q / 26Q)",
    category: "Direct Tax",
    recurrence: "quarterly",
  },
  {
    id: "itr",
    code: "ITR-BUS",
    name: "ITR — business",
    category: "Direct Tax",
    recurrence: "annual",
  },
];

describe("how much of the year has closed", () => {
  it("counts only periods that have ended", () => {
    // April to September have closed; October is the month we are in
    expect(periodsElapsed("monthly", 2026, NOW)).toBe(6);
    expect(periodsElapsed("quarterly", 2026, NOW)).toBe(2);
    expect(periodsElapsed("annual", 2026, NOW)).toBe(0);
  });
});

describe("the heads of compliance", () => {
  const subscribers = new Map([
    ["gst", 2],
    ["tds", 1],
    ["itr", 1],
  ]);

  function heads(engagements) {
    return buildHeads({
      services: SERVICES,
      engagements,
      subscribers,
      fyStart: 2026,
      now: NOW,
    });
  }

  it("groups the services under the catalog's own categories", () => {
    const { categories } = heads([]);
    expect(categories.map((c) => c.name)).toEqual([
      "Direct Tax",
      "Indirect Tax",
    ]);
    expect(categories[0].lines.map((l) => l.code)).toEqual([
      "ITR-BUS",
      "TDS-RET",
    ]);
  });

  it("counts a period nobody created as missing, not as open", () => {
    // two GST clients, six closed months, nothing created at all
    const { categories, totals } = heads([]);
    const gst = categories[1].lines[0];
    expect(gst.missing).toBe(12);
    expect(gst.open).toBe(0);
    expect(totals.missing).toBe(12 + 2); // GST 12, TDS 2, ITR none due yet
  });

  it("separates finished work from work that is late", () => {
    const { categories } = heads([
      { serviceTemplateId: "gst", status: "Completed" },
      { serviceTemplateId: "gst", status: "Filed / delivered" },
      {
        serviceTemplateId: "gst",
        status: "In progress",
        statutoryDue: new Date("2026-09-20T00:00:00Z"),
      },
      {
        serviceTemplateId: "gst",
        status: "In progress",
        statutoryDue: new Date("2026-11-20T00:00:00Z"),
      },
      { serviceTemplateId: "gst", status: "On hold" },
      { serviceTemplateId: "gst", status: "Cancelled" },
    ]);

    const gst = categories[1].lines[0];
    expect(gst.created).toBe(6);
    expect(gst.done).toBe(2);
    expect(gst.open).toBe(2);
    expect(gst.overdue).toBe(1);
    expect(gst.onHold).toBe(1);
    expect(gst.missing).toBe(12 - 6);
  });

  it("falls back to the internal date when there is no statutory one", () => {
    const { categories } = heads([
      {
        serviceTemplateId: "tds",
        status: "Awaiting documents",
        statutoryDue: null,
        internalDue: new Date("2026-07-25T00:00:00Z"),
      },
    ]);
    expect(categories[0].lines[1].overdue).toBe(1);
  });

  it("never reports negative work left to create", () => {
    // more returns than the subscription implies — a client who joined
    // mid-year, or work created for someone nobody signed up
    const { categories } = heads(
      Array.from({ length: 20 }, () => ({
        serviceTemplateId: "gst",
        status: "Completed",
      })),
    );
    expect(categories[1].lines[0].missing).toBe(0);
  });

  it("ignores an engagement for a service that is no longer in the catalog", () => {
    const { totals } = heads([
      { serviceTemplateId: "retired-service", status: "In progress" },
    ]);
    expect(totals.open).toBe(0);
  });
});
