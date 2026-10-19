import { describe, it, expect } from "vitest";
import {
  periodFor,
  parsePeriod,
  periodOptions,
} from "../lib/engagements/period.js";
import {
  checkStatusChange,
  nextStatuses,
  canEditWork,
  isRework,
  STATUSES,
} from "../lib/engagements/status.js";
import { checkAssignment, stepFloor } from "../lib/engagements/assign.js";
import {
  canExecute,
  tierOf,
  tierLabel,
  LEVEL_OF,
  TIERS,
  TIER_RULES,
} from "../lib/services/catalog.js";
import { buildEngagement } from "../lib/engagements/create.js";
import { addWorkingDays, daysUntil, formatISTDate } from "../lib/dates.js";

/** 16 October 2026 is a Friday. */
const FRIDAY = new Date(Date.UTC(2026, 9, 16, 6, 0));

describe("working days", () => {
  it("steps over the weekend", () => {
    expect(formatISTDate(addWorkingDays(FRIDAY, 1))).toBe("19-10-2026");
    expect(formatISTDate(addWorkingDays(FRIDAY, 5))).toBe("23-10-2026");
  });

  it("returns the same day for zero days", () => {
    expect(formatISTDate(addWorkingDays(FRIDAY, 0))).toBe("16-10-2026");
  });

  it("counts whole Indian days to a due date", () => {
    expect(daysUntil(addWorkingDays(FRIDAY, 5), FRIDAY)).toBe(7);
    expect(daysUntil(new Date(Date.UTC(2026, 9, 14, 6)), FRIDAY)).toBe(-2);
  });
});

describe("periods", () => {
  it("uses the Indian financial year for quarters and halves", () => {
    expect(periodFor("quarterly", FRIDAY).code).toBe("2026-Q3");
    expect(periodFor("half-yearly", FRIDAY).code).toBe("2026-H2");
    expect(periodFor("annual", FRIDAY).code).toBe("FY2026-27");
  });

  it("puts January in Q4 of the year that started in April", () => {
    const jan = new Date(Date.UTC(2027, 0, 10, 6));
    const q = periodFor("quarterly", jan);
    expect(q.code).toBe("2026-Q4");
    expect(q.label).toContain("Jan–Mar 2027");
  });

  it("files one-time work under the financial year it starts in", () => {
    expect(periodFor("one-time", FRIDAY).code).toBe("FY2026-27");
  });

  it("round-trips every period code", () => {
    for (const r of [
      "monthly",
      "quarterly",
      "half-yearly",
      "annual",
      "one-time",
    ]) {
      const p = periodFor(r, FRIDAY);
      const back = parsePeriod(p.code);
      expect(back.code).toBe(p.code);
      expect(+back.start).toBe(+p.start);
      expect(+back.end).toBe(+p.end);
    }
  });

  it("refuses something that is not a period code", () => {
    expect(() => parsePeriod("2026-13")).toThrow();
    expect(() => parsePeriod("octoberish")).toThrow();
  });

  it("offers consecutive months without skipping February", () => {
    const feb = new Date(Date.UTC(2027, 1, 15, 6));
    expect(periodOptions("monthly", feb).map((p) => p.code)).toEqual([
      "2027-03",
      "2027-02",
      "2027-01",
      "2026-12",
      "2026-11",
      "2026-10",
    ]);
  });

  it("covers the whole month, start inclusive and end exclusive", () => {
    const oct = periodFor("monthly", FRIDAY);
    expect(formatISTDate(oct.start)).toBe("01-10-2026");
    expect(formatISTDate(oct.end)).toBe("01-11-2026");
  });
});

const maker = { id: "maker", role: "employee" };
const checker = { id: "checker", role: "ca" };
const partner = { id: "boss", role: "partner" };
const intern = { id: "intern", role: "intern" };

const work = (status, extra = {}) => ({
  status,
  assigneeId: "maker",
  reviewerId: "checker",
  ...extra,
});

describe("the status pipeline", () => {
  it("knows the eight statuses from the spec, with Billed kept separate", () => {
    expect(STATUSES).toHaveLength(8);
    expect(STATUSES).not.toContain("Billed");
  });

  it("walks the normal route", () => {
    expect(checkStatusChange(maker, work("Scheduled"), "In progress").ok).toBe(
      true,
    );
    expect(
      checkStatusChange(maker, work("In progress"), "Under review").ok,
    ).toBe(true);
    expect(
      checkStatusChange(checker, work("Under review"), "Filed / delivered").ok,
    ).toBe(true);
    expect(
      checkStatusChange(checker, work("Filed / delivered"), "Completed").ok,
    ).toBe(true);
  });

  it("refuses a jump that skips the review gate", () => {
    const result = checkStatusChange(checker, work("In progress"), "Completed");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("cannot go straight to");
  });

  it("never lets the maker sign off their own work", () => {
    const result = checkStatusChange(
      { id: "maker", role: "ca" },
      work("Under review", { assigneeId: "maker" }),
      "Completed",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("cannot sign it off");
  });

  it("never lets an employee or intern complete anything", () => {
    for (const actor of [maker, intern]) {
      const result = checkStatusChange(
        actor,
        work("Under review", { assigneeId: "someone-else" }),
        "Completed",
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain("CA or a Partner");
    }
  });

  it("lets a partner complete work they are not the named reviewer of", () => {
    expect(
      checkStatusChange(partner, work("Under review"), "Completed").ok,
    ).toBe(true);
  });

  it("stops another CA stepping in front of the named reviewer", () => {
    const other = { id: "other-ca", role: "ca" };
    const result = checkStatusChange(other, work("Under review"), "Completed");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("named reviewer");
  });

  it("demands a reason for on hold, cancelled and rework", () => {
    expect(checkStatusChange(checker, work("In progress"), "On hold").ok).toBe(
      false,
    );
    expect(
      checkStatusChange(checker, work("In progress"), "On hold", {
        reason: "client unresponsive",
      }).ok,
    ).toBe(true);

    expect(checkStatusChange(checker, work("Scheduled"), "Cancelled").ok).toBe(
      false,
    );

    const back = checkStatusChange(
      checker,
      work("Under review"),
      "In progress",
    );
    expect(back.ok).toBe(false);
    expect(back.error).toContain("needs redoing");
  });

  it("lets only a CA or Partner put work on hold or cancel it", () => {
    const result = checkStatusChange(maker, work("In progress"), "On hold", {
      reason: "fees overdue",
    });
    expect(result.ok).toBe(false);
  });

  it("locks a completed engagement and a cancelled one", () => {
    const done = checkStatusChange(partner, work("Completed"), "In progress");
    expect(done.ok).toBe(false);
    expect(done.error).toContain("locked");

    const dead = checkStatusChange(partner, work("Cancelled"), "Scheduled");
    expect(dead.ok).toBe(false);
    expect(dead.error).toContain("cannot be restarted");
  });

  it("counts a return from review or filing as rework", () => {
    expect(isRework("Under review", "In progress")).toBe(true);
    expect(isRework("Filed / delivered", "In progress")).toBe(true);
    expect(isRework("Scheduled", "In progress")).toBe(false);
  });

  it("offers only the moves that would be accepted", () => {
    const offered = nextStatuses(maker, work("In progress"));
    expect(offered).toContain("Under review");
    expect(offered).toContain("Awaiting documents");
    // an employee cannot hold or cancel, so neither is offered
    expect(offered).not.toContain("On hold");
    expect(offered).not.toContain("Cancelled");

    expect(nextStatuses(partner, work("Completed"))).toEqual([]);
  });
});

describe("who can still edit the work", () => {
  it("lets the assignee work until it goes for review", () => {
    expect(canEditWork(maker, work("In progress"))).toBe(true);
    expect(canEditWork(maker, work("Awaiting documents"))).toBe(true);
    expect(canEditWork(maker, work("Under review"))).toBe(false);
  });

  it("leaves it open to the reviewer and seniors under review", () => {
    expect(canEditWork(checker, work("Under review"))).toBe(true);
    expect(canEditWork(partner, work("Filed / delivered"))).toBe(true);
  });

  it("closes everything once completed or cancelled", () => {
    expect(canEditWork(partner, work("Completed"))).toBe(false);
    expect(canEditWork(partner, work("Cancelled"))).toBe(false);
  });
});

describe("assignment rules", () => {
  const l3 = { minExecRole: "ca", minReviewRole: "partner", name: "Tax audit" };
  const l1 = { minExecRole: "intern", minReviewRole: "ca", name: "GSTR-3B" };

  const person = (id, role) => ({ id, name: id, role });

  it("keeps junior staff off expert work", () => {
    const result = checkAssignment(l3, person("a", "employee"), null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("at least a CA");
  });

  it("allows a senior to do junior work", () => {
    expect(checkAssignment(l1, person("a", "partner"), null).ok).toBe(true);
  });

  it("keeps a CA from reviewing work that needs a partner", () => {
    const result = checkAssignment(l3, person("a", "ca"), person("b", "ca"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("at least a partner");
  });

  it("refuses the same person as maker and checker", () => {
    const same = person("same", "partner");
    const result = checkAssignment(l1, same, same);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("other than the person doing the work");
  });

  it("accepts nobody assigned yet", () => {
    expect(checkAssignment(l1, null, null).ok).toBe(true);
  });
});

describe("building an engagement from a template", () => {
  const template = {
    _id: "tpl",
    name: "GSTR-1 / GSTR-3B filing",
    code: "GSTR3B",
    category: "Indirect Tax",
    version: 3,
    level: "L1",
    minExecRole: "intern",
    minReviewRole: "ca",
    recurrence: "monthly",
    turnaroundDays: 5,
    udinRequired: false,
    defaultFeePaise: 250000,
    sac: "",
    gstRate: 18,
    steps: [{ name: "Collect data" }, { name: "File" }],
    checklist: [
      { name: "Sales register", side: "client", mandatory: true },
      { name: "Filed acknowledgement", side: "firm", mandatory: true },
    ],
  };
  const client = { _id: "cli", branchId: "br" };
  const period = periodFor("monthly", FRIDAY);

  it("copies the template in rather than pointing at it", () => {
    const made = buildEngagement({ template, client, period, now: FRIDAY });
    expect(made.templateSnapshot.version).toBe(3);
    expect(made.tasks).toHaveLength(2);
    expect(made.checklist).toHaveLength(2);
    // editing the catalog afterwards must not reach into this
    template.steps.push({ name: "Something new" });
    expect(made.tasks).toHaveLength(2);
  });

  it("starts every task and checklist item fresh", () => {
    const made = buildEngagement({ template, client, period, now: FRIDAY });
    expect(made.tasks.every((t) => t.done === false)).toBe(true);
    expect(made.checklist.every((c) => c.status === "Pending")).toBe(true);
    expect(made.status).toBe("Scheduled");
    expect(made.billingStatus).toBe("Unbilled");
    expect(made.reworkCount).toBe(0);
  });

  it("sets the internal due date in working days", () => {
    const made = buildEngagement({ template, client, period, now: FRIDAY });
    expect(formatISTDate(made.internalDue)).toBe("23-10-2026");
  });

  it("leaves the statutory date empty, never guessed", () => {
    const made = buildEngagement({ template, client, period, now: FRIDAY });
    expect(made.statutoryDue).toBeNull();
  });

  it("leaves the internal date empty when the service has no day count", () => {
    const made = buildEngagement({
      template: { ...template, turnaroundDays: null },
      client,
      period,
      now: FRIDAY,
    });
    expect(made.internalDue).toBeNull();
  });

  it("takes the client's fee over the catalog's when given one", () => {
    expect(
      buildEngagement({ template, client, period, feePaise: 500000 }).feePaise,
    ).toBe(500000);
    expect(buildEngagement({ template, client, period }).feePaise).toBe(250000);
  });

  it("adds a UDIN line to the review checklist only when one is needed", () => {
    const plain = buildEngagement({ template, client, period });
    expect(plain.reviewChecklist.some((i) => /UDIN/.test(i.name))).toBe(false);

    const audit = buildEngagement({
      template: { ...template, udinRequired: true },
      client,
      period,
    });
    expect(audit.reviewChecklist.some((i) => /UDIN/.test(i.name))).toBe(true);
  });
});

describe("the A / B / C tiers (owner decision D4)", () => {
  it("relabels the stored levels without changing them", () => {
    expect(tierOf("L3")).toBe("A");
    expect(tierOf("L2")).toBe("B");
    expect(tierOf("L1")).toBe("C");
    // the reverse, for a filter or a report given a letter
    expect(LEVEL_OF.A).toBe("L3");
    expect(LEVEL_OF.C).toBe("L1");
  });

  it("accepts a letter it is given back, and nothing else", () => {
    expect(tierOf("A")).toBe("A");
    expect(tierOf("L4")).toBeNull();
    expect(tierOf("")).toBeNull();
    expect(tierLabel("L3")).toContain("A");
    expect(tierLabel("nonsense")).toBe("");
  });

  it("states every tier's rule, so a badge can read it out", () => {
    for (const tier of TIERS) {
      expect(TIER_RULES[tier].length).toBeGreaterThan(20);
    }
  });
});

describe("the tier's own sign-off rule", () => {
  const aTier = { minReviewRole: "partner", level: "L3" };

  it("refuses a CA on A-tier work, named reviewer or not", () => {
    const named = checkStatusChange(
      checker,
      work("Under review", { ...aTier, reviewerId: "checker" }),
      "Completed",
    );
    expect(named.ok).toBe(false);
    expect(named.error).toContain("a partner");

    // the hole: nobody named as reviewer, so any CA could close it
    const nobody = checkStatusChange(
      checker,
      work("Under review", { ...aTier, reviewerId: "" }),
      "Completed",
    );
    expect(nobody.ok).toBe(false);
  });

  it("lets a partner sign A-tier work off", () => {
    expect(
      checkStatusChange(
        partner,
        work("Under review", { ...aTier, reviewerId: "" }),
        "Completed",
      ).ok,
    ).toBe(true);
  });

  it("leaves C-tier and B-tier to a CA", () => {
    expect(
      checkStatusChange(
        checker,
        work("Under review", { minReviewRole: "ca", level: "L1" }),
        "Completed",
      ).ok,
    ).toBe(true);
  });

  it("asks for a CA when the snapshot says nothing", () => {
    // every engagement before P2-4 behaves exactly as it did
    expect(
      checkStatusChange(checker, work("Under review"), "Completed").ok,
    ).toBe(true);
    expect(
      checkStatusChange(
        { id: "e", role: "employee" },
        work("Under review"),
        "Completed",
      ).ok,
    ).toBe(false);
  });
});

describe("a step's own minimum role", () => {
  const engagement = { templateSnapshot: { minExecRole: "employee" } };

  it("falls back to the service's floor when the step names none", () => {
    expect(stepFloor(engagement, { minRole: "" })).toBe("employee");
    expect(stepFloor(engagement, {})).toBe("employee");
  });

  it("lets one step ask for more than the service does", () => {
    expect(stepFloor(engagement, { minRole: "ca" })).toBe("ca");
    expect(
      canExecute("employee", stepFloor(engagement, { minRole: "ca" })),
    ).toBe(false);
    expect(canExecute("ca", stepFloor(engagement, { minRole: "ca" }))).toBe(
      true,
    );
  });

  it("holds work with no snapshot at the weakest role rather than crashing", () => {
    expect(stepFloor({}, {})).toBe("intern");
  });

  it("copies the step's role into the engagement's own tasks", () => {
    const made = buildEngagement({
      template: {
        _id: "tpl",
        name: "Statutory audit",
        code: "AUD",
        category: "Audit and Assurance",
        version: 1,
        level: "L2",
        minExecRole: "employee",
        minReviewRole: "ca",
        recurrence: "annual",
        turnaroundDays: null,
        udinRequired: false,
        defaultFeePaise: 0,
        sac: "",
        gstRate: 18,
        checklist: [],
        steps: [
          { name: "Prepare" },
          { name: "Sign the report", minRole: "ca" },
        ],
      },
      client: { _id: "cli", branchId: "br" },
      period: periodFor("annual", FRIDAY),
      now: FRIDAY,
    });
    expect(made.tasks.map((t) => t.minRole)).toEqual(["", "ca"]);
  });
});
