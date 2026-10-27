import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applyGuard, mailSettings } from "../lib/mailer/guard.js";
import { compose, fill, TEMPLATES } from "../lib/mailer/templates.js";

/**
 * The guard is the most important thing in this step and the least
 * interesting to look at: it is what stands between a loop in the
 * notification code and the firm's entire client list reading something
 * they should not have.
 *
 * So these tests are mostly about what does **not** get sent.
 */

const saved = { ...process.env };

beforeEach(() => {
  delete process.env.EMAIL_ENABLED;
  delete process.env.EMAIL_CLIENTS_ENABLED;
  delete process.env.EMAIL_REDIRECT_TO;
});

afterEach(() => {
  process.env = { ...saved };
});

const toClient = {
  to: "client@example.com",
  audience: "client",
  subject: "Invoice",
};
const toStaff = {
  to: "staff@phmgindia.com",
  audience: "team",
  subject: "Assigned",
};

describe("the client email guard", () => {
  it("holds client email back by default", () => {
    const result = applyGuard(toClient);
    expect(result.send).toBe(false);
    expect(result.heldReason).toMatch(/not switched on/);
  });

  it("still lets staff email through by default", () => {
    expect(applyGuard(toStaff).send).toBe(true);
  });

  it("sends to clients once switched on deliberately", () => {
    process.env.EMAIL_CLIENTS_ENABLED = "true";
    const result = applyGuard(toClient);
    expect(result.send).toBe(true);
    expect(result.to).toBe("client@example.com");
  });

  it("treats anything other than true as off", () => {
    for (const value of ["", "no", "0", "yes please", "TRUE "]) {
      process.env.EMAIL_CLIENTS_ENABLED = value;
      expect(applyGuard(toClient).send, value).toBe(false);
    }
  });

  it("accepts 1 and true, in either case", () => {
    for (const value of ["1", "true", "True", "TRUE"]) {
      process.env.EMAIL_CLIENTS_ENABLED = value;
      expect(applyGuard(toClient).send, value).toBe(true);
    }
  });

  it("stops everything when email is switched off entirely", () => {
    process.env.EMAIL_ENABLED = "false";
    process.env.EMAIL_CLIENTS_ENABLED = "true";
    expect(applyGuard(toClient).send).toBe(false);
    expect(applyGuard(toStaff).send).toBe(false);
  });

  it("refuses an address that is not one, rather than trying", () => {
    for (const bad of ["", "   ", "not-an-address", null, undefined]) {
      const result = applyGuard({ ...toStaff, to: bad });
      expect(result.send, String(bad)).toBe(false);
      expect(result.heldReason).toMatch(/No email address/);
    }
  });
});

describe("the testing redirect", () => {
  beforeEach(() => {
    process.env.EMAIL_REDIRECT_TO = "owner@phmgindia.com";
    process.env.EMAIL_CLIENTS_ENABLED = "true";
  });

  it("sends everything to one address instead", () => {
    const result = applyGuard(toClient);
    expect(result.send).toBe(true);
    expect(result.to).toBe("owner@phmgindia.com");
  });

  it("says in the subject who it was meant for", () => {
    expect(applyGuard(toClient).subject).toBe(
      "[to client@example.com] Invoice",
    );
  });

  it("does not override the client switch being off", () => {
    process.env.EMAIL_CLIENTS_ENABLED = "false";
    expect(applyGuard(toClient).send).toBe(false);
  });
});

describe("settings read from the environment", () => {
  it("defaults to sending, but not to clients", () => {
    const settings = mailSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.clientsEnabled).toBe(false);
  });
});

describe("filling a template in", () => {
  it("replaces what it knows", () => {
    expect(
      fill("Hello {name}, about {service}.", {
        name: "Riya",
        service: "GSTR-3B",
      }),
    ).toBe("Hello Riya, about GSTR-3B.");
  });

  it("leaves an unknown placeholder visible rather than printing undefined", () => {
    // a template bug should look like a bug, not like a client whose name
    // the firm does not know
    expect(fill("Dear {clientName},", {})).toBe("Dear {clientName},");
    expect(fill("Dear {clientName},", { clientName: "" })).toBe(
      "Dear {clientName},",
    );
  });

  it("composes a real message", () => {
    const message = compose("engagementAssigned", {
      assignee: "Riya",
      byName: "Sachin",
      client: "Aggarwal Traders",
      service: "GSTR-3B",
      period: "Oct 2026",
      dueLine: "Due 20-11-2026 (statutory).",
      link: "https://crm.phmgindia.com/engagements/1",
    });

    expect(message.audience).toBe("team");
    expect(message.subject).toBe(
      "GSTR-3B for Aggarwal Traders is yours (Oct 2026)",
    );
    expect(message.text).toContain("Sachin has assigned you");
    expect(message.text).toContain("Due 20-11-2026");
    expect(message.text).not.toContain("{");
  });

  it("lets the firm override the wording", () => {
    const message = compose(
      "engagementAssigned",
      { client: "ABC", service: "ITR", period: "FY 2026-27" },
      { engagementAssigned: { subject: "New job: {service} for {client}" } },
    );
    expect(message.subject).toBe("New job: ITR for ABC");
  });

  it("refuses a template that does not exist", () => {
    expect(() => compose("notAThing", {})).toThrow(/No such message/);
  });

  it("marks every client-facing template as such, so the guard sees it", () => {
    const clientFacing = Object.values(TEMPLATES).filter(
      (t) => t.audience === "client",
    );
    /**
     * Exactly these nine leave the building; everything else is internal,
     * and the guard only holds back what is marked "client".
     *
     * This list is an allow-list on purpose, so adding a client-facing
     * message is a deliberate act and not a side effect. P3-2 added the two
     * checklist ones: a document sent back with the reason, and an answer to
     * a question the client asked. P3-17a added `messageToClient`, which is
     * the only one whose words are a person's own rather than a template -
     * and being on this list is what puts it behind the client-email switch.
     */
    expect(clientFacing.map((t) => t.key).sort()).toEqual([
      "checklistAnswer",
      "checklistReplacement",
      "clientThreadMessage",
      "documentRequest",
      "documentsPending",
      "invoiceIssued",
      "invoiceReminder",
      "messageToClient",
      "paymentReceived",
    ]);
  });

  it("gives every template a line explaining it for the settings screen", () => {
    for (const template of Object.values(TEMPLATES)) {
      expect(template.what, template.key).toBeTruthy();
      expect(["team", "client"]).toContain(template.audience);
    }
  });
});
