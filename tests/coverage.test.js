import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  NOT_COVERED,
  GAP_WORDS,
  coveredGroups,
  coverageTotals,
} from "../lib/settings/coverage.js";
import {
  SETUP_STEPS,
  checksForSteps,
  readSteps,
  setupProgress,
} from "../lib/settings/setup.js";
import { ALL_CHECKS } from "../lib/settings/attention.js";

/**
 * The two settings screens that describe the system to itself (P3-22d).
 *
 * Both are only worth having if they cannot lie, so that is what is tested.
 * The coverage page must not name a route that does not exist, and the
 * setup page must not invent a condition: every step either reads a check
 * the "Needs attention" strip already reads, or is one of the two counts
 * that belong to it alone.
 */

const partner = { id: "p1", role: "partner", branchIds: ["b1"] };
const employee = { id: "e1", role: "employee", branchIds: ["b1"] };

describe("what this covers", () => {
  it("counts the menu rather than keeping its own list of screens", () => {
    const groups = coveredGroups(partner);
    expect(groups.length).toBeGreaterThan(5);
    for (const group of groups) {
      expect(group.label).toBeTruthy();
      expect(group.screens).toBeGreaterThan(0);
    }
  });

  it("is the reader's own menu, so a staff member sees a shorter one", () => {
    const forPartner = coverageTotals(coveredGroups(partner));
    const forEmployee = coverageTotals(coveredGroups(employee));
    expect(forEmployee.screens).toBeLessThan(forPartner.screens);
    expect(forEmployee.groups).toBeLessThan(forPartner.groups);
  });

  /**
   * The point of the test: a gap that names a route has to name a real one.
   * A coverage page pointing at a 404 is worse than no coverage page.
   */
  it("names only routes that exist", () => {
    const routed = NOT_COVERED.filter((gap) => gap.route);
    expect(routed.length).toBeGreaterThan(0);

    for (const gap of routed) {
      const page = join(
        process.cwd(),
        "app",
        "(app)",
        gap.route.replace(/^\//, ""),
        "page.jsx",
      );
      expect(existsSync(page), `${gap.route} has no page`).toBe(true);
    }
  });

  it("says why, and in which of the three ways", () => {
    for (const gap of NOT_COVERED) {
      expect(gap.title).toBeTruthy();
      // a reason long enough to be a reason rather than a label
      expect(gap.why.length).toBeGreaterThan(40);
      expect(Object.keys(GAP_WORDS)).toContain(gap.kind);
    }
  });
});

describe("setting the firm up", () => {
  it("is eight steps, each with a screen behind it", () => {
    expect(SETUP_STEPS).toHaveLength(8);
    for (const step of SETUP_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.why.length).toBeGreaterThan(40);
      expect(step.href.startsWith("/")).toBe(true);
      expect(step.whenLeft).toBeTruthy();
    }
  });

  it("reads the same conditions the attention strip reads", () => {
    const keys = ALL_CHECKS.map((check) => check.key);
    const borrowed = SETUP_STEPS.filter((step) => step.uses);

    expect(borrowed.length).toBe(6);
    for (const step of borrowed) {
      expect(keys, `${step.key} borrows a check that does not exist`).toContain(
        step.uses,
      );
    }

    // and every borrowed check is handed back with something to run
    for (const { key, run } of checksForSteps()) {
      expect(typeof run, `${key} has no check to run`).toBe("function");
    }
  });

  it("calls a step done when nothing is left, and only then", () => {
    const steps = readSteps({ firm: 0, branches: 2, dueDates: 11 });
    const byKey = Object.fromEntries(steps.map((step) => [step.key, step]));

    expect(byKey.firm.done).toBe(true);
    expect(byKey.branches.done).toBe(false);
    expect(byKey.branches.left).toBe(2);
    expect(byKey.dueDates.left).toBe(11);
    // a step nobody counted is not "failed", it is simply done
    expect(byKey.team.done).toBe(true);
  });

  it("counts the progress, and knows when there is none left", () => {
    expect(setupProgress(readSteps({}))).toEqual({
      done: 8,
      total: 8,
      finished: true,
    });

    const partway = setupProgress(readSteps({ firm: 1, dueDates: 3 }));
    expect(partway).toEqual({ done: 6, total: 8, finished: false });
  });
});
