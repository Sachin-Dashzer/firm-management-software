import { describe, it, expect } from "vitest";
import {
  INBOX_KINDS,
  kindOf,
  showing,
  snoozeUntil,
  SNOOZE_CHOICES,
  mentionsIn,
} from "../lib/inbox/index.js";
import {
  messagesFor,
  checkMessage,
  TEAM_TEMPLATE,
  CLIENT_TEMPLATE,
} from "../lib/mailer/message.js";
import { TEMPLATES } from "../lib/mailer/templates.js";
import { RULE_DEFAULTS } from "../lib/mailer/rules.js";

/**
 * The inbox, mentions and Notify (P3-17a).
 *
 * The test that earns its place is the last one: the preview a person
 * reads and the message that goes out come from one function. A preview
 * built by a second code path is a preview that eventually lies, and
 * nobody would ever know.
 */

describe("every message has a group in the inbox", () => {
  it("puts a mention in Mentions and a review in Review", () => {
    expect(kindOf("mentioned")).toBe("Mentions");
    expect(kindOf("engagementForReview")).toBe("Review");
    expect(kindOf("engagementReworked")).toBe("Review");
  });

  it("groups money, clients, registers and digests apart", () => {
    expect(kindOf("invoiceReminder")).toBe("Money");
    expect(kindOf("documentRequest")).toBe("Clients");
    expect(kindOf("dscExpiring")).toBe("Registers");
    expect(kindOf("dailyDigest")).toBe("Digests");
  });

  /**
   * A message with no home belongs in front of the person it was sent to,
   * not in an "Other" bucket nobody filters by.
   */
  it("gives an unknown template a home rather than hiding it", () => {
    expect(kindOf("somethingNewNextYear")).toBe("My work");
    expect(INBOX_KINDS).toContain("My work");
  });

  it("gives every template that reaches a person a group that exists", () => {
    for (const key of Object.keys(TEMPLATES)) {
      expect(INBOX_KINDS, key).toContain(kindOf(key));
    }
  });
});

describe("snooze says not now, never gone", () => {
  const now = new Date("2026-11-10T06:00:00.000Z");

  it("shows a row with nothing set on it", () => {
    expect(showing({}, now)).toBe(true);
    expect(showing({ snoozedUntil: null }, now)).toBe(true);
  });

  it("hides one until its moment, then shows it again", () => {
    const until = new Date(now.getTime() + 3_600_000);
    expect(showing({ snoozedUntil: until }, now)).toBe(false);
    expect(showing({ snoozedUntil: until }, new Date(until.getTime()))).toBe(
      true,
    );
  });

  it("offers three choices and refuses anything else", () => {
    expect(SNOOZE_CHOICES.map((row) => row.key)).toEqual([
      "3h",
      "tomorrow",
      "week",
    ]);
    expect(snoozeUntil("tomorrow", now).getTime()).toBe(
      now.getTime() + 24 * 3_600_000,
    );
    expect(snoozeUntil("forever", now)).toBe(null);
  });
});

describe("a mention reaches the person it names", () => {
  const team = [
    { _id: "1", name: "Priya Nair" },
    { _id: "2", name: "Priyanka Rao" },
    { _id: "3", name: "Anil Mehra" },
    { _id: "4", name: "Ravi Kumar Singh" },
    { _id: "5", name: "Priya Sharma" },
  ];

  it("matches a first name", () => {
    expect(mentionsIn("@anil can you look at this", team)).toEqual([team[2]]);
  });

  it("matches a whole name without spaces", () => {
    expect(mentionsIn("asked @ravikumarsingh already", team)).toEqual([
      team[3],
    ]);
  });

  /**
   * The old rule matched on `startsWith`, so `@pri` reached Priya and `@a`
   * reached everybody beginning with an A. A handle is now the first name
   * or the whole name, and nothing else.
   */
  it("does not match half a name", () => {
    expect(mentionsIn("@pri", team)).toEqual([]);
    expect(mentionsIn("@a", team)).toEqual([]);
  });

  /**
   * Two people called Priya means both are told. The alternative is
   * silently picking one and leaving the other out of a conversation they
   * were named in. Priyanka is *not* one of them: a handle is a name, not
   * a prefix.
   */
  it("tells everybody an ambiguous mention fits, and nobody it does not", () => {
    expect(mentionsIn("@priya please check", team)).toEqual([team[0], team[4]]);
  });

  it("finds several, once each, whatever the case and the punctuation", () => {
    expect(mentionsIn("@Anil and @anil. and @PRIYANKA", team)).toEqual([
      team[1],
      team[2],
    ]);
  });

  it("finds nothing in a comment with no mention in it", () => {
    expect(mentionsIn("filed this morning", team)).toEqual([]);
    expect(mentionsIn("", team)).toEqual([]);
  });

  it("has a template and a rule behind it, so the firm can switch it off", () => {
    expect(TEMPLATES.mentioned.audience).toBe("team");
    expect(RULE_DEFAULTS.mentioned.enabled).toBe(true);
  });
});

describe("the preview is the message", () => {
  const recipients = [
    {
      id: "u1",
      name: "Priya Nair",
      email: "priya@phmg.test",
      side: "team",
      why: "Reviewing it",
    },
    {
      id: "contact:1",
      name: "Suresh Agarwal",
      email: "suresh@client.test",
      side: "client",
      why: "Nirmal Udyog",
    },
  ];

  const built = () =>
    messagesFor({
      recipients,
      subject: "GSTR-3B for October",
      body: "The figures are ready for your approval.",
      from: "Anil Mehra",
      job: "GST monthly Oct 2026",
      firm: "PHMG & Associates",
      link: "https://crm.test/engagements/1",
    });

  it("writes one message per recipient, in the order they were picked", () => {
    expect(built().map((row) => row.name)).toEqual([
      "Priya Nair",
      "Suresh Agarwal",
    ]);
  });

  it("uses a different template for a colleague and a client", () => {
    const [team, client] = built();
    expect(team.template).toBe(TEAM_TEMPLATE);
    expect(client.template).toBe(CLIENT_TEMPLATE);
  });

  /**
   * The client's copy is marked `client`, which is what puts it behind the
   * client-email switch and the guard — the same path an invoice takes.
   */
  it("marks the client's copy as leaving the building", () => {
    expect(built()[1].audience).toBe("client");
    expect(built()[0].audience).toBe("team");
  });

  it("greets the client by name and signs with the firm", () => {
    const client = built()[1];
    expect(client.text).toContain("Dear Suresh Agarwal");
    expect(client.text).toContain("Anil Mehra");
    expect(client.text).toContain("PHMG & Associates");
  });

  /** A client is never sent a link into the firm's own system. */
  it("keeps the internal link out of the client's copy", () => {
    expect(built()[0].text).toContain("https://crm.test/engagements/1");
    expect(built()[1].text).not.toContain("crm.test");
  });

  it("carries the sender's own words, unchanged, to both", () => {
    for (const row of built()) {
      expect(row.text).toContain("The figures are ready for your approval.");
      expect(row.subject).toBe("GSTR-3B for October");
    }
  });

  it("refuses an empty message before anybody previews it", () => {
    expect(checkMessage({ subject: "", body: "", recipients })).toMatch(
      /Give it a subject/,
    );
    expect(checkMessage({ subject: "Ready", body: "ok", recipients })).toMatch(
      /Write the message/,
    );
    expect(checkMessage({ subject: "Ready", body: "", recipients: [] })).toBe(
      "Nobody is ticked.",
    );
    expect(
      checkMessage({
        subject: "Ready",
        body: "The figures are ready.",
        recipients: [{ ...recipients[0], email: "" }],
      }),
    ).toMatch(/no email address/);
  });

  it("takes a message that is ready", () => {
    expect(
      checkMessage({
        subject: "Ready",
        body: "The figures are ready for your approval.",
        recipients,
      }),
    ).toBe(null);
  });
});
