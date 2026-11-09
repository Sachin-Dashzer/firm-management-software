import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RULE_DEFAULTS, rulesForDisplay } from "../lib/mailer/rules.js";

/**
 * Two screens that answered a question nobody asked (QA 09-11-2026,
 * #16 and #22).
 */

describe("searching the client list (#16)", () => {
  const page = readFileSync("app/(app)/clients/page.jsx", "utf8");

  /**
   * A search for "ZZTEST" or "Sharma" has no digits in it, so the mobile
   * clause became `{ "contacts.mobile": "" }` — which matches every client
   * whose contact has no number on file. That is why a search for a test
   * client kept returning a real one.
   */
  it("does not look up a mobile number when nothing was typed as one", () => {
    expect(page).not.toContain(
      '{ "contacts.mobile": search.replace(/\D/g, "") }',
    );
    expect(page).toContain(
      'digits.length >= 6 ? [{ "contacts.mobile": digits }] : []',
    );
  });

  it("uses the same floor the command bar uses", () => {
    const route = readFileSync("app/api/search/route.js", "utf8");
    for (const text of [page, route]) {
      expect(text).toContain("digits.length >= 6");
    }
  });
});

describe("a rule nothing can trigger (#22)", () => {
  /**
   * The comment threads came off the job screen on 03-11-2026 at the
   * owner's request. The rule that emails whoever was named in a comment
   * stayed on Settings → Automation, offering a switch for something that
   * can no longer happen — which is what sent the QA run looking for the
   * comment box.
   */
  it("is marked retired, with the reason kept", () => {
    expect(RULE_DEFAULTS.mentioned.retired).toMatch(/no comment box/i);
  });

  it("is not offered as a setting", () => {
    // the defaults are what a firm that has never opened the screen has
    const shown = rulesForDisplay(RULE_DEFAULTS);
    expect(shown.some((rule) => rule.key === "mentioned")).toBe(false);
    // and the rest are still there
    expect(shown.length).toBeGreaterThan(5);
  });
});
