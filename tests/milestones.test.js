import { describe, it, expect } from "vitest";
import {
  buildMilestones,
  milestoneState,
  latenessDays,
  wasOnTime,
  filingProgress,
  proofPending,
  nextOpenMilestone,
  syncDerived,
  applyDueDates,
  canRecordFiling,
  recordFiling,
  correctFiling,
  backfillMilestones,
  OPEN,
  FILED,
  OVERDUE,
  UNDATED,
} from "../lib/engagements/milestones.js";
import {
  milestonesFor,
  governingDate,
  statutoryDueFor,
} from "../lib/compliance/dueDate.js";
import { STARTER_DUE_RULES } from "../lib/compliance/starterRules.js";

/**
 * Filing milestones (P3-1).
 *
 * The sharp edge is lateness. A filing is late against the date that was in
 * force on the day it went in, not against the date as it stands today —
 * otherwise an extension announced in December silently turns a late
 * November filing punctual, and the punctuality report becomes a record of
 * the firm's luck with notifications rather than of its own promptness.
 *
 * The second edge is the three derived fields. They are a view of the array,
 * and a view that drifts is worse than no view at all, because forty files
 * read it.
 */

const ACTOR = { id: "u1", name: "Ritika Chandra" };
const d = (s) => new Date(`${s}T00:00:00+05:30`);

/** A verified GST rule, which is the only kind that produces dates. */
const gstRule = {
  ...STARTER_DUE_RULES.find((r) => r.serviceCode === "GSTR3B"),
  verifiedAt: new Date("2026-10-01"),
};
const rocRule = {
  ...STARTER_DUE_RULES.find((r) => r.serviceCode === "ROC-ANN"),
  verifiedAt: new Date("2026-10-01"),
};

/** An engagement with GST's two filings for October, nothing filed. */
function gstEngagement() {
  const milestones = buildMilestones(gstRule, "2026-10").map((m, i) => ({
    ...m,
    _id: `m${i + 1}`,
  }));
  return syncDerived({
    status: "In progress",
    billingStatus: "Unbilled",
    version: 1,
    milestones,
    statutoryDue: null,
    filedOn: null,
    ackNo: "",
  });
}

describe("the rule produces one date per filing", () => {
  it("gives monthly GST two, in date order", () => {
    const { milestones } = milestonesFor(gstRule, "2026-10");
    expect(milestones.map((m) => m.key)).toEqual(["GSTR1", "GSTR3B"]);
    expect(milestones[0].date).toEqual(d("2026-11-11"));
    expect(milestones[1].date).toEqual(d("2026-11-20"));
  });

  it("gives a rule with no milestones exactly one, as before", () => {
    const rule = {
      serviceCode: "GSTR9",
      name: "GST annual return",
      formula: { kind: "dayOfMonth", day: 31, monthsAfter: 9 },
      verifiedAt: new Date(),
    };
    const { milestones } = milestonesFor(rule, "FY2025-26");
    expect(milestones).toHaveLength(1);
    expect(milestones[0].key).toBe("GSTR9");
  });

  it("gives nothing at all from a rule the firm has not confirmed", () => {
    const { milestones, basis } = milestonesFor(
      { ...gstRule, verifiedAt: null },
      "2026-10",
    );
    expect(milestones).toEqual([]);
    expect(basis).toBe("unverified");
  });

  it("leaves both ROC forms undated until the AGM date is entered", () => {
    const { milestones } = milestonesFor(rocRule, "FY2025-26");
    expect(milestones).toHaveLength(2);
    expect(milestones.every((m) => m.date === null)).toBe(true);
  });

  it("dates both ROC forms from one AGM, thirty days apart", () => {
    const { milestones } = milestonesFor(rocRule, "FY2025-26", {
      eventDate: d("2026-09-26"),
    });
    const byKey = Object.fromEntries(milestones.map((m) => [m.key, m.date]));
    const gap = (byKey.MGT7.getTime() - byKey.AOC4.getTime()) / 86_400_000;
    expect(gap).toBe(30);
  });
});

describe("the governing date", () => {
  it("is the earliest filing still open, not the last of the pair", () => {
    // the whole point: before P3-1 a GST engagement was due on the 20th and
    // the 11th was invisible
    const { date } = statutoryDueFor(gstRule, "2026-10");
    expect(date).toEqual(d("2026-11-11"));
  });

  it("moves to GSTR-3B once GSTR-1 is in", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "AA0911260001",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    expect(e.statutoryDue).toEqual(d("2026-11-20"));
  });

  it("is the last date once everything is filed", () => {
    const list = [
      { date: d("2026-11-11"), filedOn: d("2026-11-10") },
      { date: d("2026-11-20"), filedOn: d("2026-11-19") },
    ];
    expect(governingDate(list)).toEqual(d("2026-11-20"));
  });

  it("is null when no filing has a date", () => {
    expect(governingDate([{ date: null, filedOn: null }])).toBeNull();
    expect(governingDate([])).toBeNull();
  });
});

describe("lateness is judged against the date in force at filing", () => {
  it("counts nothing when filed on the due date itself", () => {
    expect(
      latenessDays({
        filedOn: d("2026-11-20"),
        dueDateAtFiling: d("2026-11-20"),
      }),
    ).toBe(0);
  });

  it("counts whole days late", () => {
    expect(
      latenessDays({
        filedOn: d("2026-11-29"),
        dueDateAtFiling: d("2026-11-20"),
      }),
    ).toBe(9);
  });

  it("ignores a later extension, so a late filing stays late", () => {
    const m = {
      filedOn: d("2026-11-29"),
      dueDateAtFiling: d("2026-11-20"),
      // the government moved it afterwards; the live date is now later
      dueDate: d("2026-12-31"),
    };
    expect(latenessDays(m)).toBe(9);
  });

  it("ignores a withdrawn extension, so a punctual filing stays punctual", () => {
    const m = {
      filedOn: d("2026-11-25"),
      dueDateAtFiling: d("2026-11-30"),
      dueDate: d("2026-11-20"),
    };
    expect(latenessDays(m)).toBe(0);
  });

  it("falls back to the live date for a row filed before P3-1 existed", () => {
    expect(
      latenessDays({ filedOn: d("2026-11-25"), dueDate: d("2026-11-20") }),
    ).toBe(5);
  });

  it("counts nothing for a filing that has not happened", () => {
    expect(latenessDays({ filedOn: null, dueDate: d("2026-11-20") })).toBe(0);
  });
});

describe("on time is three-valued, so nothing is claimed by omission", () => {
  it("is null when nothing has been filed", () => {
    expect(wasOnTime(gstEngagement())).toBeNull();
  });

  it("is null when a filing has no date to judge against", () => {
    const e = { milestones: [{ filedOn: d("2026-11-10"), dueDate: null }] };
    expect(wasOnTime(e)).toBeNull();
  });

  it("is false when one of two went in late", () => {
    const e = {
      milestones: [
        { filedOn: d("2026-11-10"), dueDateAtFiling: d("2026-11-11") },
        { filedOn: d("2026-11-29"), dueDateAtFiling: d("2026-11-20") },
      ],
    };
    // the case the old shape could not record: one on time, one nine days late
    expect(wasOnTime(e)).toBe(false);
  });

  it("is true only when every judged filing was punctual", () => {
    const e = {
      milestones: [
        { filedOn: d("2026-11-10"), dueDateAtFiling: d("2026-11-11") },
        { filedOn: d("2026-11-19"), dueDateAtFiling: d("2026-11-20") },
      ],
    };
    expect(wasOnTime(e)).toBe(true);
  });
});

describe("the filings finish independently", () => {
  it("records one and leaves the other open", () => {
    const e = gstEngagement();
    const out = recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "AA0911260001",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });

    expect(out.ok).toBe(true);
    expect(out.complete).toBe(false);
    expect(filingProgress(e)).toBe("part");
    expect(milestoneState(e.milestones[0], d("2026-11-12"))).toBe(FILED);
    expect(milestoneState(e.milestones[1], d("2026-11-12"))).toBe(OPEN);
  });

  it("reports complete only when the last one goes in", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    const out = recordFiling({
      engagement: e,
      milestoneId: "m2",
      ackNo: "A2",
      filedOn: d("2026-11-19"),
      actor: ACTOR,
      now: d("2026-11-19"),
    });
    expect(out.complete).toBe(true);
    expect(filingProgress(e)).toBe("all");
  });

  it("freezes the due date at the moment of filing", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m2",
      ackNo: "A2",
      filedOn: d("2026-11-19"),
      actor: ACTOR,
      now: d("2026-11-19"),
    });
    expect(e.milestones[1].dueDateAtFiling).toEqual(d("2026-11-20"));
  });

  it("knows which filing is next", () => {
    const e = gstEngagement();
    expect(nextOpenMilestone(e).name).toBe("GSTR-1");
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    expect(nextOpenMilestone(e).name).toBe("GSTR-3B");
  });
});

describe("a filing has to be evidenced", () => {
  it("refuses an empty acknowledgement number", () => {
    const e = gstEngagement();
    const out = recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "   ",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/acknowledgement/i);
  });

  it("refuses a date in the future", () => {
    const e = gstEngagement();
    const out = recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-12-01"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/future/i);
  });

  it("refuses to overwrite a filing, and says to correct it instead", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    const again = recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A2",
      filedOn: d("2026-11-11"),
      actor: ACTOR,
      now: d("2026-11-11"),
    });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/correct that record/i);
  });

  it("refuses on a completed engagement", () => {
    const e = { ...gstEngagement(), status: "Completed" };
    expect(canRecordFiling(e).ok).toBe(false);
  });

  it("refuses when the rule was never confirmed, and says why", () => {
    const e = { status: "In progress", milestones: [] };
    const out = canRecordFiling(e);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/due-date rule/i);
  });
});

describe("a correction keeps what it replaced", () => {
  function filed() {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "WRONG-1",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    return e;
  }

  it("moves the old record to history and reopens the filing", () => {
    const e = filed();
    const out = correctFiling({
      engagement: e,
      milestoneId: "m1",
      reason: "ARN belonged to September, not October",
      actor: ACTOR,
    });

    expect(out.ok).toBe(true);
    expect(e.milestones[0].filedOn).toBeNull();
    expect(e.milestones[0].ackNo).toBe("");
    expect(e.milestones[0].history).toHaveLength(1);
    expect(e.milestones[0].history[0].ackNo).toBe("WRONG-1");
    expect(e.milestones[0].history[0].reason).toMatch(/September/);
  });

  it("demands a reason", () => {
    const out = correctFiling({
      engagement: filed(),
      milestoneId: "m1",
      reason: "oops",
      actor: ACTOR,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/why/i);
  });

  it("refuses once the work is invoiced, and points at a credit note", () => {
    const e = filed();
    e.billingStatus = "Billed";
    const out = correctFiling({
      engagement: e,
      milestoneId: "m1",
      reason: "wrong acknowledgement number entirely",
      actor: ACTOR,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/credit note/i);
  });

  it("refuses a filing that was never recorded", () => {
    const out = correctFiling({
      engagement: gstEngagement(),
      milestoneId: "m1",
      reason: "a perfectly good reason",
      actor: ACTOR,
    });
    expect(out.ok).toBe(false);
  });
});

describe("the three derived fields stay a true view of the array", () => {
  it("leaves filedOn null while only part is filed", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    // half a month's GST is not a filed month
    expect(e.filedOn).toBeNull();
  });

  it("sets filedOn to the last filing once all are in", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    recordFiling({
      engagement: e,
      milestoneId: "m2",
      ackNo: "A2",
      filedOn: d("2026-11-19"),
      actor: ACTOR,
      now: d("2026-11-19"),
    });
    expect(e.filedOn).toEqual(d("2026-11-19"));
  });

  it("goes back to null when the last filing is corrected away", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    recordFiling({
      engagement: e,
      milestoneId: "m2",
      ackNo: "A2",
      filedOn: d("2026-11-19"),
      actor: ACTOR,
      now: d("2026-11-19"),
    });
    correctFiling({
      engagement: e,
      milestoneId: "m2",
      reason: "acknowledgement was for a different client",
      actor: ACTOR,
    });
    expect(e.filedOn).toBeNull();
    expect(e.statutoryDue).toEqual(d("2026-11-20"));
  });
});

describe("an extension moves one filing, not its sibling", () => {
  it("moves GSTR-3B and leaves GSTR-1 where it was", () => {
    const e = gstEngagement();
    applyDueDates(e, [{ key: "GSTR3B", date: d("2026-12-31") }]);
    expect(e.milestones[0].dueDate).toEqual(d("2026-11-11"));
    expect(e.milestones[1].dueDate).toEqual(d("2026-12-31"));
  });

  it("does not disturb a filing already recorded", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-11-29"),
      actor: ACTOR,
      now: d("2026-11-29"),
    });
    expect(latenessDays(e.milestones[0])).toBe(18);

    applyDueDates(e, [{ key: "GSTR1", date: d("2026-12-31") }]);
    // the live date moved; what it was judged against did not
    expect(e.milestones[0].dueDate).toEqual(d("2026-12-31"));
    expect(latenessDays(e.milestones[0])).toBe(18);
  });

  it("honours an override naming one filing", () => {
    const rule = {
      ...gstRule,
      overrides: [
        {
          period: "2026-10",
          milestone: "GSTR3B",
          dueDate: d("2026-12-31"),
          reason: "Notification 00/2026",
        },
      ],
    };
    const { milestones } = milestonesFor(rule, "2026-10");
    const byKey = Object.fromEntries(milestones.map((m) => [m.key, m]));
    expect(byKey.GSTR1.date).toEqual(d("2026-11-11"));
    expect(byKey.GSTR3B.date).toEqual(d("2026-12-31"));
    expect(byKey.GSTR3B.basis).toBe("override");
  });

  it("treats an override naming nothing as moving the whole rule, as before", () => {
    const rule = {
      ...gstRule,
      overrides: [
        { period: "2026-10", dueDate: d("2026-12-15"), reason: "blanket" },
      ],
    };
    const { milestones } = milestonesFor(rule, "2026-10");
    expect(
      milestones.every((m) => m.date.getTime() === d("2026-12-15").getTime()),
    ).toBe(true);
  });
});

describe("proof of filing", () => {
  it("is pending when a filing has no acknowledgement attached", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-11-10"),
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    expect(proofPending(e)).toBe(true);
  });

  it("is not pending once the document is linked", () => {
    const e = gstEngagement();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "A1",
      filedOn: d("2026-11-10"),
      proofDocumentId: "doc1",
      actor: ACTOR,
      now: d("2026-11-10"),
    });
    expect(proofPending(e)).toBe(false);
  });
});

describe("work created before P3-1", () => {
  it("keeps its filing when backfilled into one milestone", () => {
    const old = {
      templateSnapshot: { code: "GSTR3B", name: "GSTR-1 / GSTR-3B filing" },
      statutoryDue: d("2026-11-20"),
      filedOn: d("2026-11-29"),
      ackNo: "AA0911260099",
      milestones: [],
    };
    backfillMilestones(old);

    expect(old.milestones).toHaveLength(1);
    expect(old.milestones[0].ackNo).toBe("AA0911260099");
    expect(old.schemaVersion).toBe(2);
    // the only honest guess available: the date in force then was never kept
    expect(latenessDays(old.milestones[0])).toBe(9);
  });

  it("is left alone the second time", () => {
    const e = gstEngagement();
    const before = e.milestones.length;
    backfillMilestones(e);
    expect(e.milestones).toHaveLength(before);
  });

  it("gets an undated milestone when it never had a due date", () => {
    const old = {
      templateSnapshot: { code: "BOOKS", name: "Bookkeeping" },
      statutoryDue: null,
      filedOn: null,
      ackNo: "",
      milestones: [],
    };
    backfillMilestones(old);
    expect(milestoneState(old.milestones[0])).toBe(UNDATED);
  });
});

describe("overdue is per filing", () => {
  it("calls GSTR-1 overdue on the 12th while GSTR-3B is merely open", () => {
    const e = gstEngagement();
    const now = d("2026-11-12");
    expect(milestoneState(e.milestones[0], now)).toBe(OVERDUE);
    expect(milestoneState(e.milestones[1], now)).toBe(OPEN);
  });
});
