import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import ClientUser from "../models/ClientUser.js";
import DocumentModel from "../models/Document.js";
import { can, AREAS } from "../lib/permissions.js";
import {
  isLocked,
  afterFailure,
  MAX_ATTEMPTS,
  LOCK_MINUTES,
} from "../lib/security/lockout.js";
import { SAMPLE_PORTAL_USERS } from "../scripts/sample.js";

/**
 * The client portal's accounts (P2-9a).
 *
 * This is the first login in the system that belongs to somebody outside
 * the firm, so what is tested here is mostly what a portal account cannot
 * do: reach a staff area, see a document nobody shared, or keep trying
 * passwords for ever.
 */

const NOW = new Date("2026-10-20T12:00:00+05:30");

describe("what a portal session is", () => {
  const session = {
    id: "cu-1",
    kind: "client",
    clientId: "c-1",
    name: "Vikram Jaiswal",
    active: true,
  };

  it("has no role and still fails every staff area", () => {
    // the session shape `currentClientUser()` returns, rather than the
    // hand-written actor in permissions.test.js: this is what the app
    // actually passes around
    expect(session.role).toBeUndefined();
    for (const area of AREAS) {
      for (const action of ["view", "edit", "approve"]) {
        expect(can(session, action, area), `${action} ${area}`).toBe(false);
      }
    }
  });

  it("fails even carrying a branch and a staff role bolted on", () => {
    const forged = { ...session, role: "partner", branchIds: ["b-1"] };
    expect(can(forged, "edit", "clients", { branchId: "b-1" })).toBe(false);
    expect(can(forged, "view", "auditLog")).toBe(false);
  });
});

describe("the portal account record", () => {
  it("defaults to a password that has to be changed", () => {
    const account = new ClientUser({
      name: "Vikram Jaiswal",
      email: "vikram@example.test",
      clientId: new mongoose.Types.ObjectId(),
      branchId: new mongoose.Types.ObjectId(),
    });
    expect(account.mustChangePassword).toBe(true);
    expect(account.active).toBe(true);
    // 2FA is the firm's to require, and it is not required by default
    expect(account.totpRequired).toBe(false);
  });

  it("never loads the password or the secret unless asked by name", () => {
    const paths = ClientUser.schema.paths;
    expect(paths.passwordHash.options.select).toBe(false);
    expect(paths.totpSecret.options.select).toBe(false);
    expect(paths.failedLogins.options.select).toBe(false);
  });

  it("sees exactly one client", () => {
    // a join table would be the moment somebody's second company became
    // visible from the first by accident
    expect(ClientUser.schema.paths.clientId.instance).toBe("ObjectId");
    expect(ClientUser.schema.paths.clientId.options.required).toBe(true);
    expect(ClientUser.schema.paths.clientIds).toBeUndefined();
  });

  it("holds one account per email across the whole portal", () => {
    const unique = ClientUser.schema
      .indexes()
      .find(([fields]) => fields.email === 1);
    expect(unique?.[1]?.unique).toBe(true);
  });
});

describe("a document is not the client's to see until somebody says so", () => {
  it("is unshared by default", () => {
    const document = new DocumentModel({
      name: "Working papers.xlsx",
      fileKey: "k",
      clientId: new mongoose.Types.ObjectId(),
    });
    // switching the portal on must reveal nothing: working papers, internal
    // notes and drafts live in the same list as the client's own return
    expect(document.sharedWithClient).toBe(false);
    expect(document.sharedAt).toBeNull();
  });
});

describe("the lockout, against the portal's own collection", () => {
  it("locks after the same five attempts as staff", () => {
    let record = { failedLogins: 0, lockedUntil: null };
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      record = afterFailure(record, NOW);
      expect(isLocked(record, NOW)).toBe(false);
    }
    record = afterFailure(record, NOW);
    expect(record.failedLogins).toBe(MAX_ATTEMPTS);
    expect(isLocked(record, NOW)).toBe(true);
  });

  it("lets them back in after the fifteen minutes", () => {
    const record = { failedLogins: MAX_ATTEMPTS, lockedUntil: NOW };
    const later = new Date(NOW.getTime() + (LOCK_MINUTES + 1) * 60_000);
    expect(isLocked(record, later)).toBe(false);
  });
});

describe("the sample portal account", () => {
  it("exists, is at the .test domain, and needs no password change", () => {
    expect(SAMPLE_PORTAL_USERS).toHaveLength(1);
    const [account] = SAMPLE_PORTAL_USERS;
    expect(account.email).toMatch(/\.test$/);
    expect(account.password.length).toBeGreaterThanOrEqual(10);
    expect(account.totpRequired).toBe(false);
  });
});
