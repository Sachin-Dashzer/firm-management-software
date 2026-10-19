import { describe, expect, it } from "vitest";
import {
  SECTIONS,
  SECTION_LABELS,
  CEILING,
  ASSIGNMENT_SECTIONS,
  capSections,
  refusalFor,
} from "@/lib/access/sections";
import { can, ROLES } from "@/lib/permissions";

/**
 * What a Client Access Grant may ever open (owner decision D3, 19-10-2026).
 *
 * The database half of `lib/access/clientAccess.js` is covered by the
 * Playwright suite, which needs real clients, engagements and grants to mean
 * anything. What is tested here is the part that decides, and that is the
 * part worth being fussy about: a ceiling that is wrong by one section is a
 * breach of client confidentiality, and nothing on screen would look odd.
 */

const NOI = "branch-noida";

describe("the section ceilings", () => {
  it("gives a partner and a CA every section", () => {
    expect(CEILING.partner).toEqual(SECTIONS);
    expect(CEILING.ca).toEqual(SECTIONS);
  });

  /**
   * The decision, as a test: identifiers yes for an employee, the vault
   * never, fees never.
   */
  it("lets an employee be granted the statutory IDs but never the vault", () => {
    const { allowed, refused } = capSections("employee", [
      "profile",
      "identifiers",
      "credentials",
      "billing",
      "documents",
    ]);
    expect(allowed).toEqual(["profile", "identifiers", "documents"]);
    expect(refused.map((r) => r.section).sort()).toEqual([
      "billing",
      "credentials",
    ]);
  });

  it("keeps the statutory IDs away from an intern as well", () => {
    const { allowed, refused } = capSections("intern", SECTIONS);
    expect(allowed).toEqual(["profile", "engagements", "documents", "notes"]);
    expect(refused.map((r) => r.section).sort()).toEqual([
      "billing",
      "credentials",
      "identifiers",
    ]);
  });

  it("grants the accounts role nothing — it works from the billing screens", () => {
    expect(capSections("accounts", SECTIONS).allowed).toEqual([]);
  });

  it("refuses a role nobody has heard of rather than falling back", () => {
    expect(capSections("ceo", SECTIONS).allowed).toEqual([]);
  });

  /**
   * The point of the ceiling living in data rather than in a validation rule:
   * there is no list of sections anyone can post that opens the vault or the
   * fees to staff below a CA. Checked by exhausting every role.
   */
  it("has no role below CA that any request can open the vault for", () => {
    for (const role of ROLES) {
      if (role === "partner" || role === "ca") continue;
      const { allowed } = capSections(role, SECTIONS);
      expect(allowed, role).not.toContain("credentials");
      expect(allowed, role).not.toContain("billing");
    }
  });

  it("never returns a section that is not one, whatever is asked for", () => {
    const { allowed } = capSections("employee", [
      "profile",
      "everything",
      "../../etc/passwd",
      "",
    ]);
    expect(allowed).toEqual(["profile"]);
  });

  it("puts the sections back in canonical order, so a reshuffle is not a change", () => {
    const a = capSections("employee", ["documents", "profile", "notes"]);
    const b = capSections("employee", ["notes", "documents", "profile"]);
    expect(a.allowed).toEqual(b.allowed);
    expect(a.allowed).toEqual(["profile", "documents", "notes"]);
  });

  it("ignores a section ticked twice rather than storing it twice", () => {
    expect(capSections("employee", ["profile", "profile"]).allowed).toEqual([
      "profile",
    ]);
  });
});

describe("the refusal wording", () => {
  it("gives a reason for every section a role cannot hold", () => {
    for (const role of ROLES) {
      for (const { why } of capSections(role, SECTIONS).refused) {
        expect(why, `${role}`).toBeTruthy();
        expect(why.length, `${role}`).toBeGreaterThan(20);
      }
    }
  });

  it("explains the vault and the fees by what they are, not by rank", () => {
    expect(refusalFor("employee", "credentials")).toMatch(/vault/i);
    expect(refusalFor("employee", "billing")).toMatch(/invoices|fees/i);
    expect(refusalFor("intern", "identifiers")).toMatch(/intern/i);
  });

  it("names every section on screen", () => {
    for (const section of SECTIONS) {
      expect(SECTION_LABELS[section], section).toBeTruthy();
    }
  });
});

describe("what an assignment gives on its own", () => {
  it("is the file, the work and the documents, and nothing else", () => {
    expect(ASSIGNMENT_SECTIONS).toEqual([
      "profile",
      "engagements",
      "documents",
    ]);
  });

  it("carries no sensitive section, so being on the work is not a grant", () => {
    expect(ASSIGNMENT_SECTIONS).not.toContain("identifiers");
    expect(ASSIGNMENT_SECTIONS).not.toContain("credentials");
    expect(ASSIGNMENT_SECTIONS).not.toContain("billing");
  });

  /**
   * The sections are only half the answer: the permission area behind each
   * one has to agree, or a tab would show what its action refuses. This is
   * the join that `accessFor` relies on.
   */
  it("agrees with the matrix about what an assignee may see", () => {
    const employee = { id: "u-emp", role: "employee", branchIds: [NOI] };
    const onTheWork = { branchId: NOI, assigneeId: employee.id };

    expect(can(employee, "view", "clients", onTheWork)).toBe(true);
    expect(can(employee, "edit", "documents", onTheWork)).toBe(true);
    expect(can(employee, "view", "clientIdentifiers", onTheWork)).toBe(true);
    expect(can(employee, "view", "clientCredentials", onTheWork)).toBe(false);
    expect(can(employee, "view", "invoices", onTheWork)).toBe(false);
  });
});
