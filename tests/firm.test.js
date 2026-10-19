import { describe, it, expect } from "vitest";
import {
  FIRM_DEFAULTS,
  withDefaults,
  hasCpeTarget,
} from "../lib/firm/profile.js";
import { cpeYearOf, cpeByYear } from "../lib/firm/cpe.js";
import { compose } from "../lib/mailer/templates.js";

/**
 * The firm's own record, and the CPE log.
 *
 * The thing worth testing hardest is what happens when the firm has said
 * nothing: an unset CPE target has to read as "nobody has said", never as
 * "zero hours needed", and a missing settings document must not stop an
 * invoice printing.
 */

describe("the firm's own record", () => {
  it("falls back to what the app said before the settings screen existed", () => {
    const firm = withDefaults(null);
    expect(firm.name).toBe("PHMG & Associates");
    expect(firm.tagline).toBe("Chartered Accountants");
    expect(firm.retentionYears).toBe(8);
  });

  it("keeps what is stored and fills in only what is missing", () => {
    const firm = withDefaults({ name: "Garg & Co.", frn: "012345N" });
    expect(firm.name).toBe("Garg & Co.");
    expect(firm.frn).toBe("012345N");
    // not stored, so the default stands
    expect(firm.retentionYears).toBe(FIRM_DEFAULTS.retentionYears);
  });

  it("respects a blank the firm chose: no second line means no second line", () => {
    expect(withDefaults({ tagline: "" }).tagline).toBe("");
    expect(withDefaults({ frn: "" }).frn).toBe("");
  });

  it("refuses to let the firm have no name at all", () => {
    expect(withDefaults({ name: "" }).name).toBe(FIRM_DEFAULTS.name);
    expect(withDefaults({ name: "   " }).name).toBe(FIRM_DEFAULTS.name);
  });

  it("fills in a field the stored document has never heard of", () => {
    // what a document written before a field existed must read as
    const firm = withDefaults({ name: "Garg & Co." });
    expect(firm.cpeYearBasis).toBe(FIRM_DEFAULTS.cpeYearBasis);
    expect(firm.peerReviewValidTill).toBeNull();
  });

  it("knows whether the firm has set a CPE target at all", () => {
    expect(hasCpeTarget({})).toBe(false);
    expect(hasCpeTarget({ cpeTargetStructured: 0 })).toBe(false);
    expect(hasCpeTarget({ cpeTargetStructured: 20 })).toBe(true);
    expect(hasCpeTarget({ cpeTargetUnstructured: 10 })).toBe(true);
  });
});

describe("which CPE year a date falls in", () => {
  const march = new Date("2027-03-15T06:00:00.000Z");
  const may = new Date("2026-05-15T06:00:00.000Z");

  it("counts January to December when the firm says calendar", () => {
    expect(cpeYearOf(march, "calendar")).toBe("2027");
    expect(cpeYearOf(may, "calendar")).toBe("2026");
  });

  it("counts April to March when the firm says financial", () => {
    expect(cpeYearOf(march, "financial")).toBe("2026-27");
    expect(cpeYearOf(may, "financial")).toBe("2026-27");
  });

  it("reads the date in IST, so a late-night entry lands on the right day", () => {
    // 31 December 2026, 23:30 IST is 18:00 UTC the same day
    expect(cpeYearOf(new Date("2026-12-31T18:00:00.000Z"), "calendar")).toBe(
      "2026",
    );
    // but 00:30 IST on 1 January is still 2025-12-31 in UTC
    expect(cpeYearOf(new Date("2026-12-31T19:00:00.000Z"), "calendar")).toBe(
      "2027",
    );
  });
});

describe("a member's CPE position", () => {
  const entries = [
    { on: "2026-05-10", hours: 6, kind: "structured" },
    { on: "2026-07-02", hours: 2.5, kind: "structured" },
    { on: "2026-08-19", hours: 4, kind: "unstructured" },
    { on: "2025-06-11", hours: 20, kind: "structured" },
  ];

  it("totals structured and unstructured apart, newest year first", () => {
    const [latest, older] = cpeByYear(entries, { cpeYearBasis: "calendar" });
    expect(latest.year).toBe("2026");
    expect(latest.structured).toBe(8.5);
    expect(latest.unstructured).toBe(4);
    expect(latest.total).toBe(12.5);
    expect(older.year).toBe("2025");
    expect(older.structured).toBe(20);
  });

  it("says nothing about whether the hours are enough until the firm does", () => {
    const [latest] = cpeByYear(entries, { cpeYearBasis: "calendar" });
    // null, not false: an unanswered question is not a failure
    expect(latest.met).toBeNull();
  });

  it("judges a year once a target is set, and says what is short", () => {
    const [latest] = cpeByYear(entries, {
      cpeYearBasis: "calendar",
      cpeTargetStructured: 20,
      cpeTargetUnstructured: 10,
    });
    expect(latest.met).toBe(false);
    expect(latest.short).toEqual({ structured: 11.5, unstructured: 6 });
  });

  it("calls a year met when both sides are reached", () => {
    const [year] = cpeByYear([{ on: "2026-05-10", hours: 20 }], {
      cpeTargetStructured: 20,
    });
    expect(year.met).toBe(true);
    expect(year.short.structured).toBe(0);
  });

  it("counts an entry with no kind as structured, not as nothing", () => {
    const [year] = cpeByYear([{ on: "2026-05-10", hours: 3 }], {});
    expect(year.structured).toBe(3);
    expect(year.unstructured).toBe(0);
  });

  it("regroups the same hours when the firm counts its year differently", () => {
    // 15 March 2027 is 2027 on a calendar year and 2026-27 on a financial one
    const one = [{ on: "2027-03-15", hours: 5 }];
    expect(cpeByYear(one, { cpeYearBasis: "calendar" })[0].year).toBe("2027");
    expect(cpeByYear(one, { cpeYearBasis: "financial" })[0].year).toBe(
      "2026-27",
    );
  });

  it("returns nothing at all for a member with no log", () => {
    expect(cpeByYear([], { cpeTargetStructured: 20 })).toEqual([]);
  });
});

describe("the firm signs its own messages", () => {
  it("fills {firm} from the value the caller passes", () => {
    const message = compose("invoiceIssued", {
      number: "NOI/26-27/0087",
      firm: "Garg & Co.",
    });
    expect(message.subject).toContain("Garg & Co.");
    expect(message.text).toContain("Garg & Co.");
    expect(message.text).not.toContain("{firm}");
  });

  it("never leaves a message signed {firm} when nobody looked it up", () => {
    const message = compose("invoiceIssued", { number: "X" });
    expect(message.text).toContain(FIRM_DEFAULTS.name);
    expect(message.text).not.toContain("{firm}");
  });
});
