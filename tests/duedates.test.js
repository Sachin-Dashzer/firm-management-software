import { describe, it, expect } from "vitest";
import {
  statutoryDueFor,
  internalTargetFor,
  applyFormula,
  formulaFor,
  generateFrom,
} from "../lib/compliance/dueDate.js";
import {
  STARTER_DUE_RULES,
  NO_STATUTORY_DATE,
} from "../lib/compliance/starterRules.js";
import { parsePeriod } from "../lib/engagements/period.js";
import { formatISTDate } from "../lib/dates.js";

/**
 * The due-date engine, and the one rule that matters most: an unverified
 * rule produces no date at all (CLAUDE.md rule 8). A wrong date on a screen
 * is worse than a blank one, because people act on a date.
 */

const verified = (over = {}) => ({
  serviceCode: "TEST",
  verifiedAt: new Date("2026-10-01T00:00:00Z"),
  formula: { kind: "dayOfMonth", day: 20, monthsAfter: 1 },
  variants: [],
  overrides: [],
  ...over,
});

const dueOn = (rule, period, context) =>
  statutoryDueFor(rule, period, context).date;

describe("rule 8: nothing is invented", () => {
  it("gives no date when there is no rule", () => {
    const result = statutoryDueFor(null, "2026-10");
    expect(result.date).toBeNull();
    expect(result.basis).toBe("none");
  });

  it("gives no date from a rule nobody has verified", () => {
    const result = statutoryDueFor(
      { ...verified(), verifiedAt: null },
      "2026-10",
    );
    expect(result.date).toBeNull();
    expect(result.basis).toBe("unverified");
    expect(result.why).toMatch(/not been confirmed/);
  });

  it("gives a date once the rule is verified", () => {
    expect(formatISTDate(dueOn(verified(), "2026-10"))).toBe("20-11-2026");
  });

  it("seeds every starter rule unverified", () => {
    for (const rule of STARTER_DUE_RULES) {
      expect(rule.verifiedAt).toBeUndefined();
      expect(statutoryDueFor(rule, "2026-10").date).toBeNull();
    }
  });

  it("gives every seeded rule a source and a caution to check", () => {
    for (const rule of STARTER_DUE_RULES) {
      expect(rule.source, rule.serviceCode).toBeTruthy();
      expect(rule.caution, rule.serviceCode).toBeTruthy();
    }
  });

  it("leaves services with no statutory deadline out of the table", () => {
    const coded = STARTER_DUE_RULES.map((r) => r.serviceCode);
    for (const code of NO_STATUTORY_DATE) {
      expect(coded).not.toContain(code);
    }
  });
});

describe("the day-of-month formula", () => {
  const on = (day, monthsAfter, period) =>
    formatISTDate(
      applyFormula(
        { kind: "dayOfMonth", day, monthsAfter },
        parsePeriod(period),
      ),
    );

  it("does the 20th of the following month", () => {
    expect(on(20, 1, "2026-10")).toBe("20-11-2026");
    expect(on(20, 1, "2026-12")).toBe("20-01-2027");
  });

  it("clamps a 31st onto a short month", () => {
    // the month after January is February, which has no 31st
    expect(on(31, 1, "2027-01")).toBe("28-02-2027");
  });

  it("counts months from the end of a quarter, not its start", () => {
    // Q1 is Apr-Jun, so one month after it ends is July
    expect(on(31, 1, "2026-Q1")).toBe("31-07-2026");
    expect(on(31, 1, "2026-Q2")).toBe("31-10-2026");
    expect(on(31, 1, "2026-Q3")).toBe("31-01-2027");
  });

  it("counts months from the end of a financial year", () => {
    // FY 2026-27 ends 31 March 2027; four months on is 31 July
    expect(on(31, 4, "FY2026-27")).toBe("31-07-2027");
    expect(on(30, 6, "FY2026-27")).toBe("30-09-2027");
    expect(on(31, 7, "FY2026-27")).toBe("31-10-2027");
    expect(on(31, 9, "FY2026-27")).toBe("31-12-2027");
  });
});

describe("variants for one period of the year", () => {
  const tds = verified({
    formula: { kind: "dayOfMonth", day: 31, monthsAfter: 1 },
    variants: [
      {
        match: "Q4",
        formula: { kind: "dayOfMonth", day: 31, monthsAfter: 2 },
      },
    ],
  });

  it("uses the ordinary formula for most periods", () => {
    expect(formatISTDate(dueOn(tds, "2026-Q1"))).toBe("31-07-2026");
  });

  it("uses the variant for the one period that differs", () => {
    // the March quarter is 31 May, not 30 April
    expect(formatISTDate(dueOn(tds, "2026-Q4"))).toBe("31-05-2027");
  });

  it("picks the variant by the end of the period code", () => {
    expect(formulaFor(tds, "2026-Q4").monthsAfter).toBe(2);
    expect(formulaFor(tds, "2026-Q2").monthsAfter).toBe(1);
  });
});

describe("dates that run from an event", () => {
  const roc = verified({
    formula: { kind: "daysAfterEvent", event: "AGM", days: 30 },
  });

  it("says nothing until the event is known, rather than guessing", () => {
    const result = statutoryDueFor(roc, "FY2025-26");
    expect(result.date).toBeNull();
    expect(result.why).toMatch(/has not been entered/);
  });

  it("counts from the event once it is entered", () => {
    const agm = new Date("2026-09-30T00:00:00+05:30");
    expect(formatISTDate(dueOn(roc, "FY2025-26", { eventDate: agm }))).toBe(
      "30-10-2026",
    );
  });
});

describe("a date the government moved", () => {
  const extended = verified({
    overrides: [
      {
        period: "2026-10",
        dueDate: new Date("2026-11-25T00:00:00+05:30"),
        reason: "CBIC extended by five days",
      },
    ],
  });

  it("beats the formula for that period only", () => {
    const moved = statutoryDueFor(extended, "2026-10");
    expect(formatISTDate(moved.date)).toBe("25-11-2026");
    expect(moved.basis).toBe("override");
    expect(moved.why).toMatch(/CBIC/);

    // the month before is untouched
    expect(formatISTDate(dueOn(extended, "2026-09"))).toBe("20-10-2026");
  });
});

describe("the firm's internal target", () => {
  it("is three working days earlier", () => {
    // 20 Nov 2026 is a Friday; three working days back is Tuesday the 17th
    const statutory = new Date("2026-11-20T00:00:00+05:30");
    expect(formatISTDate(internalTargetFor(statutory))).toBe("17-11-2026");
  });

  it("steps over a weekend rather than through it", () => {
    // 20 Oct 2026 is a Tuesday; three working days back is Thursday the 15th
    const statutory = new Date("2026-10-20T00:00:00+05:30");
    expect(formatISTDate(internalTargetFor(statutory))).toBe("15-10-2026");
  });

  it("is nothing when the statutory date is nothing", () => {
    expect(internalTargetFor(null)).toBeNull();
  });
});

describe("when work gets created", () => {
  it("is a fortnight before the due date", () => {
    const due = new Date("2026-11-20T00:00:00+05:30");
    expect(formatISTDate(generateFrom(due))).toBe("05-11-2026");
  });

  it("is nothing without a due date, so nothing is generated blind", () => {
    expect(generateFrom(null)).toBeNull();
  });
});
