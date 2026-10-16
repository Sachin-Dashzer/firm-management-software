import { describe, expect, it } from "vitest";
import {
  formatISTDate,
  financialYearStart,
  financialYearLabel,
  financialYearRange,
  istParts,
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
