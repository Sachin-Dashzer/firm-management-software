import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { article, withArticle } from "../lib/words.js";
import { PAN_CHAR_FOR_ENTITY, ENTITY_TYPES } from "../lib/validators.js";
import { RULE_DEFAULTS, describeTiming } from "../lib/mailer/rules.js";
import { HANDLERS } from "../lib/jobs/run.js";

/** The cleanup the QA run of 09-11-2026 asked for (#30 to #34, #36). */

describe("a and an (#30)", () => {
  it("gets the entity types right", () => {
    expect(withArticle("Individual")).toBe("an Individual");
    expect(withArticle("AOP")).toBe("an AOP");
    expect(withArticle("Company")).toBe("a Company");
    expect(withArticle("Trust")).toBe("a Trust");
    expect(withArticle("HUF")).toBe("a HUF");
  });

  it("goes by sound, not by spelling", () => {
    expect(article("hour")).toBe("an");
    expect(article("LLP")).toBe("an");
    expect(article("One Person Company")).toBe("a");
    expect(article("European")).toBe("a");
  });

  it("says something for an empty word rather than nothing", () => {
    expect(article("")).toBe("a");
  });
});

describe("the PAN placeholder (#30)", () => {
  /**
   * The wizard showed "AAACZ1234C" to everybody — a company PAN — and
   * then the checks refused the C an individual had copied the shape of.
   */
  it("suggests the right holder character for each entity", () => {
    for (const entity of ENTITY_TYPES) {
      const char = PAN_CHAR_FOR_ENTITY[entity];
      expect(char, entity).toBeTruthy();
    }
    expect(PAN_CHAR_FOR_ENTITY.Individual).toBe("P");
    expect(PAN_CHAR_FOR_ENTITY["Private Limited"]).toBe("C");
  });

  it("is built from that character, not hard-coded", () => {
    const page = readFileSync("app/(app)/clients/new/Onboarding.jsx", "utf8");
    expect(page).toContain("panPlaceholder");
    expect(page).not.toContain('placeholder: "AAACZ1234C"');
  });
});

describe("every recipe has a trigger (#31)", () => {
  /** The last one read "When , if it is the team's…" */
  it("says when it happens, whatever kind of rule it is", () => {
    for (const rule of Object.values(RULE_DEFAULTS)) {
      expect(describeTiming(rule), rule.key).toBeTruthy();
    }
  });
});

describe("a page that is not there (#32)", () => {
  it("has a not-found page of the app's own", () => {
    expect(existsSync("app/not-found.jsx")).toBe(true);
  });

  it("offers a way back, and does not shout a number", () => {
    const page = readFileSync("app/not-found.jsx", "utf8");
    expect(page).toContain("/dashboard");
    // the number means nothing to the people who use this; the comment
    // above the component may still explain what Next would have drawn
    const shown = page.slice(page.indexOf("export default"));
    expect(shown).not.toContain("404");
  });
});

describe("dates people read (#33)", () => {
  it("formats the DSC expiry rather than printing the input value", () => {
    const actions = readFileSync("app/(app)/practice/dsc/actions.js", "utf8");
    expect(actions).toContain("formatISTDate");
    expect(actions).not.toContain("expiring ${data.validTill}");
  });
});

describe("text written for a developer (#34)", () => {
  const SCREENS = [
    "app/(app)/clients/ClientForm.jsx",
    "app/(app)/engagements/[id]/page.jsx",
    "app/(app)/practice/audit/[id]/AuditStudio.jsx",
    "app/(app)/practice/certificates/page.jsx",
    "app/(app)/practice/notices/[id]/NoticeMatter.jsx",
    "app/(app)/settings/customise/page.jsx",
    "app/(app)/settings/jobs/JobsAdmin.jsx",
  ];

  /**
   * Only what a person can see. The same words are allowed in a comment,
   * where they are the reason the code is the way it is.
   */
  const visible = (text) =>
    text
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
      .join("\n");

  it("is off the screens the firm reads", () => {
    for (const file of SCREENS) {
      const text = visible(readFileSync(file, "utf8"));
      expect(text, `${file}: prototype`).not.toMatch(/design prototype/i);
      expect(text, `${file}: Step n`).not.toMatch(/arrives in Step \d/);
      expect(text, `${file}: cPanel`).not.toMatch(/cron job in cPanel/);
    }
  });

  it("names Vercel Cron, which is what actually starts the runner", () => {
    const admin = readFileSync("app/(app)/settings/jobs/JobsAdmin.jsx", "utf8");
    expect(admin).toContain("Vercel Cron");
    expect(JSON.parse(readFileSync("vercel.json", "utf8")).crons).toBeTruthy();
  });
});

describe("creating a client (#36)", () => {
  /**
   * The quotation was sent inside the request that creates the client —
   * its own transaction, and inside it the rules, the firm's record, the
   * client-mail switch, a message-log row and a job to post it.
   */
  it("hands the quotation to the job queue", () => {
    expect(HANDLERS.quotation).toBeTypeOf("function");

    const actions = readFileSync("app/(app)/clients/new/actions.js", "utf8");
    expect(actions).toContain('enqueue("quotation"');
    expect(actions).not.toContain("quotationToClient");
  });

  it("writes the service subscriptions in one go, not one at a time", () => {
    const actions = readFileSync("app/(app)/clients/new/actions.js", "utf8");
    // `ordered` is not optional: Mongoose refuses several documents in one
    // session without it, which is how the batch shipped broken
    expect(actions).toContain(
      "ClientService.create(rows, { session, ordered: true })",
    );
  });

  it("opens three transactions on the way, not five", () => {
    const actions = readFileSync("app/(app)/clients/new/actions.js", "utf8");
    expect(actions.match(/audited\(actor/g) ?? []).toHaveLength(3);
  });
});
