import { describe, it, expect } from "vitest";
import {
  lawClocks,
  adjournments,
  timeline,
  nextDue,
  isOverdue,
  checkPlainWords,
} from "../lib/practice/notices.js";
import {
  NOTICE_KINDS,
  allLawRules,
  shiftDate,
  SUBMISSION_TYPES,
} from "../lib/practice/noticeLaw.js";

/**
 * Notices as matters (P3-11).
 *
 * The property that matters most is **CLAUDE.md rule 8**: nothing here turns
 * a statutory rule into a date until a partner has confirmed that rule. An
 * unchecked limitation date is worse than no date at all, because a date
 * gets diarised and then relied on, and a limitation date that is a week
 * wrong loses a client their appeal.
 *
 * So most of this file is about what the system refuses to say.
 */

const d = (s) => new Date(`${s}T00:00:00+05:30`);

const notice = (over = {}) => ({
  law: "GST",
  kind: "SCN74",
  section: "s.74 · SCN (DRC-01)",
  authority: "Range-4, Division-II, Noida",
  noticeDate: d("2026-07-28"),
  servedOn: d("2026-07-29"),
  annualReturnDue: d("2022-02-28"),
  orderDate: null,
  submissions: [],
  hearings: [],
  ...over,
});

const confirm = (kind, ...keys) =>
  keys.map((key) => ({ kind, key, confirmedAt: new Date() }));

describe("no date until a partner has confirmed the rule", () => {
  it("shows the rule and the section, and no date", () => {
    const clocks = lawClocks(notice(), []);
    const order = clocks.find((clock) => clock.key === "order");

    expect(order.text).toMatch(/within 5 years/);
    expect(order.cite).toBe("s.74(10) CGST Act");
    expect(order.date).toBe(null);
    expect(order.confirmed).toBe(false);
    expect(order.why).toMatch(/has not confirmed this rule/);
  });

  it("works the date out once it is confirmed", () => {
    const clocks = lawClocks(notice(), confirm("SCN74", "order"));
    const order = clocks.find((clock) => clock.key === "order");

    expect(order.confirmed).toBe(true);
    // five years from the annual return's due date
    expect(order.date).toEqual(d("2027-02-28"));
  });

  it("counts backwards where the rule does", () => {
    const clocks = lawClocks(notice(), confirm("SCN74", "scn"));
    const scn = clocks.find((clock) => clock.key === "scn");
    // five years on, then six months back
    expect(scn.date).toEqual(d("2026-08-28"));
  });

  it("will not take a confirmation meant for another kind of notice", () => {
    const clocks = lawClocks(notice(), confirm("SCN73", "order"));
    expect(clocks.find((clock) => clock.key === "order").confirmed).toBe(false);
  });

  it("will not take an unconfirmed row that merely exists", () => {
    const clocks = lawClocks(notice(), [
      { kind: "SCN74", key: "order", confirmedAt: null },
    ]);
    expect(clocks.find((clock) => clock.key === "order").date).toBe(null);
  });

  it("says which of the three nothings it is", () => {
    // not a clock at all
    const predeposit = lawClocks(notice(), confirm("SCN74", "predeposit")).find(
      (clock) => clock.key === "predeposit",
    );
    expect(predeposit.why).toBe("A rule to act on, not a date to count.");

    // confirmed, but the date it counts from has not happened
    const appeal = lawClocks(notice(), confirm("SCN74", "appeal")).find(
      (clock) => clock.key === "appeal",
    );
    expect(appeal.date).toBe(null);
    expect(appeal.why).toMatch(/Needs the date of the order/);

    // and once the order exists
    const withOrder = lawClocks(
      notice({ orderDate: d("2026-12-15") }),
      confirm("SCN74", "appeal"),
    ).find((clock) => clock.key === "appeal");
    expect(withOrder.date).toEqual(d("2027-03-15"));
  });

  it("knows nothing about a notice kind that is not in the table", () => {
    expect(lawClocks(notice({ kind: "MADE-UP" }), [])).toEqual([]);
  });
});

describe("the table itself", () => {
  it("cites a section on every single rule", () => {
    for (const rule of allLawRules()) {
      expect(rule.cite, `${rule.kind}/${rule.key}`).toBeTruthy();
      expect(rule.text.length, `${rule.kind}/${rule.key}`).toBeGreaterThan(20);
    }
  });

  it("says plainly where a partner has to settle something", () => {
    const toSettle = allLawRules().filter((rule) =>
      /partner|confirm|settle/i.test(rule.cite),
    );
    // the 2025 Act mapping, s.153, s.253(3) and the stay percentage
    expect(toSettle.length).toBeGreaterThanOrEqual(4);
  });

  it("covers the six kinds the prototype names, and nothing invented", () => {
    expect(Object.keys(NOTICE_KINDS)).toEqual([
      "SCN74",
      "SCN73",
      "ASMT10",
      "IT148A",
      "IT142",
      "CITA",
    ]);
  });

  it("offers the six submission types", () => {
    expect(SUBMISSION_TYPES).toContain("Adjournment request");
    expect(SUBMISSION_TYPES).toHaveLength(6);
  });
});

describe("date arithmetic that does not drift", () => {
  it("clamps to the end of a short month rather than rolling over", () => {
    // 31 January plus one month is the end of February, not 3 March
    expect(shiftDate(d("2026-01-31"), { months: 1 })).toEqual(d("2026-02-28"));
    expect(shiftDate(d("2024-01-31"), { months: 1 })).toEqual(d("2024-02-29"));
  });

  it("adds years, months and days together", () => {
    expect(shiftDate(d("2022-02-28"), { years: 5, months: -6 })).toEqual(
      d("2026-08-28"),
    );
    expect(shiftDate(d("2026-11-09"), { days: 30 })).toEqual(d("2026-12-09"));
  });
});

describe("adjournments are counted, and the limit is law", () => {
  const heard = (adjourned) => ({
    on: d("2026-09-01"),
    heldOn: d("2026-09-01"),
    adjourned,
  });

  it("counts them even when nobody has confirmed the limit", () => {
    const e = notice({ hearings: [heard(true), heard(true), heard(false)] });
    const result = adjournments(e, lawClocks(e, []));

    expect(result.used).toBe(2);
    // the count is arithmetic and safe; the cap is law and is not
    expect(result.cap).toBe(null);
    expect(result.left).toBe(null);
    expect(result.warning).toMatch(/has not been confirmed by a partner/);
    expect(result.warning).toMatch(/s\.75\(5\) CGST Act/);
  });

  it("says how many are left once the limit is confirmed", () => {
    const e = notice({ hearings: [heard(true), heard(true)] });
    const result = adjournments(
      e,
      lawClocks(e, confirm("SCN74", "adjournments")),
    );

    expect(result.cap).toBe(3);
    expect(result.left).toBe(1);
    expect(result.warning).toMatch(/One adjournment left/);
  });

  it("says plainly when there are none left", () => {
    const e = notice({ hearings: [heard(true), heard(true), heard(true)] });
    const result = adjournments(
      e,
      lawClocks(e, confirm("SCN74", "adjournments")),
    );

    expect(result.left).toBe(0);
    expect(result.warning).toMatch(/All 3 adjournments have been used/);
  });

  it("is quiet when none have been used", () => {
    const e = notice({ hearings: [heard(false)] });
    const result = adjournments(
      e,
      lawClocks(e, confirm("SCN74", "adjournments")),
    );
    expect(result.used).toBe(0);
    expect(result.warning).toBe("");
  });
});

describe("what the firm owes next", () => {
  it("is the earliest thing the department put a date on", () => {
    const e = notice({
      submissions: [
        { type: "Reply", dueDate: d("2026-10-27"), filedOn: null },
        {
          type: "Written submissions",
          dueDate: d("2026-11-15"),
          filedOn: null,
        },
      ],
      hearings: [{ on: d("2026-11-02"), heldOn: null }],
    });
    const next = nextDue(e, d("2026-10-20"));
    expect(next.what).toBe("Reply");
    expect(next.days).toBe(7);
  });

  it("skips what is already filed, and picks the hearing when that is next", () => {
    const e = notice({
      submissions: [
        { type: "Reply", dueDate: d("2026-10-27"), filedOn: d("2026-10-25") },
      ],
      hearings: [{ on: d("2026-11-02"), heldOn: null }],
    });
    expect(nextDue(e, d("2026-10-26")).what).toBe("Hearing");
  });

  it("is null when nothing is listed", () => {
    expect(nextDue(notice())).toBe(null);
  });

  /**
   * The one thing `nextDue` must never do: a limitation date is the firm's
   * last chance, not a thing it owes this week, and putting "appeal by
   * March" at the top of a Monday list is how the reply due on Tuesday gets
   * missed.
   */
  it("never offers a limitation date as the next thing", () => {
    const e = notice({
      orderDate: d("2026-12-15"),
      submissions: [{ type: "Appeal", dueDate: null, filedOn: null }],
    });
    expect(nextDue(e, d("2026-12-20"))).toBe(null);
  });

  it("knows when something owed has gone past", () => {
    const e = notice({
      submissions: [{ type: "Reply", dueDate: d("2026-10-27"), filedOn: null }],
    });
    expect(isOverdue(e, d("2026-10-28"))).toBe(true);
    expect(isOverdue(e, d("2026-10-27"))).toBe(false);
    e.submissions[0].filedOn = d("2026-10-26");
    expect(isOverdue(e, d("2026-10-28"))).toBe(false);
  });
});

describe("one timeline out of three lists", () => {
  it("merges and orders the notice, the submissions and the hearings", () => {
    const e = notice({
      submissions: [
        {
          type: "Reply",
          dueDate: d("2026-08-28"),
          filedOn: d("2026-08-26"),
          ackNo: "AD0908260012345",
        },
      ],
      hearings: [
        {
          on: d("2026-09-10"),
          heldOn: d("2026-09-10"),
          adjourned: true,
          adjournmentReason: "counsel unavailable",
        },
      ],
      orderDate: d("2026-10-01"),
    });

    const rows = timeline(e);
    expect(rows.map((row) => row.what)).toEqual([
      "Notice dated",
      "Served",
      "Reply filed",
      "Hearing adjourned",
      "Order",
    ]);
    // the acknowledgement travels with the filing
    expect(rows[2].detail).toMatch(/AD0908260012345/);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].at.getTime()).toBeGreaterThanOrEqual(
        rows[i - 1].at.getTime(),
      );
    }
  });

  it("shows a date still owed as owed, not as done", () => {
    const e = notice({
      submissions: [{ type: "Reply", dueDate: d("2026-08-28"), filedOn: null }],
    });
    const due = timeline(e).find((row) => row.kind === "due");
    expect(due.what).toBe("Reply due");
  });

  it("marks a hearing nobody has reported back on as listed", () => {
    const e = notice({ hearings: [{ on: d("2026-12-01"), heldOn: null }] });
    expect(timeline(e).at(-1).what).toBe("Hearing listed");
  });
});

describe("the paragraph for the client", () => {
  const good =
    "The department thinks ₹48.6 lakh of cash deposited in 2018-19 was not explained. We reply by 27 October with your cash book and sales records. No payment is due now.";

  it("takes the prototype's own example", () => {
    expect(checkPlainWords(good).ok).toBe(true);
  });

  it("refuses something too short to be any use", () => {
    expect(checkPlainWords("We are dealing with it.").ok).toBe(false);
    expect(checkPlainWords("").error).toMatch(/Say what they think/);
  });

  it("refuses section numbers, which is the whole point of it", () => {
    for (const jargon of [
      "A notice under s.148A has been received and we will reply in time with the records needed.",
      "This is a notice u/s 142(1) and we are replying with the documents the officer has asked for.",
      "We will file DRC-06 against the DRC-01 within the time allowed and nothing is payable right now.",
      "Reply in ASMT-11 goes in this week with the reconciliation, and no money is due from you now.",
    ]) {
      const result = checkPlainWords(jargon);
      expect(result.ok, jargon.slice(0, 30)).toBe(false);
      expect(result.error).toMatch(/leave the section numbers out/);
    }
  });
});
