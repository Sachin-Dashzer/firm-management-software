import { describe, it, expect } from "vitest";
import { PRACTICE_REPORTS } from "../lib/reports/practice.js";
import { REPORTS } from "../lib/reports/standard.js";
import { AREAS } from "../lib/permissions.js";
import { daysLate } from "../lib/practice/books.js";

/**
 * The eight reports the Phase 2 modules made answerable (P2-10c).
 *
 * The shaping is tested through the pure parts — the arithmetic each one
 * leans on and the definitions themselves. The queries wait on Atlas like
 * everything else.
 */

const ist = (text) => new Date(`${text}T12:00:00+05:30`);

describe("the definitions", () => {
  it("registers all eight into the reports the routes serve", () => {
    for (const key of Object.keys(PRACTICE_REPORTS)) {
      expect(REPORTS[key], key).toBeTruthy();
    }
    expect(Object.keys(PRACTICE_REPORTS)).toHaveLength(8);
  });

  it("gives each one a real permission area and a runner", () => {
    for (const [key, definition] of Object.entries(PRACTICE_REPORTS)) {
      expect(AREAS, key).toContain(definition.area);
      expect(typeof definition.run, key).toBe("function");
      expect(typeof definition.pdf, key).toBe("boolean");
    }
  });

  it("does not clash with a report that already existed", () => {
    const before = [
      "status",
      "overdue",
      "pending-documents",
      "revenue",
      "turnaround",
      "clients",
      "receivables",
      "unbilled",
    ];
    for (const key of Object.keys(PRACTICE_REPORTS)) {
      expect(before).not.toContain(key);
    }
    // and nothing was lost adding them
    for (const key of before) expect(REPORTS[key]).toBeTruthy();
  });

  it("prints only the two a partner takes into a meeting", () => {
    const printable = Object.entries(PRACTICE_REPORTS)
      .filter(([, d]) => d.pdf)
      .map(([key]) => key);
    expect(printable.sort()).toEqual(["opinions", "punctuality"]);
  });

  it("puts the registers behind their own areas, not a general one", () => {
    // somebody who cannot open the UDIN register must not read it as a
    // report instead
    expect(PRACTICE_REPORTS["udin-summary"].area).toBe("udin");
    expect(PRACTICE_REPORTS.certificates.area).toBe("dsc");
    expect(PRACTICE_REPORTS.grants.area).toBe("clientAccess");
    expect(PRACTICE_REPORTS.portal.area).toBe("clientPortalUsers");
  });
});

describe("the punctuality arithmetic the report leans on", () => {
  it("counts a filing on the due date as on time", () => {
    // the same boundary P2-8a pins, now reached through a report
    expect(daysLate(ist("2026-10-20"), ist("2026-10-20"))).toBe(0);
  });

  it("counts one filed the next day as a day late", () => {
    expect(daysLate(ist("2026-10-21"), ist("2026-10-20"))).toBe(1);
  });

  it("answers nothing where no deadline was recorded", () => {
    // which is why the report counts those separately rather than calling
    // them punctual: the due-date master leaves dates blank until a
    // partner confirms the rule, and crediting the firm for its own
    // missing data would flatter it
    expect(daysLate(ist("2026-10-21"), null)).toBe(0);
  });
});
