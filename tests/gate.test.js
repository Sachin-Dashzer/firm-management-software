import { describe, it, expect } from "vitest";
import {
  decideBatch,
  applyMonthlyCap,
  stillWanted,
  inQuietHours,
  quietUntil,
  capMonth,
  ALWAYS_APPROVE_OVER,
  MONTHLY_CAP,
} from "../lib/mailer/gate.js";
import { istHour, istWeekday } from "../lib/dates.js";

/**
 * The automation gate (P3-10).
 *
 * `lib/mailer/guard.js` already answers "may a message leave the building".
 * This answers a harder one: a rule has decided to write to nine clients;
 * should that happen now, wait for a partner, or wait for the morning?
 *
 * The risk is not a bug the firm can quietly fix. A chaser that goes out at
 * 2am, or to a client who sent the documents yesterday, or for the fifth
 * time this month, is a letter the client has already read. So every rule
 * here is tested on the case where it is *not* obvious: trusted but too
 * large, outside hours but urgent, arrived but unchecked.
 */

/** 9 Nov 2026 is a Monday. */
const MORNING = new Date("2026-11-09T04:30:00Z"); // 10:00 IST
const NIGHT = new Date("2026-11-09T17:00:00Z"); // 22:30 IST
const EARLY = new Date("2026-11-09T01:00:00Z"); // 06:30 IST
const SUNDAY = new Date("2026-11-08T05:00:00Z"); // 10:30 IST, a Sunday

describe("when the firm writes to clients", () => {
  it("knows the fixture dates are what the names say", () => {
    expect(istHour(MORNING)).toBe(10);
    expect(istHour(NIGHT)).toBe(22);
    expect(istHour(EARLY)).toBe(6);
    expect(istWeekday(SUNDAY)).toBe(0);
    expect(istWeekday(MORNING)).toBe(1);
  });

  it("is office hours on a weekday", () => {
    expect(inQuietHours(MORNING)).toBe(false);
  });

  it("is not the evening, the small hours, or a Sunday", () => {
    expect(inQuietHours(NIGHT)).toBe(true);
    expect(inQuietHours(EARLY)).toBe(true);
    expect(inQuietHours(SUNDAY)).toBe(true);
  });

  it("holds an evening batch until the next morning at eight", () => {
    const until = quietUntil(NIGHT);
    expect(istHour(until)).toBe(8);
    // Monday night waits for Tuesday
    expect(istWeekday(until)).toBe(2);
  });

  it("holds an early batch until eight the same day", () => {
    const until = quietUntil(EARLY);
    expect(istHour(until)).toBe(8);
    expect(istWeekday(until)).toBe(1);
  });

  it("steps over a Sunday rather than landing on it", () => {
    const until = quietUntil(SUNDAY);
    expect(istWeekday(until)).toBe(1);
    expect(istHour(until)).toBe(8);
    // and a Saturday night does not come back on the Sunday either
    const saturdayNight = new Date("2026-11-07T17:00:00Z");
    expect(istWeekday(quietUntil(saturdayNight))).toBe(1);
  });
});

describe("whether a batch goes, waits for a partner, or waits for morning", () => {
  const batch = (over = {}) => ({
    rule: "documentsPending",
    recipients: 9,
    now: MORNING,
    ...over,
  });

  it("queues an untrusted rule", () => {
    const decision = decideBatch(batch());
    expect(decision.verdict).toBe("queue");
    expect(decision.why).toMatch(/not trusted yet/);
  });

  it("sends a trusted rule within the limits", () => {
    expect(decideBatch(batch({ trusted: true })).verdict).toBe("send");
  });

  it("queues a big send even when the rule is trusted", () => {
    const decision = decideBatch(
      batch({ trusted: true, recipients: ALWAYS_APPROVE_OVER + 1 }),
    );
    expect(decision.verdict).toBe("queue");
    expect(decision.why).toMatch(/whether the rule is trusted or not/);
  });

  it("sends a trusted rule at exactly the ceiling", () => {
    expect(
      decideBatch(batch({ trusted: true, recipients: ALWAYS_APPROVE_OVER }))
        .verdict,
    ).toBe("send");
  });

  it("defers rather than queues outside hours — nobody approves a wait", () => {
    const decision = decideBatch(batch({ trusted: true, now: NIGHT }));
    expect(decision.verdict).toBe("defer");
    expect(decision.until).toBeInstanceOf(Date);
  });

  it("defers an untrusted rule too: the hours come first", () => {
    expect(decideBatch(batch({ now: NIGHT })).verdict).toBe("defer");
  });

  it("lets a statutory notice through at night", () => {
    const decision = decideBatch(
      batch({ rule: "noticeDeadline", trusted: true, now: NIGHT }),
    );
    expect(decision.verdict).toBe("send");
  });

  it("stops everything when the firm has paused", () => {
    const decision = decideBatch(batch({ trusted: true, paused: true }));
    expect(decision.verdict).toBe("paused");
    // and the pause beats the quiet hours, so the log says the real reason
    expect(decideBatch(batch({ paused: true, now: NIGHT })).verdict).toBe(
      "paused",
    );
  });

  it("says nothing to do when there is nobody to write to", () => {
    expect(decideBatch(batch({ recipients: 0, paused: true })).verdict).toBe(
      "send",
    );
  });
});

describe("four automatic messages to one client a month", () => {
  const item = (clientId) => ({ clientId, dedupeKey: `k-${clientId}` });

  it("lets a client with none through", () => {
    const { keep, capped } = applyMonthlyCap([item("c1")], new Map());
    expect(keep).toHaveLength(1);
    expect(capped).toHaveLength(0);
  });

  it("stops the fifth", () => {
    const counts = new Map([["c1", MONTHLY_CAP]]);
    const { keep, capped } = applyMonthlyCap([item("c1")], counts);
    expect(keep).toHaveLength(0);
    expect(capped).toHaveLength(1);
  });

  it("counts what this batch itself is about to spend", () => {
    // three already this month, and the batch wants to send two more
    const counts = new Map([["c1", MONTHLY_CAP - 1]]);
    const { keep, capped } = applyMonthlyCap([item("c1"), item("c1")], counts);
    expect(keep).toHaveLength(1);
    expect(capped).toHaveLength(1);
  });

  it("counts per client, not per batch", () => {
    const counts = new Map([["c1", MONTHLY_CAP]]);
    const { keep, capped } = applyMonthlyCap(
      [item("c1"), item("c2"), item("c3")],
      counts,
    );
    expect(keep.map((row) => row.clientId)).toEqual(["c2", "c3"]);
    expect(capped.map((row) => row.clientId)).toEqual(["c1"]);
  });

  it("does not cap a message with no client against it", () => {
    const { keep } = applyMonthlyCap([{ dedupeKey: "k" }], new Map());
    expect(keep).toHaveLength(1);
  });

  it("counts a calendar month in IST", () => {
    // 1 Nov 2026 00:30 IST is still 31 Oct in UTC
    expect(capMonth(new Date("2026-10-31T19:00:00Z"))).toBe("2026-11");
    expect(capMonth(new Date("2026-10-31T18:00:00Z"))).toBe("2026-10");
  });
});

describe("a batch that waited, and whether it is still wanted", () => {
  const chase = {
    rule: "documentsPending",
    about: { entityType: "DocRequest", entityId: "r1" },
  };

  const checklist = (...statuses) => ({
    checklist: statuses.map((status, i) => ({
      _id: `i${i}`,
      side: "client",
      mandatory: true,
      status,
    })),
  });

  it("cancels itself when the documents arrived and were accepted", () => {
    const verdict = stillWanted(chase, checklist("Accepted", "Accepted"));
    expect(verdict.state).toBe("cancel");
    expect(verdict.why).toMatch(/arrived and were accepted/);
  });

  it("counts an item the firm decided it did not need as settled", () => {
    expect(
      stillWanted(chase, checklist("Accepted", "Not required")).state,
    ).toBe("cancel");
  });

  it("holds rather than cancels when something arrived unchecked", () => {
    const verdict = stillWanted(chase, checklist("Received"));
    expect(verdict.state).toBe("hold");
    // the distinction the gap report is explicit about: if it turns out to
    // be the wrong month, the chase is still owed
    expect(verdict.why).toMatch(/wrong month the chase is still owed/);
  });

  it("holds on a format check too — a check is not acceptance", () => {
    expect(stillWanted(chase, checklist("Format checked")).state).toBe("hold");
  });

  it("still sends when something is outstanding and nothing has arrived", () => {
    expect(stillWanted(chase, checklist("Requested", "Received")).state).toBe(
      "send",
    );
  });

  it("cancels when the thing it was about is gone", () => {
    expect(stillWanted(chase, null).state).toBe("cancel");
  });

  it("cancels an invoice reminder once the invoice is paid", () => {
    const reminder = {
      rule: "invoiceReminder",
      about: { entityType: "Invoice", entityId: "i1" },
    };
    expect(
      stillWanted(reminder, {
        status: "Sent",
        totalPaise: 1_18_000_00,
        paidPaise: 1_18_000_00,
      }).state,
    ).toBe("cancel");

    // TDS counts as settled too, the same way the ledger counts it
    expect(
      stillWanted(reminder, {
        status: "Sent",
        totalPaise: 1_18_000_00,
        paidPaise: 1_08_000_00,
        tdsCreditedPaise: 10_000_00,
      }).state,
    ).toBe("cancel");

    expect(
      stillWanted(reminder, {
        status: "Sent",
        totalPaise: 1_18_000_00,
        paidPaise: 0,
      }).state,
    ).toBe("send");
  });
});
