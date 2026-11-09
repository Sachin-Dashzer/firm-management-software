import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { applyGuard, mailSettings, redirectFor } from "../lib/mailer/guard.js";
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
  delete process.env.EMAIL_REPLY_TO;
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

/**
 * A value for every placeholder any template uses, gathered from the
 * templates themselves so adding one to a template makes this list demand
 * a value for it rather than quietly letting `{newThing}` out of the door
 * (QA 09-11-2026, #15).
 */
const PLACEHOLDERS = [
  ...new Set(
    Object.values(TEMPLATES)
      .flatMap((template) => [
        ...`${template.subject} ${template.body}`.matchAll(/\{(\w+)\}/g),
      ])
      .map((match) => match[1]),
  ),
].sort();

const SAMPLE = Object.fromEntries(
  PLACEHOLDERS.map((key) => [key, `sample ${key}`]),
);

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

/**
 * The test redirect (QA 09-11-2026, #2).
 *
 * It used to be applied by `applyGuard`, which runs when a message is
 * *queued* — in the web process, minutes before the job runner posts it.
 * A message queued before the redirect was switched on therefore went to
 * the real client anyway, which is exactly what the QA run found: one
 * message redirected, the next not. It is now applied by `redirectFor` on
 * the send itself, and nowhere else.
 */
describe("the testing redirect", () => {
  beforeEach(() => {
    process.env.EMAIL_REDIRECT_TO = "owner@phmgindia.com";
    process.env.EMAIL_CLIENTS_ENABLED = "true";
  });

  it("sends everything to one address instead", () => {
    const result = redirectFor({
      to: "client@example.com",
      subject: "Invoice",
    });
    expect(result.to).toBe("owner@phmgindia.com");
    expect(result.intended).toBe("client@example.com");
    expect(result.redirected).toBe(true);
  });

  it("says in the subject who it was meant for", () => {
    expect(
      redirectFor({ to: "client@example.com", subject: "Invoice" }).subject,
    ).toBe("[to client@example.com] Invoice");
  });

  it("leaves the real address alone when it is off", () => {
    delete process.env.EMAIL_REDIRECT_TO;
    const result = redirectFor({
      to: "client@example.com",
      subject: "Invoice",
    });
    expect(result.to).toBe("client@example.com");
    expect(result.redirected).toBe(false);
  });

  it("applies to every template, team and client alike", () => {
    for (const key of Object.keys(TEMPLATES)) {
      const message = compose(key, SAMPLE);
      const route = redirectFor({
        to: "client@example.com",
        subject: message.subject,
      });
      expect(route.to, key).toBe("owner@phmgindia.com");
      expect(route.subject, key).toContain("[to client@example.com]");
    }
  });

  it("is not applied when the message is queued", () => {
    // the queue cannot know: the redirect may be switched on or off
    // between queueing and posting, and the post is what counts
    expect(applyGuard(toClient).to).toBe("client@example.com");
    expect(applyGuard(toClient).subject).toBe("Invoice");
  });

  it("does not override the client switch being off", () => {
    process.env.EMAIL_CLIENTS_ENABLED = "false";
    expect(applyGuard(toClient).send).toBe(false);
  });
});

/**
 * One function decides the transport, so the Settings screen cannot
 * describe a transport the sender is not using (#2). The screen showed
 * "messages are written to the server log" while a quotation was going out
 * over SMTP, because the two were decided in different processes; the
 * screen now also reports the transport the last message actually used,
 * from the message log.
 */
describe("which transport is in use", () => {
  it("is decided in one place in the whole codebase", () => {
    const hits = execFileSync(
      "git",
      [
        "grep",
        "-l",
        "process.env.EMAIL_TRANSPORT",
        "--",
        "app",
        "lib",
        "jobs",
        "runner",
      ],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);

    expect(hits).toEqual(["lib/mailer/index.js"]);
  });

  it("is what the settings screen reads, not a second opinion", () => {
    const page = readFileSync("app/(app)/settings/messages/page.jsx", "utf8");
    expect(page).toContain("transport: transportName()");
  });
});

describe("settings read from the environment", () => {
  it("defaults to sending, but not to clients", () => {
    const settings = mailSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.clientsEnabled).toBe(false);
  });

  /**
   * Four templates invite the client to reply, and `notices@` is a sending
   * mailbox nobody opens. Blank is the old behaviour and has to stay
   * blank — a default address here would send the firm's replies somewhere
   * nobody chose.
   */
  it("has no reply address until one is set", () => {
    expect(mailSettings().replyTo).toBe("");
  });

  it("trims the reply address, so a stray space is not a header", () => {
    process.env.EMAIL_REPLY_TO = "  caankit@phmgindia.com  ";
    expect(mailSettings().replyTo).toBe("caankit@phmgindia.com");
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
  });

  /**
   * #15: a quotation reached a client with the literal `{unpricedLine}` in
   * it, because every fee was priced and the code passed `""` for the line
   * that would have explained the unpriced ones.
   */
  it("prints nothing for an empty value, and takes its blank line with it", () => {
    expect(fill("Dear {clientName},", { clientName: "" })).toBe("Dear ,");
    expect(fill("One\n\n{extra}\n\nTwo", { extra: "" })).toBe("One\n\nTwo");
    expect(fill("One\n\n{extra}\n\nTwo", { extra: "Still here" })).toBe(
      "One\n\nStill here\n\nTwo",
    );
  });

  it("reports the placeholders nothing filled, so a message can be stopped", () => {
    const message = compose("quotation", { ...SAMPLE, unpricedLine: "" });
    expect(message.unfilled).toEqual([]);

    const broken = compose("quotation", { ...SAMPLE, totals: undefined });
    expect(broken.unfilled).toEqual(["totals"]);
  });

  it("leaves no placeholder in any template, given a value for each", () => {
    for (const key of Object.keys(TEMPLATES)) {
      const message = compose(key, SAMPLE);
      expect(message.unfilled, key).toEqual([]);
      expect(message.subject, key).not.toMatch(/[{}]/);
      expect(message.text, key).not.toMatch(/[{}]/);
    }
  });

  it("leaves no placeholder when every optional line is empty", () => {
    // the shape of #15: the lines a template only sometimes needs
    const optional = {};
    for (const key of PLACEHOLDERS) {
      optional[key] = /Line$|^items$|^remarks$|^contact$/.test(key)
        ? ""
        : `sample ${key}`;
    }

    for (const key of Object.keys(TEMPLATES)) {
      const message = compose(key, optional);
      expect(message.unfilled, key).toEqual([]);
      expect(message.text, key).not.toMatch(/[{}]/);
    }
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
     * Exactly these eleven leave the building; everything else is internal,
     * and the guard only holds back what is marked "client".
     *
     * This list is an allow-list on purpose, so adding a client-facing
     * message is a deliberate act and not a side effect. P3-2 added the two
     * checklist ones: a document sent back with the reason, and an answer to
     * a question the client asked. P3-17a added `messageToClient`, which is
     * the only one whose words are a person's own rather than a template -
     * and being on this list is what puts it behind the client-email switch.
     *
     * `clientDocument` was added to `templates.js` without being added
     * here, so this test failed from then until the email go-live work
     * (06-11-2026). It was marked `audience: "client"` correctly, so the
     * guard held it all along and nothing leaked — the allow-list was the
     * stale half, which is the harmless direction for this to break in.
     */
    expect(clientFacing.map((t) => t.key).sort()).toEqual([
      "checklistAnswer",
      "checklistReplacement",
      "clientDocument",
      "clientThreadMessage",
      "documentRequest",
      "documentsPending",
      "invoiceIssued",
      "invoiceReminder",
      "messageToClient",
      "paymentReceived",
      /* the fees a new client is taken on at, sent at the end of
         onboarding (06-11-2026) */
      "quotation",
    ]);
  });

  it("gives every template a line explaining it for the settings screen", () => {
    for (const template of Object.values(TEMPLATES)) {
      expect(template.what, template.key).toBeTruthy();
      expect(["team", "client"]).toContain(template.audience);
    }
  });
});
