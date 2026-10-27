import { describe, it, expect } from "vitest";
import { whyNot, can } from "../lib/permissions.js";
import { offeredStatuses, nextStatuses } from "../lib/engagements/status.js";

/**
 * Disabled with the reason, instead of refused afterwards (P3-8).
 *
 * Spec §2's rule — enforce on the server, hiding a button is not security —
 * says nothing about what a screen should do with a control somebody may not
 * use, and the build chose to hide it. An employee opening a job in review
 * saw no Approve button and had no way to tell a rule from a bug.
 *
 * So the property that matters is that the sentence and the enforcement come
 * from **the same source**: for every role and every area, `whyNot` is silent
 * exactly when `can` is true. A screen that explains a rule which is not the
 * rule is worse than one that explains nothing.
 */

const NOI = "aaaaaaaaaaaaaaaaaaaaaaa1";
const LDH = "aaaaaaaaaaaaaaaaaaaaaaa2";

const user = (role, over = {}) => ({
  id: `u-${role}`,
  role,
  branchIds: [NOI],
  active: true,
  ...over,
});

const ROLES = ["partner", "ca", "employee", "intern", "accounts"];
const AREAS = ["clients", "invoices", "engagementsReview", "usersSettings"];
const ACTIONS = ["view", "edit", "approve"];

describe("the reason and the rule are the same rule", () => {
  it("is silent exactly when the answer is yes", () => {
    for (const role of ROLES) {
      for (const area of AREAS) {
        for (const action of ACTIONS) {
          const actor = user(role);
          const allowed = can(actor, action, area);
          const why = whyNot(actor, action, area);
          expect(why === null, `${role} / ${action} / ${area}`).toBe(allowed);
        }
      }
    }
  });

  it("never gives a reason without saying who can instead", () => {
    for (const role of ROLES) {
      for (const area of AREAS) {
        const why = whyNot(user(role), "approve", area);
        if (!why) continue;
        expect(why, `${role} / ${area}`).toMatch(
          /Only |Nobody|outside|somebody|neither/,
        );
      }
    }
  });
});

describe("what each refusal says", () => {
  it("names the role that is short, and the roles that are not", () => {
    const why = whyNot(user("employee"), "approve", "engagementsReview");
    expect(why).toMatch(/Your role \(Employee\) cannot approve/);
    expect(why).toMatch(/Only a Partner \/ Admin or a CA \(Manager\) can\./);
  });

  it("names a single role in the singular", () => {
    const why = whyNot(user("ca"), "approve", "feeWriteOff");
    expect(why).toMatch(/Only a Partner \/ Admin can\./);
    expect(why).not.toMatch(/ or /);
  });

  it("says it is the record, not the role, when the role is senior enough", () => {
    // a CA may edit clients — but only in their own branches
    const why = whyNot(user("ca"), "edit", "clients", { branchId: LDH });
    expect(why).toBe("This belongs to a branch you are not assigned to.");
  });

  it("explains a grant rather than a branch, where that is the rule", () => {
    const why = whyNot(user("employee"), "view", "clients", {
      branchId: NOI,
      assigneeId: "somebody-else",
    });
    expect(why).toMatch(/work on your desk or a grant from a CA/);
  });

  it("says nothing at all to somebody who may go ahead", () => {
    expect(whyNot(user("partner"), "approve", "feeWriteOff")).toBe(null);
    expect(whyNot(user("ca"), "edit", "clients", { branchId: NOI })).toBe(null);
  });

  it("turns away a signed-out or deactivated reader", () => {
    expect(whyNot(null, "view", "clients")).toBe("You are not signed in.");
    expect(whyNot(user("ca", { active: false }), "view", "clients")).toBe(
      "You are not signed in.",
    );
  });

  it("turns away a client portal account from a staff area", () => {
    expect(whyNot({ kind: "client", id: "c1" }, "view", "clients")).toBe(
      "This is a staff screen.",
    );
  });
});

describe("the pipeline offers every move, refused ones included", () => {
  const work = (over = {}) => ({
    status: "Under review",
    assigneeId: "u-employee",
    reviewerId: "u-ca",
    minReviewRole: "ca",
    level: "L1",
    ...over,
  });

  it("gives the maker the reason they cannot sign off their own work", () => {
    const moves = offeredStatuses(user("ca", { id: "u-employee" }), work());
    const completed = moves.find((m) => m.to === "Completed");
    expect(completed.why).toMatch(/You did this work/);
  });

  it("gives the reviewer no reason at all", () => {
    const moves = offeredStatuses(user("ca", { id: "u-ca" }), work());
    expect(moves.find((m) => m.to === "Completed").why).toBe(null);
  });

  it("offers more than it allows, which is the whole change", () => {
    const actor = user("employee");
    const moves = offeredStatuses(actor, work());
    const allowed = nextStatuses(actor, work());
    expect(moves.length).toBeGreaterThan(allowed.length);
    // and the old helper still returns only what may be done
    expect(
      allowed.every((to) => moves.find((m) => m.to === to).why === null),
    ).toBe(true);
  });

  it("offers nothing on work that is locked, and so has no reasons either", () => {
    expect(
      offeredStatuses(user("partner"), work({ status: "Completed" })),
    ).toEqual([]);
  });
});
