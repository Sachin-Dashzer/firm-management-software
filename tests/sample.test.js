import { describe, expect, it } from "vitest";
import {
  SAMPLE_PEOPLE,
  SAMPLE_DSCS,
  SAMPLE_UDINS,
  SAMPLE_CLIENTS,
  SAMPLE_SERVICES,
  SAMPLE_GRANTS,
  SAMPLE_ENGAGEMENTS,
  SAMPLE_DOMAIN,
  makeGstin,
} from "@/scripts/sample.js";
import { checkUdinShape } from "@/lib/practice/udin";
import {
  checkPAN,
  checkGSTIN,
  checkMobile,
  checkEmail,
  checkCIN,
  panMatchesEntityType,
  ENTITY_TYPES,
  RISK_RATINGS,
  TURNOVER_BANDS,
} from "@/lib/validators";
import { STARTER_CATALOG } from "@/lib/services/starter";
import { canExecute, canReview } from "@/lib/services/catalog";
import { capSections } from "@/lib/access/sections";
import { ROLES } from "@/lib/permissions";

/**
 * The sample dataset, checked against the same validators the firm's own
 * forms use.
 *
 * This is the test that matters most about seed data: a fabricated PAN or
 * GSTIN that does not pass `checkGSTIN` would be accepted by the seed script
 * — which writes through the model, not the form — and then refused the first
 * time anybody opened the client for editing. The owner would find it, not us.
 */

const byKey = new Map(SAMPLE_PEOPLE.map((p) => [p.key, p]));
const catalog = new Map(STARTER_CATALOG.map((s) => [s.code, s]));

describe("the sample identifiers are properly formed", () => {
  it.each(SAMPLE_CLIENTS)("$legalName has a valid PAN", (client) => {
    const result = checkPAN(client.pan);
    expect(result.ok, result.ok ? "" : result.reason).toBe(true);
  });

  /**
   * The 4th character of a PAN says what kind of holder it belongs to, and
   * the form rejects a company PAN on an individual. Four entity types here,
   * so this is checked four different ways.
   */
  it.each(SAMPLE_CLIENTS)(
    "$legalName's PAN agrees with its entity type",
    (client) => {
      expect(panMatchesEntityType(client.pan, client.entityType)).toBe(true);
    },
  );

  it.each(SAMPLE_CLIENTS.filter((c) => c.stateCode))(
    "$legalName has a GSTIN that passes the check digit",
    (client) => {
      const gstin = makeGstin(client.stateCode, client.pan);
      const result = checkGSTIN(gstin);
      expect(result.ok, result.ok ? "" : `${gstin}: ${result.reason}`).toBe(
        true,
      );
      expect(result.state).toBe(client.state);
    },
  );

  it.each(SAMPLE_CLIENTS.filter((c) => c.cin && c.entityType !== "LLP"))(
    "$legalName has a valid CIN",
    (client) => {
      const result = checkCIN(client.cin);
      expect(result.ok, result.ok ? "" : result.reason).toBe(true);
    },
  );

  it("builds a GSTIN that the validator would otherwise reject if guessed", () => {
    const real = makeGstin("09", "AADCJ4817Q");
    expect(checkGSTIN(real).ok).toBe(true);
    // the same number with the check digit nudged by one is refused
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const wrong =
      real.slice(0, 14) +
      alphabet[(alphabet.indexOf(real[14]) + 1) % alphabet.length];
    expect(checkGSTIN(wrong).ok).toBe(false);
  });

  it.each(SAMPLE_CLIENTS)("$legalName uses real enum values", (client) => {
    expect(ENTITY_TYPES).toContain(client.entityType);
    expect(RISK_RATINGS).toContain(client.risk);
    expect(TURNOVER_BANDS).toContain(client.turnoverBand);
  });

  it("gives every contact a usable mobile and email", () => {
    for (const client of SAMPLE_CLIENTS) {
      for (const contact of client.contacts) {
        expect(checkMobile(contact.mobile).ok, contact.mobile).toBe(true);
        expect(checkEmail(contact.email).ok, contact.email).toBe(true);
      }
      expect(client.contacts.filter((c) => c.primary)).toHaveLength(1);
    }
  });
});

describe("the sample colleagues", () => {
  it("are all on the sample domain, so they can be found again", () => {
    for (const person of SAMPLE_PEOPLE) {
      expect(person.email.endsWith(`@${SAMPLE_DOMAIN}`), person.email).toBe(
        true,
      );
      expect(checkMobile(person.mobile).ok, person.mobile).toBe(true);
    }
  });

  it("only use roles the matrix knows", () => {
    for (const person of SAMPLE_PEOPLE) {
      expect(ROLES, person.key).toContain(person.role);
    }
  });

  /**
   * The thing `scripts/doctor.js` warns about. An employee with no senior CA
   * makes the "My senior CA" card on `/me` look broken, so the sample data
   * must not be the reason it looks broken.
   */
  it("give every employee and intern a reporting CA who is a CA", () => {
    for (const person of SAMPLE_PEOPLE) {
      if (person.role !== "employee" && person.role !== "intern") continue;
      expect(person.reportsTo, person.key).toBeTruthy();
      expect(byKey.get(person.reportsTo)?.role, person.key).toBe("ca");
    }
  });

  it("registers the intern under a CA, with fabricated ICAI details", () => {
    const interns = SAMPLE_PEOPLE.filter((p) => p.role === "intern");
    expect(interns).toHaveLength(1);
    for (const intern of interns) {
      expect(byKey.get(intern.articleship.principal)?.role).toBe("ca");
      expect(intern.articleship.leaveTaken).toBeLessThan(
        intern.articleship.leaveAllowed,
      );
      expect(
        new Date(intern.articleship.expectedEnd).valueOf(),
      ).toBeGreaterThan(new Date(intern.articleship.start).valueOf());
    }
  });

  it("has somebody in each office the firm actually has", () => {
    const offices = new Set(SAMPLE_PEOPLE.flatMap((p) => p.branches));
    expect([...offices].sort()).toEqual(["DEL", "LDH", "NOI"]);
  });
});

describe("the sample subscriptions", () => {
  it("name services that exist in the starter catalog", () => {
    for (const row of SAMPLE_SERVICES) {
      expect(catalog.has(row.service), row.service).toBe(true);
    }
  });

  it("covers all three tiers, so A, B and C each have something to show", () => {
    const levels = new Set(
      SAMPLE_SERVICES.map((row) => catalog.get(row.service).level),
    );
    expect([...levels].sort()).toEqual(["L1", "L2", "L3"]);
  });

  /**
   * The important one. `checkAssignment` refuses an assignee below the
   * service's minimum role, so a sample row that broke that rule would make
   * P2-4's enforcement look broken when it is working exactly as asked.
   */
  it("never defaults an assignee who is not allowed to do the work", () => {
    for (const row of SAMPLE_SERVICES) {
      const template = catalog.get(row.service);
      const assignee = byKey.get(row.assignee);
      expect(assignee, row.assignee).toBeTruthy();
      expect(
        canExecute(assignee.role, template.minExecRole),
        `${assignee.name} on ${row.service} (needs ${template.minExecRole})`,
      ).toBe(true);
    }
  });

  it("never defaults a reviewer who could not sign it off", () => {
    for (const row of SAMPLE_SERVICES) {
      const template = catalog.get(row.service);
      // a null reviewer means the partner, who can review anything
      if (!row.reviewer) continue;
      const reviewer = byKey.get(row.reviewer);
      expect(
        canReview(reviewer.role, template.minReviewRole),
        `${reviewer.name} reviewing ${row.service}`,
      ).toBe(true);
    }
  });

  it("keeps the maker and the checker different people", () => {
    for (const row of SAMPLE_SERVICES) {
      expect(row.assignee, row.service).not.toBe(row.reviewer);
    }
  });

  it("puts the A-tier work on a CA, not an employee", () => {
    const aTier = SAMPLE_SERVICES.filter(
      (row) => catalog.get(row.service).level === "L3",
    );
    expect(aTier.length).toBeGreaterThan(0);
    for (const row of aTier) {
      expect(byKey.get(row.assignee).role, row.service).toBe("ca");
    }
  });
});

describe("the sample grants", () => {
  it("are three different widths, so expiry and sections both show", () => {
    expect(SAMPLE_GRANTS).toHaveLength(3);
    const widths = new Set(SAMPLE_GRANTS.map((g) => g.sections.length));
    expect(widths.size).toBeGreaterThan(1);
    expect(SAMPLE_GRANTS.some((g) => g.expiresInDays)).toBe(true);
  });

  /**
   * A seeded grant that exceeded its role's ceiling would be written by the
   * script — which goes through the model, not through `grantAccess` — and
   * would then sit in the database as access the server refuses to honour.
   */
  it("stay inside the ceiling of the role they are given to", () => {
    for (const grant of SAMPLE_GRANTS) {
      const person = byKey.get(grant.user);
      expect(person, grant.user).toBeTruthy();
      const { refused } = capSections(person.role, grant.sections);
      expect(
        refused,
        `${person.name}: ${refused.map((r) => r.section).join(", ")}`,
      ).toEqual([]);
    }
  });

  it("gives every grant a reason somebody could review", () => {
    for (const grant of SAMPLE_GRANTS) {
      expect(grant.reason.length, grant.user).toBeGreaterThan(20);
    }
  });

  it("leaves at least one employee with no way into at least one client", () => {
    // the fixture behind acceptance check 1: sharing a branch is not access
    const granted = new Set(SAMPLE_GRANTS.map((g) => `${g.user}:${g.client}`));
    const pairs = SAMPLE_PEOPLE.filter((p) => p.role === "employee").flatMap(
      (p) => SAMPLE_CLIENTS.map((c) => `${p.key}:${c.key}`),
    );
    expect(pairs.some((pair) => !granted.has(pair))).toBe(true);
  });
});

describe("the registers in the sample data (P2-7)", () => {
  it("gives every member a membership number to snapshot", () => {
    const members = SAMPLE_PEOPLE.filter((p) =>
      ["ca", "partner"].includes(p.role),
    );
    for (const member of members.filter((m) => m.icai)) {
      expect(member.icai.membershipNo).toMatch(/^\d{5,6}$/);
      expect(["ACA", "FCA"]).toContain(member.icai.grade);
      // a Certificate of Practice cannot predate admission
      expect(
        new Date(member.icai.copFrom) >= new Date(member.icai.admittedOn),
      ).toBe(true);
    }
  });

  it("has one certificate expiring soon and one that is not", () => {
    const soon = SAMPLE_DSCS.filter((row) => row.inDays <= 30);
    const later = SAMPLE_DSCS.filter((row) => row.inDays > 30);
    // the dashboard tile and the dscExpiring rule both need something real
    expect(soon).toHaveLength(1);
    expect(later.length).toBeGreaterThan(0);
  });

  it("names a real client and a real holder on every certificate", () => {
    const clients = new Set(SAMPLE_CLIENTS.map((c) => c.key));
    for (const row of SAMPLE_DSCS) {
      expect(clients).toContain(row.client);
      expect(row.holderName.length).toBeGreaterThan(3);
      expect(row.inDays).toBeGreaterThan(0);
    }
  });

  it("seeds UDINs in the ICAI's shape, against work that exists", () => {
    for (const row of SAMPLE_UDINS) {
      expect(checkUdinShape(row.udin).ok).toBe(true);
      expect(SAMPLE_ENGAGEMENTS[row.engagement]).toBeTruthy();
      // a UDIN belongs to a member, and the one named has to be one
      const member = byKey.get(row.member);
      expect(["ca", "partner"]).toContain(member.role);
      expect(member.icai?.membershipNo).toBeTruthy();
      // and it was generated in the past
      expect(row.backDays).toBeGreaterThan(0);
    }
  });

  it("puts the UDIN on work that is finished, not on a job in progress", () => {
    for (const row of SAMPLE_UDINS) {
      expect(SAMPLE_ENGAGEMENTS[row.engagement].status).toBe("Completed");
    }
  });
});
