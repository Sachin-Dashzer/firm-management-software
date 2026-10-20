import { describe, it, expect } from "vitest";
import { checkUdinShape } from "../lib/practice/udin.js";
import { dscState, dueReminder, DSC_CLASSES } from "../lib/practice/dsc.js";
import { dscReminders } from "../lib/mailer/sweep.js";
import { RULE_DEFAULTS } from "../lib/mailer/rules.js";
import { compose } from "../lib/mailer/templates.js";

/**
 * The two registers (P2-7).
 *
 * The sharp edges are the dates: a certificate must not be called expired on
 * the day it is still good, and a reminder must not fire every morning for
 * ever once a date has passed.
 */

const NOW = new Date("2026-10-19T12:00:00+05:30");
const ist = (text) => new Date(`${text}T12:00:00+05:30`);

describe("a UDIN's shape", () => {
  it("accepts the 18 characters the ICAI issues", () => {
    expect(checkUdinShape("26123456ABCDEF7890").ok).toBe(true);
  });

  it("refuses anything else, and says what it wants", () => {
    const short = checkUdinShape("2612345");
    expect(short.ok).toBe(false);
    expect(short.error).toContain("18");
    expect(checkUdinShape("26123456ABCDEF789").ok).toBe(false);
    expect(checkUdinShape("26123456abcdef7890").ok).toBe(false);
    expect(checkUdinShape("26123456ABCDEF-890").ok).toBe(false);
    expect(checkUdinShape("").ok).toBe(false);
  });
});

describe("how close a certificate is to expiry", () => {
  it("counts a date still ahead as days left", () => {
    expect(dscState(ist("2026-12-31"), NOW)).toMatchObject({
      state: "valid",
      days: 73,
    });
  });

  it("calls the next thirty days soon, and today today", () => {
    expect(dscState(ist("2026-11-10"), NOW).state).toBe("soon");
    expect(dscState(ist("2026-10-19"), NOW).state).toBe("today");
  });

  it("does not call a certificate expired while it is still good", () => {
    // the boundary: the thirtieth day out is soon, not expired
    expect(dscState(ist("2026-11-18"), NOW).state).toBe("soon");
    expect(dscState(ist("2026-11-19"), NOW).state).toBe("valid");
  });

  it("says how long ago one lapsed", () => {
    const state = dscState(ist("2026-10-12"), NOW);
    expect(state.state).toBe("expired");
    expect(state.label).toBe("Expired 7 days ago");
  });

  it("says so plainly when there is no date at all", () => {
    expect(dscState(null, NOW).state).toBe("unknown");
  });
});

describe("when a certificate earns a reminder", () => {
  const at = (date) => ({ validTill: ist(date) });

  it("fires on each notice period the firm set", () => {
    expect(dueReminder(at("2026-11-18"), [30, 7], NOW)).toBe(30);
    expect(dueReminder(at("2026-10-26"), [30, 7], NOW)).toBe(7);
  });

  it("stays quiet on every other day", () => {
    expect(dueReminder(at("2026-11-17"), [30, 7], NOW)).toBeNull();
    expect(dueReminder(at("2026-10-27"), [30, 7], NOW)).toBeNull();
  });

  it("fires once on the day itself, whatever the notice periods are", () => {
    expect(dueReminder(at("2026-10-19"), [30, 7], NOW)).toBe(0);
    expect(dueReminder(at("2026-10-19"), [], NOW)).toBe(0);
  });

  it("goes silent once the date has passed", () => {
    // the register shows it in red for ever; a daily email would be noise
    expect(dueReminder(at("2026-10-18"), [30, 7], NOW)).toBeNull();
    expect(dueReminder(at("2026-01-01"), [30, 7], NOW)).toBeNull();
  });

  it("has nothing to say about a certificate with no expiry", () => {
    expect(dueReminder({ validTill: null }, [30], NOW)).toBeNull();
  });
});

describe("the reminder the sweep plans", () => {
  const dsc = {
    _id: "dsc1",
    clientId: "cli1",
    holderName: "Vikram Jaiswal",
    holderRole: "Director",
    certClass: "Class 3",
    validTill: ist("2026-10-26"),
  };
  const rules = { dscExpiring: RULE_DEFAULTS.dscExpiring };

  it("tells the people who would make the call, once per notice period", () => {
    const [reminder] = dscReminders(
      { dsc, clientName: "Jaiswal Steels", userIds: ["u-partner", "u-ca"] },
      rules,
      NOW,
    );
    expect(reminder.rule).toBe("dscExpiring");
    expect(reminder.dedupeKey).toBe("dscExpiring:dsc1:7");
    expect(reminder.userIds).toEqual(["u-partner", "u-ca"]);
    expect(reminder.values.whenLine).toContain("7 days");
  });

  it("plans nothing when the firm has switched the rule off", () => {
    expect(
      dscReminders({ dsc }, { dscExpiring: { enabled: false } }, NOW),
    ).toEqual([]);
  });

  it("is internal, so it is never held back with client email", () => {
    // a client-facing reminder waits for EMAIL_CLIENTS_ENABLED; this must not
    const message = compose("dscExpiring", {
      ...dscReminders({ dsc, clientName: "Jaiswal Steels" }, rules, NOW)[0]
        .values,
    });
    expect(message.audience).toBe("team");
    expect(message.subject).toContain("Vikram Jaiswal");
    expect(message.text).toContain("Director");
    expect(message.text).not.toContain("{");
  });
});

describe("the register's vocabulary", () => {
  it("keeps Class 2 readable for old records", () => {
    // withdrawn for new issues, but a register has to render what it holds
    expect(DSC_CLASSES).toContain("Class 2");
    expect(DSC_CLASSES).toContain("Class 3");
  });

  it("ships a dscExpiring rule the firm can change", () => {
    const rule = RULE_DEFAULTS.dscExpiring;
    expect(rule.enabled).toBe(true);
    expect(rule.daysBefore).toEqual([30, 7]);
  });
});
