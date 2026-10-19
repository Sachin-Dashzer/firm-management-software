import { describe, it, expect } from "vitest";
import {
  documentReminders,
  engagementReminders,
  invoiceReminders,
  perRecipient,
} from "../lib/mailer/sweep.js";
import {
  mergeRules,
  describeTiming,
  RULE_DEFAULTS,
} from "../lib/mailer/rules.js";
import { istDate } from "../lib/dates.js";

/**
 * Which reminders fire on which day (spec section 12).
 *
 * This is the part of the notification system that is either right or
 * quietly wrong for a year: nobody notices a reminder that never went.
 * So every rule is checked on the day before, the day itself, and the day
 * after, against the spec's own timings.
 */

const rules = mergeRules([]);

/** 09:00 IST on a given Indian date, which is when the sweep runs. */
const at = (year, month, day) =>
  new Date(istDate(year, month, day).getTime() + 8 * 60 * 60 * 1000);

const engagement = (extra = {}) => ({
  _id: "e1",
  clientId: "c1",
  code: "ENG-0001",
  status: "In progress",
  period: "2026-10",
  periodLabel: "October 2026",
  templateSnapshot: { name: "GSTR-3B" },
  assigneeId: "u-assignee",
  reviewerId: "u-reviewer",
  internalDue: null,
  statutoryDue: null,
  ...extra,
});

describe("our own target date", () => {
  const due = istDate(2026, 10, 20);

  it("goes out two days before, to the assignee only", () => {
    const out = engagementReminders(
      { engagement: engagement({ internalDue: due }), clientName: "Rao & Co" },
      rules,
      at(2026, 10, 18),
    );
    expect(out).toHaveLength(1);
    expect(out[0].rule).toBe("internalDueSoon");
    expect(out[0].userIds).toEqual(["u-assignee"]);
    expect(out[0].values.client).toBe("Rao & Co");
  });

  it("says nothing three days before or on the day", () => {
    const three = engagementReminders(
      { engagement: engagement({ internalDue: due }) },
      rules,
      at(2026, 10, 17),
    );
    const sameDay = engagementReminders(
      { engagement: engagement({ internalDue: due }) },
      rules,
      at(2026, 10, 20),
    );
    expect(three).toHaveLength(0);
    expect(sameDay).toHaveLength(0);
  });
});

describe("the statutory date", () => {
  const due = istDate(2026, 10, 20);
  const withDue = () => engagement({ statutoryDue: due });

  it("goes out five days and one day before", () => {
    for (const [day, left] of [
      [15, 5],
      [19, 1],
    ]) {
      const out = engagementReminders(
        { engagement: withDue(), clientPartnerId: "u-partner" },
        rules,
        at(2026, 10, day),
      );
      const statutory = out.filter((r) => r.rule === "statutoryDueSoon");
      expect(statutory).toHaveLength(1);
      expect(statutory[0].values.days).toBe(left);
      // assignee, reviewer and the client partner (spec section 12)
      expect(statutory[0].userIds).toEqual([
        "u-assignee",
        "u-reviewer",
        "u-partner",
      ]);
    }
  });

  it("is silent on the days between", () => {
    for (const day of [14, 16, 17, 18]) {
      const out = engagementReminders(
        { engagement: withDue() },
        rules,
        at(2026, 10, day),
      );
      expect(out.filter((r) => r.rule === "statutoryDueSoon")).toHaveLength(0);
    }
  });

  it("stops once the work has been filed", () => {
    const out = engagementReminders(
      {
        engagement: engagement({
          statutoryDue: due,
          status: "Filed / delivered",
        }),
      },
      rules,
      at(2026, 10, 19),
    );
    expect(out).toHaveLength(0);
  });

  it("never fires for work with no statutory date — we do not invent one", () => {
    const out = engagementReminders(
      { engagement: engagement({ internalDue: istDate(2026, 10, 20) }) },
      rules,
      at(2026, 10, 19),
    );
    expect(out.filter((r) => r.rule === "statutoryDueSoon")).toHaveLength(0);
  });
});

describe("overdue work", () => {
  const due = istDate(2026, 10, 10);

  it("chases the assignee and reviewer every day, not the partner", () => {
    const out = engagementReminders(
      {
        engagement: engagement({ statutoryDue: due }),
        clientPartnerId: "u-partner",
      },
      rules,
      at(2026, 10, 13),
    );
    const overdue = out.filter((r) => r.rule === "engagementOverdue");
    expect(overdue).toHaveLength(1);
    expect(overdue[0].values.days).toBe(3);
    expect(overdue[0].userIds).toEqual(["u-assignee", "u-reviewer"]);
  });

  it("has one key per day, so it goes once a day however often we sweep", () => {
    const first = engagementReminders(
      { engagement: engagement({ statutoryDue: due }) },
      rules,
      at(2026, 10, 13),
    )[0];
    const later = engagementReminders(
      { engagement: engagement({ statutoryDue: due }) },
      rules,
      new Date(at(2026, 10, 13).getTime() + 6 * 60 * 60 * 1000),
    )[0];
    const tomorrow = engagementReminders(
      { engagement: engagement({ statutoryDue: due }) },
      rules,
      at(2026, 10, 14),
    )[0];

    expect(first.dedupeKey).toBe(later.dedupeKey);
    expect(first.dedupeKey).not.toBe(tomorrow.dedupeKey);
  });

  it("falls back to our own date when there is no statutory one", () => {
    const out = engagementReminders(
      { engagement: engagement({ internalDue: due }) },
      rules,
      at(2026, 10, 12),
    );
    const overdue = out.filter((r) => r.rule === "engagementOverdue");
    expect(overdue[0].values.which).toBe("internal");
  });

  it("leaves completed and cancelled work alone", () => {
    for (const status of ["Completed", "Cancelled"]) {
      expect(
        engagementReminders(
          { engagement: engagement({ statutoryDue: due, status }) },
          rules,
          at(2026, 10, 20),
        ),
      ).toHaveLength(0);
    }
  });
});

describe("chasing a client for documents", () => {
  const contact = { email: "ravi@raoandco.in", clientName: "Rao & Co" };
  const request = (extra = {}) => ({
    _id: "r1",
    clientId: "c1",
    reminderCount: 0,
    lastReminderAt: istDate(2026, 10, 10),
    items: [{ name: "Bank statement", checklistItemId: "i1" }],
    ...extra,
  });

  it("waits three days, then asks again", () => {
    expect(
      documentReminders(
        { request: request(), outstanding: ["Bank statement"], contact },
        rules,
        at(2026, 10, 12),
      ),
    ).toHaveLength(0);

    const out = documentReminders(
      { request: request(), outstanding: ["Bank statement"], contact },
      rules,
      at(2026, 10, 13),
    );
    expect(out).toHaveLength(1);
    expect(out[0].values.items).toBe("- Bank statement");
  });

  it("stops after four reminders", () => {
    const out = documentReminders(
      {
        request: request({ reminderCount: 4 }),
        outstanding: ["Bank statement"],
        contact,
      },
      rules,
      at(2026, 10, 30),
    );
    expect(out).toHaveLength(0);
  });

  it("stops as soon as the documents arrive", () => {
    expect(
      documentReminders(
        { request: request(), outstanding: [], contact },
        rules,
        at(2026, 10, 30),
      ),
    ).toHaveLength(0);
  });

  it("does not chase through a withdrawn link", () => {
    expect(
      documentReminders(
        {
          request: request({ revokedAt: new Date() }),
          outstanding: ["Bank statement"],
          contact,
        },
        rules,
        at(2026, 10, 30),
      ),
    ).toHaveLength(0);
  });

  it("counts the reminders in the key, so each one goes exactly once", () => {
    const first = documentReminders(
      { request: request(), outstanding: ["Bank statement"], contact },
      rules,
      at(2026, 10, 13),
    )[0];
    const second = documentReminders(
      {
        request: request({
          reminderCount: 1,
          lastReminderAt: istDate(2026, 10, 13),
        }),
        outstanding: ["Bank statement"],
        contact,
      },
      rules,
      at(2026, 10, 16),
    )[0];
    expect(first.dedupeKey).not.toBe(second.dedupeKey);
  });
});

describe("invoice payment reminders", () => {
  const contact = { email: "accounts@raoandco.in", clientName: "Rao & Co" };
  const invoice = (extra = {}) => ({
    _id: "i1",
    clientId: "c1",
    number: "PHMG/26-27/0012",
    status: "Sent",
    dueDate: istDate(2026, 10, 20),
    totalPaise: 5_900_000,
    paidPaise: 0,
    tdsCreditedPaise: 0,
    ...extra,
  });

  it("goes three days before, on the day, then weekly", () => {
    // 17 Oct is three days before, 20 Oct is the day, 27 Oct is a week
    // after, and 34 rolls into 3 November — a fortnight after
    for (const day of [17, 20, 27, 34]) {
      const out = invoiceReminders(
        { invoice: invoice(), contact },
        rules,
        at(2026, 10, day),
      );
      expect(out, `day ${day}`).toHaveLength(1);
    }
  });

  it("says nothing in between", () => {
    for (const day of [16, 18, 19, 21, 25, 26, 28]) {
      expect(
        invoiceReminders(
          { invoice: invoice(), contact },
          rules,
          at(2026, 10, day),
        ),
        `day ${day}`,
      ).toHaveLength(0);
    }
  });

  it("shows what is still outstanding, not the invoice total", () => {
    const out = invoiceReminders(
      {
        invoice: invoice({ status: "Partially paid", paidPaise: 2_000_000 }),
        contact,
      },
      rules,
      at(2026, 10, 20),
    );
    expect(out[0].values.amount).toContain("39,000");
  });

  it("leaves a paid, cancelled, written-off or draft invoice alone", () => {
    for (const status of ["Paid", "Cancelled", "Written off", "Draft"]) {
      expect(
        invoiceReminders(
          { invoice: invoice({ status }), contact },
          rules,
          at(2026, 10, 20),
        ),
      ).toHaveLength(0);
    }
  });

  it("never chases an invoice that has been settled in full", () => {
    expect(
      invoiceReminders(
        { invoice: invoice({ paidPaise: 5_900_000 }), contact },
        rules,
        at(2026, 10, 20),
      ),
    ).toHaveLength(0);
  });

  it("never chases a draft with no number", () => {
    expect(
      invoiceReminders(
        { invoice: invoice({ number: null }), contact },
        rules,
        at(2026, 10, 20),
      ),
    ).toHaveLength(0);
  });
});

describe("a switched-off rule", () => {
  const off = mergeRules([{ key: "engagementOverdue", enabled: false }]);

  it("sends nothing at all", () => {
    const out = engagementReminders(
      { engagement: engagement({ statutoryDue: istDate(2026, 10, 1) }) },
      off,
      at(2026, 10, 15),
    );
    expect(out).toHaveLength(0);
  });

  it("leaves the other rules alone", () => {
    expect(off.statutoryDueSoon.enabled).toBe(true);
  });
});

describe("the firm's own timings", () => {
  it("replaces the days the spec starts with", () => {
    const merged = mergeRules([
      { key: "statutoryDueSoon", daysBefore: [10, 3] },
    ]);
    expect(merged.statutoryDueSoon.daysBefore).toEqual([10, 3]);

    const out = engagementReminders(
      { engagement: engagement({ statutoryDue: istDate(2026, 10, 20) }) },
      merged,
      at(2026, 10, 10),
    );
    expect(out.filter((r) => r.rule === "statutoryDueSoon")).toHaveLength(1);
  });

  it("ignores a stored rule that no longer exists in the code", () => {
    const merged = mergeRules([{ key: "somethingWeRemoved", enabled: false }]);
    expect(merged.somethingWeRemoved).toBeUndefined();
    expect(Object.keys(merged)).toEqual(Object.keys(RULE_DEFAULTS));
  });

  it("describes each timing in words a partner can check", () => {
    expect(describeTiming(RULE_DEFAULTS.statutoryDueSoon)).toBe(
      "5 days and 1 day before",
    );
    expect(describeTiming(RULE_DEFAULTS.documentsPending)).toBe(
      "then every 3 days, at most 4 times",
    );
    expect(describeTiming(RULE_DEFAULTS.weeklySummary)).toBe(
      "Mondays at 09:00 IST",
    );
  });
});

describe("one message per recipient", () => {
  it("gives each person their own key, so none is lost to the other's", () => {
    const reminder = engagementReminders(
      { engagement: engagement({ statutoryDue: istDate(2026, 10, 20) }) },
      rules,
      at(2026, 10, 19),
    )[0];

    const expanded = perRecipient(reminder, [
      { id: "u-assignee", email: "a@phmgindia.com" },
      { id: "u-reviewer", email: "r@phmgindia.com" },
    ]);

    expect(expanded).toHaveLength(2);
    expect(new Set(expanded.map((e) => e.dedupeKey)).size).toBe(2);
  });

  it("drops a person with neither an id nor an address", () => {
    const reminder = { rule: "x", dedupeKey: "x:1", values: {}, about: {} };
    expect(
      perRecipient(reminder, [{}, null, { email: "a@b.com" }]),
    ).toHaveLength(1);
  });
});
