import { describe, it, expect } from "vitest";
import {
  CLIENT_VISIBLE_INVOICE_STATUSES,
  ENGAGEMENT_FIELDS,
  belongsToClient,
  clientIdOf,
  documentScope,
  engagementForClient,
  engagementScope,
  invoiceScope,
  paymentScope,
} from "../lib/access/clientScope.js";
import { INVOICE_STATUSES } from "../models/Invoice.js";
import { TEMPLATES } from "../lib/mailer/templates.js";
import { RULE_DEFAULTS } from "../lib/mailer/rules.js";
import Comment from "../models/Comment.js";

/**
 * What a client may see of their own file (P2-9b).
 *
 * Every portal query goes through `clientScope`, so these tests are the
 * ones standing between a client and somebody else's invoice. They are
 * deliberately pedantic about the negative cases.
 */

const person = { kind: "client", clientId: "c-1", id: "cu-1" };

describe("the id every portal query is anchored to", () => {
  it("comes from the session and nowhere else", () => {
    expect(clientIdOf(person)).toBe("c-1");
  });

  it("refuses a staff session, an empty one, and a forged kind", () => {
    expect(() => clientIdOf({ role: "partner", clientId: "c-1" })).toThrow();
    expect(() => clientIdOf({ kind: "client" })).toThrow();
    expect(() => clientIdOf(null)).toThrow();
    expect(() => clientIdOf({ kind: "staff", clientId: "c-1" })).toThrow();
  });

  it("anchors every scope to it", () => {
    for (const scope of [
      engagementScope(person),
      documentScope(person),
      invoiceScope(person),
      paymentScope(person),
    ]) {
      expect(scope.clientId).toBe("c-1");
    }
  });
});

describe("documents", () => {
  it("asks for shared ones only", () => {
    expect(documentScope(person)).toEqual({
      clientId: "c-1",
      sharedWithClient: true,
    });
  });
});

describe("invoices", () => {
  it("leaves out drafts and cancelled bills", () => {
    expect(CLIENT_VISIBLE_INVOICE_STATUSES).not.toContain("Draft");
    expect(CLIENT_VISIBLE_INVOICE_STATUSES).not.toContain("Cancelled");
  });

  it("shows the rest, including the awkward ones", () => {
    // written off and disputed are still bills that were issued: hiding
    // them would make the client's statement disagree with the firm's
    for (const status of [
      "Sent",
      "Partially paid",
      "Paid",
      "Disputed",
      "Written off",
    ]) {
      expect(CLIENT_VISIBLE_INVOICE_STATUSES).toContain(status);
    }
  });

  it("keeps up if a status is ever added", () => {
    // a new status appears in the client's list unless it is named as
    // hidden, which is the safe direction for a *bill* — the unsafe
    // direction would be hiding one they were sent
    expect(CLIENT_VISIBLE_INVOICE_STATUSES).toHaveLength(
      INVOICE_STATUSES.length - 2,
    );
  });
});

describe("one record at a time", () => {
  it("says no to another client's record", () => {
    expect(belongsToClient(person, { clientId: "c-2" })).toBe(false);
    expect(belongsToClient(person, { clientId: "c-1" })).toBe(true);
  });

  it("says no to nothing at all", () => {
    expect(belongsToClient(person, null)).toBe(false);
    expect(belongsToClient(person, {})).toBe(false);
  });
});

describe("what an engagement looks like to a client", () => {
  const engagement = {
    _id: "e-1",
    code: "NOI/GSTR3B/2026-09",
    status: "In progress",
    periodLabel: "September 2026",
    statutoryDue: new Date("2026-10-20T00:00:00+05:30"),
    filedOn: null,
    ackNo: "AB123",
    udin: "",
    // the internal apparatus, which must not come through
    assigneeId: "u-1",
    reviewerId: "u-2",
    internalDue: new Date("2026-10-15T00:00:00+05:30"),
    reworkCount: 2,
    reviewNotes: "Sent back twice, check the credit note",
    templateSnapshot: { name: "GSTR-3B filing", level: "L1" },
  };

  it("carries the work and not the apparatus", () => {
    const row = engagementForClient(engagement);
    expect(row.service).toBe("GSTR-3B filing");
    expect(row.status).toBe("In progress");
    expect(row).not.toHaveProperty("assigneeId");
    expect(row).not.toHaveProperty("reviewerId");
    expect(row).not.toHaveProperty("internalDue");
    expect(row).not.toHaveProperty("reworkCount");
    expect(row).not.toHaveProperty("reviewNotes");
    // and nothing sneaks through in a serialisation of the whole row
    expect(JSON.stringify(row)).not.toContain("Sent back twice");
  });

  it("never reads the internal fields in the first place", () => {
    // a field that is not selected cannot be leaked by a page that forgets
    for (const field of [
      "reviewerId",
      "internalDue",
      "reworkCount",
      "reviewNotes",
      "tasks",
      "checklist",
    ]) {
      expect(ENGAGEMENT_FIELDS).not.toContain(field);
    }
    expect(ENGAGEMENT_FIELDS).toContain("status");
    expect(ENGAGEMENT_FIELDS).toContain("filedOn");
  });
});

describe("the change request", () => {
  it("is a kind the Comment model accepts", () => {
    expect(Comment.schema.path("kind").enumValues).toContain("Change request");
  });

  it("defaults to internal, so the portal has to say otherwise by hand", () => {
    // the one place in the system that writes internal: false
    const comment = new Comment({
      entityType: "Client",
      entityId: "000000000000000000000001",
      body: "x",
    });
    expect(comment.internal).toBe(true);
  });

  it("has a message that tells somebody, and a rule that is on", () => {
    expect(TEMPLATES.clientChangeRequest.audience).toBe("team");
    expect(RULE_DEFAULTS.clientChangeRequest.enabled).toBe(true);
  });
});

describe("what a client is told about filings (P3-1)", () => {
  const d = (s) => new Date(`${s}T00:00:00+05:30`);

  it("counts the filings in, without naming who recorded them", () => {
    const row = engagementForClient({
      _id: "e1",
      templateSnapshot: { name: "GSTR-1 / GSTR-3B filing" },
      status: "In progress",
      statutoryDue: d("2026-11-20"),
      filedOn: null,
      milestones: [
        { filedOn: d("2026-11-10"), proofDocumentId: "doc1" },
        { filedOn: null, proofDocumentId: null },
      ],
    });

    expect(row.filingCount).toBe(2);
    expect(row.filedCount).toBe(1);
    expect(row.partFiled).toBe(true);
    // the projection is the guard, but the shape should not invite it either
    expect(JSON.stringify(row)).not.toMatch(/filedByName|history|correctedBy/);
  });

  it("says proof is pending when a filing has no acknowledgement attached", () => {
    const row = engagementForClient({
      _id: "e2",
      templateSnapshot: { name: "TDS return" },
      status: "Filed / delivered",
      filedOn: d("2026-10-31"),
      milestones: [{ filedOn: d("2026-10-31"), proofDocumentId: null }],
    });
    expect(row.proofPending).toBe(true);
    expect(row.partFiled).toBe(false);
  });

  it("is quiet about all of it for work from before P3-1", () => {
    const row = engagementForClient({
      _id: "e3",
      templateSnapshot: { name: "Bookkeeping" },
      status: "Completed",
      filedOn: d("2026-10-10"),
    });
    expect(row.filingCount).toBe(0);
    expect(row.partFiled).toBe(false);
    expect(row.proofPending).toBe(false);
  });

  it("keeps the staff-only sub-fields out of the projection entirely", () => {
    // what the portal pages are allowed to read at all
    expect(ENGAGEMENT_FIELDS).toMatch(/milestones\.filedOn/);
    expect(ENGAGEMENT_FIELDS).toMatch(/milestones\.proofDocumentId/);
    expect(ENGAGEMENT_FIELDS).not.toMatch(/milestones\.ackNo/);
    expect(ENGAGEMENT_FIELDS).not.toMatch(/milestones\.history/);
    expect(ENGAGEMENT_FIELDS).not.toMatch(/milestones\.filedBy/);
  });
});
