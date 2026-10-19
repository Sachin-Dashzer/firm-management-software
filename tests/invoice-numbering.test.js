import { describe, it, expect } from "vitest";
import { seriesFor, findGaps } from "../lib/billing/number.js";

/**
 * Invoice numbering is the one place where "nearly right" is a compliance
 * problem: a statutory series with a hole in it is the first thing an
 * auditor asks about.
 */

describe("the series a number belongs to", () => {
  it("is the branch and the financial year", () => {
    // 20 October 2026 is in FY 2026-27
    expect(seriesFor("NOI", new Date("2026-10-20T06:00:00Z"))).toBe(
      "NOI/26-27",
    );
  });

  it("follows the Indian financial year, not the calendar", () => {
    // 31 March 2027 is still 26-27; the next day is not
    expect(seriesFor("NOI", new Date("2027-03-31T06:00:00Z"))).toBe(
      "NOI/26-27",
    );
    expect(seriesFor("NOI", new Date("2027-04-01T06:00:00Z"))).toBe(
      "NOI/27-28",
    );
  });

  it("keeps each branch on its own series", () => {
    const date = new Date("2026-10-20T06:00:00Z");
    expect(seriesFor("LDH", date)).toBe("LDH/26-27");
    expect(seriesFor("MRT", date)).toBe("MRT/26-27");
  });

  it("refuses something that is not a branch prefix", () => {
    expect(() => seriesFor("", new Date())).toThrow();
    expect(() => seriesFor("NOIDA", new Date())).toThrow();
    expect(() => seriesFor("N1", new Date())).toThrow();
  });
});

describe("finding a hole in a series", () => {
  it("is happy with an unbroken run", () => {
    expect(findGaps([1, 2, 3, 4, 5])).toEqual({
      ok: true,
      missing: [],
      highest: 5,
    });
  });

  it("does not mind the order they are given in", () => {
    expect(findGaps([3, 1, 5, 4, 2]).ok).toBe(true);
  });

  it("names the numbers that are missing", () => {
    const result = findGaps([1, 2, 5, 6]);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([3, 4]);
  });

  it("notices a series that never started at one", () => {
    expect(findGaps([4, 5, 6]).missing).toEqual([1, 2, 3]);
  });

  it("is happy with nothing issued yet", () => {
    expect(findGaps([])).toEqual({ ok: true, missing: [], highest: 0 });
  });
});
