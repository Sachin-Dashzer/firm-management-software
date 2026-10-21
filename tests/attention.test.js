import { describe, it, expect } from "vitest";
import { ALL_CHECKS, needsAttention } from "../lib/settings/attention.js";
import { AREAS, can, describeMatrix, ROLES } from "../lib/permissions.js";

/**
 * "Needs attention" on the Settings screen (P2-10b).
 *
 * Each check is a count, so the interesting cases are the boundaries: an
 * item that counts zero must be absent rather than shown ticked, and
 * nobody should be nagged about a problem their role cannot fix.
 */

const partner = {
  id: "p-1",
  role: "partner",
  branchIds: ["b-1"],
  active: true,
};
const accounts = {
  id: "a-1",
  role: "accounts",
  branchIds: ["b-1"],
  active: true,
};
const intern = { id: "i-1", role: "intern", branchIds: ["b-1"], active: true };

/** Run the list with every check's query stubbed to a fixed number. */
function withCounts(counts) {
  const original = ALL_CHECKS.map((check) => check.run);
  for (const check of ALL_CHECKS) {
    check.run = async () => counts[check.key] ?? 0;
  }
  return () => ALL_CHECKS.forEach((check, i) => (check.run = original[i]));
}

describe("the checks themselves", () => {
  it("each names a real permission area", () => {
    for (const check of ALL_CHECKS) {
      expect(AREAS, check.key).toContain(check.area);
    }
  });

  it("each says what it means, not just that something is wrong", () => {
    for (const check of ALL_CHECKS) {
      expect(check.detail.length, check.key).toBeGreaterThan(40);
      expect(check.href, check.key).toMatch(/^\//);
      expect(["blocking", "worth doing"]).toContain(check.severity);
    }
  });

  it("has a key of its own for each", () => {
    const keys = ALL_CHECKS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("what gets shown", () => {
  it("says nothing at all when nothing is wrong", async () => {
    const restore = withCounts({});
    try {
      expect(await needsAttention(partner)).toEqual([]);
    } finally {
      restore();
    }
  });

  it("shows only the checks that found something", async () => {
    const restore = withCounts({ dueDates: 11, failedJobs: 3 });
    try {
      const items = await needsAttention(partner);
      expect(items.map((i) => i.key).sort()).toEqual([
        "dueDates",
        "failedJobs",
      ]);
      expect(items.find((i) => i.key === "dueDates").count).toBe(11);
    } finally {
      restore();
    }
  });

  it("puts what is blocking work above what is merely worth doing", async () => {
    const restore = withCounts({ failedJobs: 1, dueDates: 11, branchGstin: 2 });
    try {
      const items = await needsAttention(partner);
      // the two blocking ones first, in either order between themselves
      expect(items.at(-1).key).toBe("failedJobs");
      expect(items.slice(0, 2).every((i) => i.severity === "blocking")).toBe(
        true,
      );
    } finally {
      restore();
    }
  });

  it("survives a check that throws rather than losing the whole screen", async () => {
    const original = ALL_CHECKS.map((c) => c.run);
    for (const check of ALL_CHECKS) {
      check.run = async () => {
        if (check.key === "runner") throw new Error("no database");
        return check.key === "dueDates" ? 11 : 0;
      };
    }
    try {
      const items = await needsAttention(partner);
      expect(items.map((i) => i.key)).toEqual(["dueDates"]);
    } finally {
      ALL_CHECKS.forEach((check, i) => (check.run = original[i]));
    }
  });
});

describe("nobody is nagged about what they cannot fix", () => {
  it("tells the accounts person nothing about audit templates", async () => {
    const restore = withCounts({ docTemplates: 8, dueDates: 11 });
    try {
      const items = await needsAttention(accounts);
      expect(items.map((i) => i.key)).not.toContain("docTemplates");
      expect(items.map((i) => i.key)).not.toContain("dueDates");
    } finally {
      restore();
    }
  });

  it("tells an intern nothing at all", async () => {
    const restore = withCounts(
      Object.fromEntries(ALL_CHECKS.map((c) => [c.key, 5])),
    );
    try {
      expect(await needsAttention(intern)).toEqual([]);
    } finally {
      restore();
    }
  });

  it("only ever shows a check whose own permission passes", async () => {
    const restore = withCounts(
      Object.fromEntries(ALL_CHECKS.map((c) => [c.key, 1])),
    );
    try {
      for (const actor of [partner, accounts, intern]) {
        for (const item of await needsAttention(actor)) {
          expect(can(actor, item.action ?? "view", item.area)).toBe(true);
        }
      }
    } finally {
      restore();
    }
  });
});

describe("the permissions screen's source", () => {
  it("describes every area for every role, in words", () => {
    const rows = describeMatrix();
    expect(rows).toHaveLength(AREAS.length);
    for (const row of rows) {
      for (const role of ROLES) {
        expect(
          row.roles[role].words.length,
          `${row.area}/${role}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
