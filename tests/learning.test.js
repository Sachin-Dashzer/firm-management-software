import { describe, it, expect } from "vitest";
import {
  SCREENS,
  screenKeyFor,
  screenFor,
  rolesAllowed,
  mayWrite,
  mayReview,
  isStale,
  roadmap,
  STALE_AFTER_DAYS,
} from "../lib/learning/screens.js";

/**
 * The shelf for the firm's own procedures (P3-19).
 *
 * Two things are worth a test and they are both about silence. An unknown
 * screen must resolve to **nothing**, never to a near miss — showing the
 * wrong procedure is the one failure worse than showing none. And who may
 * do the work must be read from the permission matrix, so a handbook can
 * never tell somebody an intern may file a return when the server refuses.
 */

describe("a URL finds its screen, or nothing at all", () => {
  it("matches a screen exactly", () => {
    expect(screenKeyFor("/clients/new")).toBe("clients.new");
    expect(screenKeyFor("/invoices/new")).toBe("invoices.new");
    expect(screenKeyFor("/team/plan")).toBe("team.plan");
  });

  it("matches a record by its id, not by its list", () => {
    expect(screenKeyFor("/clients/65b1f2c3d4e5f60718293a4b")).toBe(
      "clients.record",
    );
    expect(screenKeyFor("/engagements/65b1f2c3d4e5f60718293a4b")).toBe(
      "engagements.work",
    );
    expect(screenKeyFor("/practice/audit/65b1f2c3d4e5f60718293a4b")).toBe(
      "practice.audit",
    );
  });

  /** `/clients/import` is its own screen, not the client-record pattern. */
  it("prefers the exact screen over the pattern", () => {
    expect(screenKeyFor("/clients/import")).toBe("clients.import");
    expect(screenKeyFor("/clients/round-trip")).toBe("clients.roundTrip");
  });

  it("finds the screen a deeper page sits under", () => {
    expect(screenKeyFor("/practice/notices/new")).toBe("practice.notices");
    // chasing money moved from /invoices/receivables to /billing in P3-22b,
    // and the accounts desk under it keeps the same procedure
    expect(screenKeyFor("/billing")).toBe("invoices.receivables");
    expect(screenKeyFor("/billing/desk")).toBe("invoices.receivables");
  });

  it("answers nothing for a screen nobody listed, rather than guessing", () => {
    expect(screenKeyFor("/settings/branches")).toBe(null);
    expect(screenKeyFor("/me")).toBe(null);
    expect(screenKeyFor("/")).toBe(null);
    expect(screenKeyFor("")).toBe(null);
  });

  it("gives every screen a key, a label and a path", () => {
    for (const screen of SCREENS) {
      expect(screen.key, screen.key).toBeTruthy();
      expect(screen.label, screen.key).toBeTruthy();
      expect(screen.path.startsWith("/"), screen.key).toBe(true);
      expect(screenFor(screen.key)).toEqual(screen);
    }
  });

  it("has no two screens with the same key or path", () => {
    expect(new Set(SCREENS.map((s) => s.key)).size).toBe(SCREENS.length);
    expect(new Set(SCREENS.map((s) => s.path)).size).toBe(SCREENS.length);
  });
});

describe("who may do the work is read from the matrix, not typed again", () => {
  it("names the roles the permission matrix allows", () => {
    expect(rolesAllowed("engagementsReview", "approve")).toEqual([
      "Partner / Admin",
      "CA (Manager)",
    ]);
  });

  it("does not let a procedure invent a role", () => {
    const filing = rolesAllowed("engagementsCreate");
    expect(filing).not.toContain("Articled Intern");
    expect(filing).not.toContain("Accounts / Billing");
  });

  it("says everybody when the screen has no area of its own", () => {
    expect(rolesAllowed(null)).toHaveLength(5);
  });
});

describe("a CA writes, a partner says it is still true", () => {
  const role = (name) => ({ id: "x", role: name, branchIds: [] });

  it("lets a CA and a partner write", () => {
    expect(mayWrite(role("ca"))).toBe(true);
    expect(mayWrite(role("partner"))).toBe(true);
    expect(mayWrite(role("employee"))).toBe(false);
    expect(mayWrite(role("intern"))).toBe(false);
  });

  it("leaves the confirmation to a partner", () => {
    expect(mayReview(role("partner"))).toBe(true);
    expect(mayReview(role("ca"))).toBe(false);
  });
});

describe("a procedure nobody has read in a year says so", () => {
  const now = new Date("2026-11-10T06:00:00.000Z");
  const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000);

  it("is stale the moment it is written, until a partner reads it", () => {
    expect(isStale({ reviewedAt: null }, now)).toBe(true);
  });

  it("is fresh for a year after it was confirmed", () => {
    expect(isStale({ reviewedAt: daysAgo(100) }, now)).toBe(false);
    expect(isStale({ reviewedAt: daysAgo(STALE_AFTER_DAYS - 1) }, now)).toBe(
      false,
    );
    expect(isStale({ reviewedAt: daysAgo(STALE_AFTER_DAYS + 1) }, now)).toBe(
      true,
    );
  });
});

describe("the roadmap shows the holes as loudly as the shelves", () => {
  const now = new Date("2026-11-10T06:00:00.000Z");

  it("lists every screen, written or not", () => {
    const rows = roadmap([], now);
    expect(rows).toHaveLength(SCREENS.length);
    expect(rows.every((row) => row.written === false)).toBe(true);
  });

  it("counts the steps of the ones somebody wrote", () => {
    const rows = roadmap(
      [
        {
          key: "clients.new",
          steps: [{ text: "a" }, { text: "b" }],
          reviewedAt: now,
        },
      ],
      now,
    );
    const written = rows.find((row) => row.key === "clients.new");
    expect(written).toMatchObject({ written: true, steps: 2, stale: false });
    expect(rows.find((row) => row.key === "issues").written).toBe(false);
  });
});
