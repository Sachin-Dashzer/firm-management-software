import { describe, expect, it } from "vitest";
import {
  formatISTDate,
  financialYearStart,
  financialYearLabel,
  financialYearRange,
  istParts,
  istInputDate,
  addWorkingDays,
  financialQuarterLabel,
} from "@/lib/dates";

describe("IST display", () => {
  it("shows DD-MM-YYYY", () => {
    expect(formatISTDate(new Date("2026-10-16T08:00:00Z"))).toBe("16-10-2026");
  });

  it("uses the Indian calendar day, not the server's", () => {
    // 20:00 UTC on 15 Oct is already 01:30 on 16 Oct in India
    const late = new Date("2026-10-15T20:00:00Z");
    expect(formatISTDate(late)).toBe("16-10-2026");
    expect(istParts(late)).toEqual({ day: 16, month: 10, year: 2026 });
  });
});

describe("financial year (April–March)", () => {
  it("starts on 1 April", () => {
    expect(financialYearStart(new Date("2026-04-01T00:00:00+05:30"))).toBe(
      2026,
    );
    expect(financialYearLabel(new Date("2026-04-01T00:00:00+05:30"))).toBe(
      "2026-27",
    );
  });

  it("puts 31 March in the previous financial year", () => {
    expect(financialYearStart(new Date("2027-03-31T23:59:00+05:30"))).toBe(
      2026,
    );
    expect(financialYearLabel(new Date("2027-03-31T23:59:00+05:30"))).toBe(
      "2026-27",
    );
  });

  it("pads the second year: 2009-10, not 2009-1", () => {
    expect(financialYearLabel(new Date("2009-06-01T00:00:00+05:30"))).toBe(
      "2009-10",
    );
  });

  it("gives a UTC range that matches 1 April IST exactly", () => {
    const { start, end } = financialYearRange(new Date("2026-10-16T08:00:00Z"));
    expect(start.toISOString()).toBe("2026-03-31T18:30:00.000Z");
    expect(end.toISOString()).toBe("2027-03-31T18:30:00.000Z");
    // the boundary belongs to the year it opens
    expect(financialYearLabel(start)).toBe("2026-27");
    expect(financialYearLabel(new Date(end.getTime() - 1))).toBe("2026-27");
    expect(financialYearLabel(end)).toBe("2027-28");
  });
});

describe("a stored date back into a date input", () => {
  it("gives the IST calendar day, not the UTC one", () => {
    // IST midnight is 18:30 UTC the day before: `toISOString().slice(0, 10)`
    // on this says 15-11, which is the bug this helper exists to stop
    const istMidnight = new Date("2026-11-16T00:00:00+05:30");
    expect(istMidnight.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(istInputDate(istMidnight)).toBe("2026-11-16");
  });

  it("round-trips a date input through IST and back", () => {
    const typed = "2026-12-01";
    expect(istInputDate(new Date(`${typed}T00:00:00+05:30`))).toBe(typed);
  });

  it("agrees with the date shown on screen", () => {
    const due = addWorkingDays(new Date("2026-10-16T08:00:00Z"), 10);
    expect(formatISTDate(due)).toBe("30-10-2026");
    expect(istInputDate(due)).toBe("2026-10-30");
  });

  it("pads single digits and takes nothing at all", () => {
    expect(istInputDate(new Date("2026-01-05T00:00:00+05:30"))).toBe(
      "2026-01-05",
    );
    expect(istInputDate(null)).toBe("");
    expect(istInputDate(undefined)).toBe("");
  });
});

describe("the quarter of the financial year (P3-22b)", () => {
  const q = (iso) => financialQuarterLabel(new Date(iso));

  it("runs April to March, not January to December", () => {
    expect(q("2026-04-01T00:00:00+05:30")).toBe("Q1 2026-27");
    expect(q("2026-06-30T00:00:00+05:30")).toBe("Q1 2026-27");
    expect(q("2026-07-01T00:00:00+05:30")).toBe("Q2 2026-27");
    expect(q("2026-10-15T00:00:00+05:30")).toBe("Q3 2026-27");
    expect(q("2027-01-01T00:00:00+05:30")).toBe("Q4 2026-27");
    expect(q("2027-03-31T00:00:00+05:30")).toBe("Q4 2026-27");
  });

  it("turns over on 1 April, in IST", () => {
    // 20:00 UTC on 31 March is already 1 April in India
    expect(q("2027-03-31T20:00:00Z")).toBe("Q1 2027-28");
  });
});
