import { describe, it, expect } from "vitest";
import {
  EXEC_ROLES,
  LEVEL_DEFAULTS,
  RECURRENCES,
  REVIEW_ROLES,
  SERVICE_CATEGORIES,
  SERVICE_LEVELS,
  VERSIONED_FIELDS,
  bumpsVersion,
  canExecute,
  canReview,
  turnaroundLabel,
} from "../lib/services/catalog.js";
import { STARTER_CATALOG } from "../lib/services/starter.js";

/**
 * The catalog's two jobs: say what a version bump is, and give the firm a
 * starter set that is internally consistent before anyone edits it.
 */

const base = {
  name: "GSTR-1 / GSTR-3B filing",
  level: "L1",
  minExecRole: "intern",
  minReviewRole: "ca",
  turnaroundDays: null,
  recurrence: "monthly",
  udinRequired: false,
  defaultFeePaise: 0,
  sac: "",
  checklist: [{ name: "Sales register", side: "client", mandatory: true }],
  steps: [{ name: "Collect data" }, { name: "File" }],
};

describe("bumpsVersion", () => {
  it("does not bump when nothing changed", () => {
    expect(bumpsVersion(base, { ...base })).toBe(false);
  });

  it("does not bump for a renamed service, a new fee or a new SAC code", () => {
    expect(
      bumpsVersion(base, {
        ...base,
        name: "GST monthly filing",
        defaultFeePaise: 250000,
        sac: "998221",
      }),
    ).toBe(false);
  });

  it("bumps when the checklist changes", () => {
    const after = {
      ...base,
      checklist: [
        ...base.checklist,
        { name: "Purchase register", side: "client", mandatory: true },
      ],
    };
    expect(bumpsVersion(base, after)).toBe(true);
  });

  it("bumps when a checklist item stops being mandatory", () => {
    const after = {
      ...base,
      checklist: [{ name: "Sales register", side: "client", mandatory: false }],
    };
    expect(bumpsVersion(base, after)).toBe(true);
  });

  it("bumps when the steps are reordered, not only when one is added", () => {
    const after = { ...base, steps: [...base.steps].reverse() };
    expect(bumpsVersion(base, after)).toBe(true);
  });

  it("bumps for level, roles, turnaround, recurrence and the UDIN rule", () => {
    for (const change of [
      { level: "L2" },
      { minExecRole: "employee" },
      { minReviewRole: "partner" },
      { turnaroundDays: 5 },
      { recurrence: "quarterly" },
      { udinRequired: true },
    ]) {
      expect(bumpsVersion(base, { ...base, ...change })).toBe(true);
    }
  });

  it("ignores fields the caller did not send", () => {
    // a partial save of just the fee must not look like a checklist deletion
    expect(bumpsVersion(base, { defaultFeePaise: 500000 })).toBe(false);
  });

  it("watches exactly the fields that define the work", () => {
    expect(VERSIONED_FIELDS).toEqual([
      "level",
      "minExecRole",
      "minReviewRole",
      "turnaroundDays",
      "recurrence",
      "udinRequired",
      "checklist",
      "steps",
    ]);
  });
});

describe("who may execute and review", () => {
  it("lets a senior role do junior work but not the reverse", () => {
    expect(canExecute("employee", "intern")).toBe(true);
    expect(canExecute("partner", "ca")).toBe(true);
    expect(canExecute("intern", "employee")).toBe(false);
  });

  it("never lets an employee or intern be the checker", () => {
    // maker and checker are different people, and the checker is a CA or
    // Partner (spec section 5)
    expect(canReview("employee", "ca")).toBe(false);
    expect(canReview("intern", "ca")).toBe(false);
    expect(canReview("ca", "ca")).toBe(true);
    expect(canReview("ca", "partner")).toBe(false);
    expect(canReview("partner", "partner")).toBe(true);
  });

  it("offers only CA and Partner as review roles", () => {
    expect(REVIEW_ROLES).toEqual(["ca", "partner"]);
  });
});

describe("turnaroundLabel", () => {
  it("counts days when there is a number", () => {
    expect(turnaroundLabel({ turnaroundDays: 10 })).toBe("10 working days");
    expect(turnaroundLabel({ turnaroundDays: 1 })).toBe("1 working day");
  });

  it("falls back to the note when the date is statutory", () => {
    expect(
      turnaroundLabel({
        turnaroundDays: null,
        turnaroundNote: "Before the statutory due date",
      }),
    ).toBe("Before the statutory due date");
  });

  it("says so when neither is set", () => {
    expect(turnaroundLabel({ turnaroundDays: null })).toBe("Not set");
  });
});

describe("starter catalog", () => {
  it("has the 15 services from the spec table", () => {
    expect(STARTER_CATALOG).toHaveLength(15);
  });

  it("gives every service a unique code", () => {
    const codes = STARTER_CATALOG.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses only known categories, levels and recurrences", () => {
    for (const s of STARTER_CATALOG) {
      expect(SERVICE_CATEGORIES).toContain(s.category);
      expect(SERVICE_LEVELS).toContain(s.level);
      expect(RECURRENCES).toContain(s.recurrence);
      expect(EXEC_ROLES).toContain(s.minExecRole);
      expect(REVIEW_ROLES).toContain(s.minReviewRole);
    }
  });

  it("follows the roles each level implies", () => {
    for (const s of STARTER_CATALOG) {
      expect(s.minExecRole).toBe(LEVEL_DEFAULTS[s.level].minExecRole);
      expect(s.minReviewRole).toBe(LEVEL_DEFAULTS[s.level].minReviewRole);
    }
  });

  it("gives every service a checklist with both sides, and steps", () => {
    for (const s of STARTER_CATALOG) {
      expect(s.steps.length).toBeGreaterThan(0);
      expect(s.checklist.some((c) => c.side === "client")).toBe(true);
      expect(s.checklist.some((c) => c.side === "firm")).toBe(true);
    }
  });

  it("says how the date is decided when it is not a count of days", () => {
    for (const s of STARTER_CATALOG) {
      if (s.turnaroundDays === null) {
        expect(s.turnaroundNote).not.toBe("");
      }
    }
  });

  it("invents no fee and no SAC code it was not given", () => {
    // the spec names 998221 and no other; everything else is the owner's call
    for (const s of STARTER_CATALOG) {
      expect(s.defaultFeePaise).toBe(0);
      expect(s.sac === "" || s.sac === "998221").toBe(true);
    }
  });

  it("asks for a UDIN on exactly the services the spec marks", () => {
    const udin = STARTER_CATALOG.filter((s) => s.udinRequired).map(
      (s) => s.code,
    );
    expect(udin.sort()).toEqual(["CERT-NW", "STAT-AUD", "TAX-AUD"]);
  });

  it("starts every service at version 1 and active", () => {
    for (const s of STARTER_CATALOG) {
      expect(s.version).toBe(1);
      expect(s.active).toBe(true);
    }
  });
});
