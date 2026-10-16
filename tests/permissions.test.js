import { describe, expect, it } from "vitest";
import {
  can,
  assertCan,
  branchFilter,
  scopeOf,
  AREAS,
  ROLES,
} from "@/lib/permissions";

const NOI = "branch-noida";
const LDH = "branch-ludhiana";

const partner = { id: "u-partner", role: "partner", branchIds: [NOI, LDH] };
const ca = { id: "u-ca", role: "ca", branchIds: [NOI] };
const employee = { id: "u-emp", role: "employee", branchIds: [NOI] };
const intern = { id: "u-int", role: "intern", branchIds: [NOI] };
const accounts = { id: "u-acc", role: "accounts", branchIds: [NOI] };

/** An engagement in Noida assigned to the employee, reviewed by the CA. */
const engagement = {
  branchId: NOI,
  assigneeId: employee.id,
  reviewerId: ca.id,
};

describe("the matrix matches spec section 2", () => {
  it("lets a partner do everything", () => {
    for (const area of AREAS) {
      expect(can(partner, "view", area), area).toBe(true);
    }
  });

  it("gives every role an entry in every area, so nothing is undefined", () => {
    for (const area of AREAS) {
      for (const role of ROLES) {
        const actor = { id: "x", role, branchIds: [] };
        expect(() => can(actor, "view", area)).not.toThrow();
      }
    }
  });

  it("keeps interns away from sensitive client data", () => {
    expect(can(intern, "view", "clientSensitive", { branchId: NOI })).toBe(
      false,
    );
    expect(can(accounts, "view", "clientSensitive", { branchId: NOI })).toBe(
      false,
    );
    expect(can(ca, "edit", "clientSensitive", { branchId: NOI })).toBe(true);
  });

  it("keeps accounts out of working papers but in charge of invoices", () => {
    expect(can(accounts, "edit", "invoices")).toBe(true);
    expect(can(accounts, "edit", "engagementsWork", engagement)).toBe(false);
    expect(can(ca, "edit", "invoices", { branchId: NOI })).toBe(false);
    expect(can(ca, "view", "invoices", { branchId: NOI })).toBe(true);
  });

  it("lets only a partner touch users, settings and write-offs", () => {
    for (const actor of [ca, employee, intern, accounts]) {
      expect(can(actor, "edit", "usersSettings"), actor.role).toBe(false);
      expect(can(actor, "approve", "feeWriteOff"), actor.role).toBe(false);
      expect(can(actor, "approve", "deleteRecord"), actor.role).toBe(false);
    }
    expect(can(partner, "edit", "usersSettings")).toBe(true);
  });
});

describe("the review gate (spec section 2 and 5)", () => {
  it("never lets an employee or intern complete an engagement", () => {
    expect(can(employee, "approve", "engagementsReview", engagement)).toBe(
      false,
    );
    expect(can(intern, "approve", "engagementsReview", engagement)).toBe(false);
  });

  it("lets the reviewing CA complete it, and a partner anywhere", () => {
    expect(can(ca, "approve", "engagementsReview", engagement)).toBe(true);
    expect(can(partner, "approve", "engagementsReview", engagement)).toBe(true);
  });

  it("stops a CA completing work in a branch they are not assigned to", () => {
    expect(
      can(ca, "approve", "engagementsReview", { ...engagement, branchId: LDH }),
    ).toBe(false);
  });

  it("still lets an employee do the work, just not approve it", () => {
    expect(can(employee, "edit", "engagementsWork", engagement)).toBe(true);
  });
});

describe("branch and assignment scoping", () => {
  it("hides another branch's clients from a CA", () => {
    expect(can(ca, "edit", "clients", { branchId: NOI })).toBe(true);
    expect(can(ca, "edit", "clients", { branchId: LDH })).toBe(false);
  });

  it("limits an intern to engagements they are on", () => {
    expect(can(intern, "edit", "engagementsWork", engagement)).toBe(false);
    expect(
      can(intern, "edit", "engagementsWork", {
        ...engagement,
        assigneeId: intern.id,
      }),
    ).toBe(true);
  });

  it("counts a reviewer as assigned, so a CA can open work sent to them", () => {
    expect(
      can(employee, "edit", "engagementsWork", {
        branchId: NOI,
        assigneeId: "someone-else",
        reviewerId: employee.id,
      }),
    ).toBe(true);
  });

  it("keeps time entries to the person who logged them", () => {
    expect(can(employee, "edit", "timeEntries", { userId: employee.id })).toBe(
      true,
    );
    expect(can(employee, "edit", "timeEntries", { userId: intern.id })).toBe(
      false,
    );
  });

  it("lets a CA see their own team's time, not the whole firm's", () => {
    expect(
      can(ca, "view", "timeEntries", {
        branchId: NOI,
        userId: intern.id,
        reportingTo: ca.id,
      }),
    ).toBe(true);
    expect(
      can(ca, "view", "timeEntries", {
        branchId: NOI,
        userId: intern.id,
        reportingTo: "another-ca",
      }),
    ).toBe(false);
  });

  it("answers screen-level questions without a record", () => {
    // "may this person open the Clients list at all?"
    expect(can(intern, "view", "clients")).toBe(true);
    expect(can(intern, "view", "invoices")).toBe(false);
  });
});

describe("inactive and unknown users", () => {
  it("refuses everything to a deactivated account", () => {
    const gone = { ...partner, active: false };
    expect(can(gone, "view", "clients")).toBe(false);
    expect(can(gone, "edit", "usersSettings")).toBe(false);
  });

  it("refuses everything when there is no user at all", () => {
    expect(can(null, "view", "clients")).toBe(false);
    expect(can(undefined, "view", "clients")).toBe(false);
  });

  it("refuses an unrecognised role rather than falling back to something", () => {
    const odd = { id: "x", role: "ceo", branchIds: [NOI] };
    expect(can(odd, "view", "clients")).toBe(false);
  });

  it("throws on a typo in the area or action, so mistakes are loud", () => {
    expect(() => can(partner, "view", "clientz")).toThrow(/Unknown permission/);
    expect(() => can(partner, "destroy", "clients")).toThrow(/Unknown action/);
  });
});

describe("assertCan", () => {
  it("passes silently when allowed", () => {
    expect(() => assertCan(partner, "edit", "usersSettings")).not.toThrow();
  });

  it("throws FORBIDDEN when not", () => {
    try {
      assertCan(intern, "edit", "usersSettings");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.code).toBe("FORBIDDEN");
      expect(err.detail).toMatchObject({
        role: "intern",
        area: "usersSettings",
      });
    }
  });
});

describe("branchFilter", () => {
  it("does not restrict a partner", () => {
    expect(branchFilter(partner, "clients")).toBeNull();
  });

  it("restricts everyone else to their own branches", () => {
    expect(branchFilter(ca, "clients")).toEqual({ branchId: { $in: [NOI] } });
    expect(branchFilter(intern, "clients")).toEqual({
      branchId: { $in: [NOI] },
    });
  });

  it("returns an empty list rather than everything for a user with no branch", () => {
    const stray = { id: "s", role: "employee", branchIds: [] };
    expect(branchFilter(stray, "clients")).toEqual({ branchId: { $in: [] } });
  });
});

describe("scopeOf", () => {
  it("reports how wide each role sees", () => {
    expect(scopeOf(partner, "dashboards")).toBe("all");
    expect(scopeOf(ca, "dashboards")).toBe("team");
    expect(scopeOf(employee, "dashboards")).toBe("own");
    expect(scopeOf(accounts, "dashboards")).toBe("all");
  });
});
