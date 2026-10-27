import { describe, it, expect } from "vitest";
import {
  dateRange,
  describeFilters,
  REPORTS,
} from "../lib/reports/standard.js";
import { displayRows, displayTotals, cell } from "../lib/reports/format.js";
import { istDate } from "../lib/dates.js";

/**
 * The parts of the reports that are arithmetic rather than queries: the
 * date range out of the filter bar, and the formatting that both the
 * screen and the printed page share.
 *
 * The queries themselves are checked in the browser against the lists
 * they link to, which is the only check that means anything for them —
 * spec section 17 asks that the figures match the lists, and only a real
 * database can say whether they do.
 */

describe("the date range from the filter bar", () => {
  it("is nothing when neither end is given", () => {
    expect(dateRange({})).toBeNull();
  });

  it("reads an Indian day, not a UTC one", () => {
    const range = dateRange({ from: "2026-10-01" });
    // 1 Oct 2026 00:00 IST is 30 Sep 18:30 UTC
    expect(range.$gte.toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("includes the whole of the last day, not up to its midnight", () => {
    const range = dateRange({ to: "2026-10-31" });
    expect(range.$lte.toISOString().slice(0, 10)).toBe("2026-10-31");
    // 23:59:59 IST, so work filed that evening is in the report
    expect(range.$lte.toISOString()).toContain("18:29:59");
  });

  it("takes both ends together", () => {
    const range = dateRange({ from: "2026-04-01", to: "2027-03-31" });
    expect(range.$gte).toBeInstanceOf(Date);
    expect(range.$lte).toBeInstanceOf(Date);
  });
});

describe("what a printed report says it is", () => {
  it("says so plainly when nothing was filtered", () => {
    expect(describeFilters({})).toBe("No filters.");
  });

  it("names the dates in Indian format", () => {
    const note = describeFilters({ from: "2026-04-01", to: "2026-06-30" });
    expect(note).toContain("01-04-2026 to 30-06-2026");
  });

  it("says 'today' when only a start date was given", () => {
    expect(describeFilters({ from: "2026-04-01" })).toContain("to today");
  });

  it("prefers a name to an id, so a printout is readable", () => {
    const note = describeFilters(
      { branch: "66f0a", status: "Under review" },
      { branch: "Ludhiana" },
    );
    expect(note).toContain("branch Ludhiana");
    expect(note).not.toContain("66f0a");
    expect(note).toContain("status Under review");
  });
});

describe("formatting a cell", () => {
  it("writes money in rupees with Indian grouping", () => {
    expect(cell(1_845_000, "money")).toBe("₹18,450");
  });

  it("writes a date as DD-MM-YYYY in IST", () => {
    expect(cell(istDate(2026, 10, 20), "date")).toBe("20-10-2026");
  });

  it("groups a plain count the Indian way too", () => {
    expect(cell(1234567, "int")).toBe("12,34,567");
  });

  it("leaves a missing value blank rather than printing zero or 'null'", () => {
    for (const kind of ["money", "date", "int", "text"]) {
      expect(cell(null, kind)).toBe("");
      expect(cell(undefined, kind)).toBe("");
      expect(cell("", kind)).toBe("");
    }
  });

  it("keeps a real zero, which is not the same as nothing", () => {
    expect(cell(0, "money")).toBe("₹0");
    expect(cell(0, "int")).toBe("0");
  });
});

describe("one report, the same figures on screen and on paper", () => {
  const report = {
    columns: [
      { header: "Client", key: "client" },
      { header: "Fee", key: "fee", kind: "money" },
      { header: "Due", key: "due", kind: "date" },
      { header: "Jobs", key: "jobs", kind: "int" },
    ],
    rows: [
      {
        client: "Rao & Co",
        fee: 2_500_000,
        due: istDate(2026, 10, 20),
        jobs: 3,
        // a field the report does not show must not leak into the printout
        pan: "AAACR1234F",
      },
    ],
  };

  it("formats every column and only the columns", () => {
    const [row] = displayRows(report);
    expect(row).toEqual({
      client: "Rao & Co",
      fee: "₹25,000",
      due: "20-10-2026",
      jobs: "3",
    });
    expect(row.pan).toBeUndefined();
  });

  it("turns a money total into rupees and leaves a count alone", () => {
    const totals = displayTotals([
      { label: "Fees not yet billed", value: "4500000" },
      { label: "Engagements", value: "17" },
    ]);
    expect(totals[0].value).toBe("₹45,000");
    expect(totals[1].value).toBe("17");
  });
});

describe("the report catalog", () => {
  it("gives every report a permission area and a runner", () => {
    for (const [key, definition] of Object.entries(REPORTS)) {
      expect(typeof definition.run, key).toBe("function");
      expect(definition.area, key).toBeTruthy();
    }
  });

  it("offers PDF only for the reports people print", () => {
    const pdf = Object.entries(REPORTS)
      .filter(([, definition]) => definition.pdf)
      .map(([key]) => key)
      .sort();
    // the three a partner takes into a Monday meeting, plus the two P2-10c
    // added for the same reason: a file review and a punctuality review
    // both happen away from a screen. At risk joined them at P3-5 — it is
    // the list that meeting is actually for, since it is the only one that
    // can still be acted on
    expect(pdf).toEqual([
      "at-risk",
      "opinions",
      "overdue",
      "pending-documents",
      "punctuality",
      "status",
    ]);
  });
});
