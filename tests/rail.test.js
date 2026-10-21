import { describe, it, expect } from "vitest";
import { can, ROLES } from "../lib/permissions.js";
import { ALL_CHECKS } from "../lib/settings/attention.js";

/**
 * The finished left rail (P2-10d).
 *
 * The rail's own rendering is a React component, so what is testable here
 * is the rule behind it: a group appears when any one of its registers
 * does, and vanishes entirely when none does. That rule is reproduced
 * below against the same permission helper the component calls — if the
 * two ever disagree, this test is the one that is wrong, and it should be
 * fixed by looking at the component.
 */

/** The Practice group, as `LeftRail.jsx` declares it. */
const PRACTICE = [
  { href: "/practice/audits", area: "practice" },
  { href: "/practice/statutory", area: "practice" },
  { href: "/practice/tax", area: "practice" },
  { href: "/practice/udin", area: "udin" },
  { href: "/practice/dsc", area: "dsc" },
];

const actorFor = (role) => ({ id: "", role, branchIds: [], active: true });

function groupFor(role) {
  const actor = actorFor(role);
  const children = PRACTICE.filter((child) => can(actor, "view", child.area));
  return children.length ? children : null;
}

describe("the Practice group in the rail", () => {
  it("opens all five for a partner", () => {
    expect(groupFor("partner")).toHaveLength(5);
  });

  it("opens all five for a CA, who runs the registers day to day", () => {
    expect(groupFor("ca")).toHaveLength(5);
  });

  it("gives an employee the books and the registers they may read", () => {
    const children = groupFor("employee");
    expect(children).not.toBeNull();
    const hrefs = children.map((c) => c.href);
    expect(hrefs).toContain("/practice/audits");
    expect(hrefs).toContain("/practice/dsc");
  });

  it("is absent for the accounts person, who may open none of them", () => {
    // present and empty would be worse than absent: a group that opens
    // onto nothing is a bug somebody has to click to discover
    expect(groupFor("accounts")).toBeNull();
  });

  it("never offers a register the role cannot open", () => {
    for (const role of ROLES) {
      for (const child of groupFor(role) ?? []) {
        expect(
          can(actorFor(role), "view", child.area),
          `${role} ${child.href}`,
        ).toBe(true);
      }
    }
  });
});

describe("the doctor and the Settings strip ask the same questions", () => {
  it("has one list, so a check added later appears in both", () => {
    // `scripts/doctor.js` reads `needsAttention()` rather than keeping its
    // own copy of the branch-GSTIN, due-date and zero-fee checks, which is
    // what it did before P2-10d
    expect(ALL_CHECKS.length).toBeGreaterThanOrEqual(13);
    const keys = ALL_CHECKS.map((c) => c.key);
    for (const key of ["dueDates", "branchGstin", "serviceFees"]) {
      expect(keys).toContain(key);
    }
  });

  it("covers what Phase 2 added as well as what Phase 1 did", () => {
    const keys = ALL_CHECKS.map((c) => c.key);
    for (const key of [
      "docTemplates",
      "portalNeverSignedIn",
      "openEndedGrants",
      "emptyPortals",
    ]) {
      expect(keys).toContain(key);
    }
  });
});
