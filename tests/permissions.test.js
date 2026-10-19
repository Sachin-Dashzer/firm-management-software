import { describe, expect, it } from "vitest";
import {
  can,
  assertCan,
  branchFilter,
  scopeOf,
  seesOnlyOwnRecords,
  describeMatrix,
  AREAS,
  AREA_LABELS,
  ACTOR_KINDS,
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
  });

  // owner decision D2, 19-10-2026
  it("lets a CA bill their own branches but not another one", () => {
    expect(can(ca, "edit", "invoices", { branchId: NOI })).toBe(true);
    expect(can(ca, "edit", "invoices", { branchId: LDH })).toBe(false);
  });

  it("still keeps a CA out of write-offs, team accounts and the bin", () => {
    expect(can(ca, "approve", "feeWriteOff")).toBe(false);
    expect(can(ca, "edit", "usersSettings")).toBe(false);
    expect(can(ca, "approve", "deleteRecord")).toBe(false);
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

// ---------------------------------------------------------------------------
// Phase 2: owner decisions D2 and D3, the `granted` scope, and the new areas
// ---------------------------------------------------------------------------

describe("the granted scope (owner decision D3)", () => {
  const client = { branchId: NOI };

  it("no longer lets an employee read a client just by sharing a branch", () => {
    expect(can(employee, "view", "clients", client)).toBe(false);
    expect(can(intern, "view", "clients", client)).toBe(false);
  });

  it("lets them in as the assignee or the reviewer on the client's work", () => {
    expect(
      can(employee, "view", "clients", {
        ...client,
        assignedUserIds: [employee.id],
      }),
    ).toBe(true);
    expect(
      can(intern, "view", "clients", { ...client, reviewerId: intern.id }),
    ).toBe(true);
  });

  it("lets them in on a grant", () => {
    expect(
      can(employee, "view", "clients", {
        ...client,
        grantedUserIds: [employee.id],
      }),
    ).toBe(true);
  });

  it("does not let somebody else's grant in", () => {
    expect(
      can(employee, "view", "clients", {
        ...client,
        grantedUserIds: [intern.id],
        assignedUserIds: [intern.id],
      }),
    ).toBe(false);
  });

  /**
   * Unlike `assigned`, `granted` is not branch-tested: a grant names one
   * person, one client and a reason, and is audited, so a branch check could
   * only take back access somebody meant to give.
   */
  it("ignores the branch, because the grant is the decision", () => {
    expect(
      can(employee, "view", "clients", {
        branchId: LDH,
        grantedUserIds: [employee.id],
      }),
    ).toBe(true);
    expect(
      can(employee, "view", "clients", {
        branchId: LDH,
        assigneeId: employee.id,
      }),
    ).toBe(true);
  });

  it("still answers the screen-level question, so the list page opens", () => {
    // the list itself is then narrowed per record — see seesOnlyOwnRecords
    expect(can(employee, "view", "clients")).toBe(true);
    expect(can(intern, "view", "clients")).toBe(true);
  });

  it("applies to documents too", () => {
    expect(can(employee, "edit", "documents", { branchId: NOI })).toBe(false);
    expect(
      can(employee, "edit", "documents", {
        branchId: NOI,
        assigneeId: employee.id,
      }),
    ).toBe(true);
  });

  it("leaves an intern out of sensitive data however they got in", () => {
    expect(
      can(intern, "view", "clientSensitive", {
        branchId: NOI,
        grantedUserIds: [intern.id],
        assigneeId: intern.id,
      }),
    ).toBe(false);
  });
});

describe("a client portal user is not a member of staff", () => {
  const portalUser = {
    id: "cu-1",
    kind: "client",
    role: "client",
    clientId: "c-1",
    branchIds: [],
  };

  it("fails every area, including ones added later", () => {
    for (const area of AREAS) {
      for (const action of ["view", "edit", "approve"]) {
        expect(can(portalUser, action, area), `${action} ${area}`).toBe(false);
      }
    }
  });

  /**
   * Belt and braces: a client fails already because "client" is not in ROLES,
   * so this proves the explicit kind check is what refuses them — one careless
   * matrix row cannot open a staff screen to a client.
   */
  it("fails even when the role is one that would otherwise pass", () => {
    expect(can({ ...portalUser, role: "partner" }, "edit", "clients")).toBe(
      false,
    );
  });

  it("names both kinds of actor", () => {
    expect(ACTOR_KINDS).toEqual(["staff", "client"]);
  });
});

describe("the Phase 2 areas", () => {
  const NEW_AREAS = [
    "team",
    "clientAccess",
    "udin",
    "dsc",
    "practice",
    "icai",
    "docTemplates",
    "docGenerate",
    "clientPortalUsers",
  ];

  it("exist, with a row for every role", () => {
    for (const area of NEW_AREAS) {
      expect(AREAS, area).toContain(area);
      for (const role of ROLES) {
        const actor = { id: "x", role, branchIds: [] };
        expect(() => can(actor, "view", area)).not.toThrow();
      }
    }
  });

  it("gives a partner everything and keeps accounts out of all of them", () => {
    for (const area of NEW_AREAS) {
      expect(can(partner, "view", area), area).toBe(true);
      expect(can(accounts, "view", area), area).toBe(false);
    }
  });

  it("lets a CA read their own branch's team but not create accounts", () => {
    expect(
      can(ca, "view", "team", { branchId: NOI, userId: employee.id }),
    ).toBe(true);
    expect(can(ca, "view", "team", { branchId: LDH, userId: "x" })).toBe(false);
    expect(can(ca, "edit", "team", { branchId: NOI })).toBe(false);
    expect(can(partner, "edit", "team", { branchId: LDH })).toBe(true);
  });

  it("lets staff read only their own team record", () => {
    expect(can(employee, "view", "team", { userId: employee.id })).toBe(true);
    expect(can(employee, "view", "team", { userId: intern.id })).toBe(false);
  });

  it("lets a CA give grants in their branch and nobody below them give any", () => {
    expect(can(ca, "edit", "clientAccess", { branchId: NOI })).toBe(true);
    expect(can(ca, "edit", "clientAccess", { branchId: LDH })).toBe(false);
    for (const actor of [employee, intern, accounts]) {
      expect(can(actor, "view", "clientAccess"), actor.role).toBe(false);
    }
  });

  it("keeps an intern out of the UDIN register and the template library", () => {
    expect(can(intern, "view", "udin")).toBe(false);
    expect(can(intern, "view", "docTemplates")).toBe(false);
    expect(can(employee, "view", "docTemplates")).toBe(false);
    expect(can(ca, "view", "docTemplates")).toBe(true);
    expect(can(ca, "edit", "docTemplates")).toBe(false);
  });

  it("lets an intern read a DSC token but not move it", () => {
    const token = { branchId: NOI, grantedUserIds: [intern.id, employee.id] };
    expect(can(intern, "view", "dsc", token)).toBe(true);
    expect(can(intern, "edit", "dsc", token)).toBe(false);
    expect(can(employee, "edit", "dsc", token)).toBe(true);
  });

  it("lets only a CA or partner issue a document, an employee only draft", () => {
    const where = { branchId: NOI, grantedUserIds: [employee.id] };
    expect(can(employee, "edit", "docGenerate", where)).toBe(true);
    expect(can(employee, "approve", "docGenerate", where)).toBe(false);
    expect(can(ca, "approve", "docGenerate", { branchId: NOI })).toBe(true);
    expect(can(ca, "approve", "docGenerate", { branchId: LDH })).toBe(false);
    expect(can(intern, "edit", "docGenerate", where)).toBe(false);
  });

  it("lets a CA edit their own ICAI record and nobody else's", () => {
    expect(can(ca, "edit", "icai", { userId: ca.id })).toBe(true);
    expect(can(ca, "edit", "icai", { userId: partner.id })).toBe(false);
    expect(can(partner, "edit", "icai", { userId: ca.id })).toBe(true);
    // the firm's own FRN and peer review are read with no record in hand
    expect(can(ca, "view", "icai")).toBe(true);
    expect(can(intern, "view", "icai", { userId: intern.id })).toBe(true);
  });

  it("scopes the practice page exactly like working on an engagement", () => {
    for (const role of ROLES) {
      const actor = { id: "x", role, branchIds: [NOI] };
      expect(scopeOf(actor, "practice"), role).toBe(
        scopeOf(actor, "engagementsWork"),
      );
    }
  });

  it("lets only a partner or a CA manage client portal accounts", () => {
    expect(can(ca, "edit", "clientPortalUsers", { branchId: NOI })).toBe(true);
    expect(can(employee, "view", "clientPortalUsers")).toBe(false);
  });
});

describe("seesOnlyOwnRecords", () => {
  it("is true where a list has to be narrowed record by record", () => {
    expect(seesOnlyOwnRecords(employee, "clients")).toBe(true);
    expect(seesOnlyOwnRecords(intern, "clients")).toBe(true);
    expect(seesOnlyOwnRecords(intern, "engagementsWork")).toBe(true);
    expect(seesOnlyOwnRecords(employee, "timeEntries")).toBe(true);
  });

  it("is false where a branch condition is enough", () => {
    expect(seesOnlyOwnRecords(partner, "clients")).toBe(false);
    expect(seesOnlyOwnRecords(ca, "clients")).toBe(false);
    expect(seesOnlyOwnRecords(accounts, "clients")).toBe(false);
  });

  /**
   * Why this helper exists rather than a string comparison: the three client
   * lists used to test for "assigned" by name, so renaming the scope would
   * have silently widened all three.
   */
  it("covers both record scopes, not just the older one", () => {
    expect(scopeOf(employee, "clients")).toBe("granted");
    expect(scopeOf(intern, "engagementsWork")).toBe("assigned");
    expect(seesOnlyOwnRecords(employee, "clients")).toBe(true);
    expect(seesOnlyOwnRecords(intern, "engagementsWork")).toBe(true);
  });
});

describe("describeMatrix", () => {
  const described = describeMatrix();

  it("covers every area and every role", () => {
    expect(described).toHaveLength(AREAS.length);
    for (const row of described) {
      expect(AREAS).toContain(row.area);
      expect(Object.keys(row.roles).sort()).toEqual([...ROLES].sort());
    }
  });

  it("gives every area a label a person can read", () => {
    for (const area of AREAS) {
      expect(AREA_LABELS[area], area).toBeTruthy();
      expect(AREA_LABELS[area], area).not.toBe(area);
    }
  });

  it("puts the level and the scope into words", () => {
    const clients = described.find((row) => row.area === "clients");
    expect(clients.roles.partner.words).toBe(
      "Create and edit across the whole firm",
    );
    expect(clients.roles.ca.words).toBe(
      "Create and edit in their own branches",
    );
    expect(clients.roles.employee.words).toBe(
      "View where they are assignee, reviewer, or hold a grant",
    );
    expect(clients.roles.accounts.words).toBe("View in their own branches");
  });

  it("says no access without inventing a scope for it", () => {
    const writeOff = described.find((row) => row.area === "feeWriteOff");
    expect(writeOff.roles.ca.words).toBe("No access");
    expect(writeOff.roles.partner.words).toBe("Approve across the whole firm");
  });
});
