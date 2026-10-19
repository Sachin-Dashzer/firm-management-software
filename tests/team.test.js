import { describe, expect, it } from "vitest";
import {
  isOpen,
  isOverdue,
  loadFor,
  loadForEach,
  groupByStatus,
} from "@/lib/team/workload";
import { STATUSES, CLOSED_STATUSES } from "@/lib/engagements/status";
import { checkAssignment } from "@/lib/engagements/assign";
import { LEVEL_DEFAULTS } from "@/lib/services/catalog";

/**
 * Counting what is on somebody's desk.
 *
 * This is the arithmetic behind the team list, `/me` and the Employee 360,
 * and it is the kind that goes wrong quietly: a person shown as having
 * nothing overdue when they have four looks perfectly fine on screen, and
 * nobody reports it.
 */

const ANKIT = "u-ankit";
const RITIKA = "u-ritika";
const NOW = new Date("2026-10-19T12:00:00+05:30");

/** @param {Partial<any>} fields */
function work(fields = {}) {
  return {
    status: "In progress",
    assigneeId: ANKIT,
    reviewerId: RITIKA,
    statutoryDue: null,
    internalDue: null,
    reworkCount: 0,
    ...fields,
  };
}

describe("open and overdue", () => {
  it("treats Completed and Cancelled as nobody's problem", () => {
    for (const status of CLOSED_STATUSES) {
      expect(isOpen(work({ status })), status).toBe(false);
    }
    expect(isOpen(work({ status: "In progress" }))).toBe(true);
    expect(isOpen(work({ status: "On hold" }))).toBe(true);
  });

  it("prefers the statutory date over the firm's own target", () => {
    const late = work({
      statutoryDue: new Date("2026-10-18"),
      internalDue: new Date("2026-12-01"),
    });
    expect(isOverdue(late, NOW)).toBe(true);

    const early = work({
      statutoryDue: new Date("2026-12-01"),
      internalDue: new Date("2026-10-18"),
    });
    expect(isOverdue(early, NOW)).toBe(false);
  });

  it("falls back to the internal target when there is no statutory date", () => {
    expect(isOverdue(work({ internalDue: new Date("2026-10-18") }), NOW)).toBe(
      true,
    );
  });

  /**
   * A due-date rule nobody has confirmed produces no date at all (rule 8), so
   * plenty of real engagements have neither date. Undated work is not late.
   */
  it("never calls undated work overdue", () => {
    expect(isOverdue(work(), NOW)).toBe(false);
  });

  it("never calls finished work overdue, however old its date", () => {
    expect(
      isOverdue(
        work({ status: "Completed", statutoryDue: new Date("2020-01-01") }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("one person's load", () => {
  const engagements = [
    work({ status: "In progress" }),
    work({ status: "Awaiting documents" }),
    work({ status: "Under review" }),
    work({ status: "Completed", reworkCount: 2 }),
    work({ status: "In progress", statutoryDue: new Date("2026-10-01") }),
    work({ status: "In progress", reworkCount: 1 }),
    // somebody else's work, which Ankit happens to review
    work({ assigneeId: RITIKA, reviewerId: ANKIT, status: "Under review" }),
    work({ assigneeId: RITIKA, reviewerId: ANKIT, status: "In progress" }),
  ];

  const load = loadFor(engagements, ANKIT, NOW);

  it("counts what they are doing apart from what they are reviewing", () => {
    expect(load.asAssignee).toBe(5); // six of theirs, one completed
    expect(load.asReviewer).toBe(2);
  });

  /**
   * The distinction the team list exists for: a CA with thirty engagements to
   * review and none to do is not an overloaded employee, and one number for
   * both would hide it.
   */
  it("does not add the two together", () => {
    expect(load.asAssignee).not.toBe(load.asAssignee + load.asReviewer);
    expect(load.awaitingMyReview).toBe(1);
  });

  it("counts overdue only among their own open work", () => {
    expect(load.overdue).toBe(1);
  });

  it("counts the statuses a supervisor asks about", () => {
    expect(load.awaitingDocuments).toBe(1);
    expect(load.sentForReview).toBe(1);
    expect(load.completed).toBe(1);
  });

  /**
   * Rework is reported as a count beside a count, never a percentage: three
   * out of twelve and thirty out of a hundred and twenty are different
   * conversations (the Step 10 decision, kept).
   */
  it("reports rework as engagements returned and times returned", () => {
    expect(load.reworked).toBe(2);
    expect(load.rework).toBe(3);
    expect(load.total).toBe(6);
  });

  it("gives somebody with nothing a row of zeros rather than undefined", () => {
    const empty = loadFor(engagements, "u-nobody", NOW);
    expect(empty.asAssignee).toBe(0);
    expect(empty.overdue).toBe(0);
    expect(empty.rework).toBe(0);
    expect(empty.total).toBe(0);
  });

  it("compares ids as strings, so an ObjectId does not read as nobody", () => {
    const withObjectIdish = [work({ assigneeId: { toString: () => ANKIT } })];
    expect(loadFor(withObjectIdish, ANKIT, NOW).asAssignee).toBe(1);
  });
});

describe("the whole team in one pass", () => {
  it("counts everybody from a single list of engagements", () => {
    const engagements = [
      work({ assigneeId: ANKIT }),
      work({ assigneeId: RITIKA }),
      work({ assigneeId: RITIKA, status: "Completed" }),
    ];
    const load = loadForEach(engagements, [ANKIT, RITIKA]);
    expect(load.get(ANKIT).asAssignee).toBe(1);
    expect(load.get(RITIKA).asAssignee).toBe(1);
    expect(load.get(RITIKA).total).toBe(2);
  });

  it("includes a person with no work at all, rather than leaving a gap", () => {
    const load = loadForEach([], [ANKIT, RITIKA]);
    expect(load.size).toBe(2);
    expect(load.get(ANKIT).asAssignee).toBe(0);
  });
});

describe("grouping work for the Work tab", () => {
  it("keeps the pipeline order rather than whatever the query returned", () => {
    const rows = [
      work({ status: "Under review" }),
      work({ status: "Scheduled" }),
      work({ status: "In progress" }),
    ];
    const groups = groupByStatus(rows, STATUSES);
    expect(groups.map(([status]) => status)).toEqual([
      "Scheduled",
      "In progress",
      "Under review",
    ]);
  });

  it("leaves out a status nobody is in", () => {
    const groups = groupByStatus([work({ status: "Scheduled" })], STATUSES);
    expect(groups).toHaveLength(1);
  });

  it("still shows a status the pipeline does not list, rather than losing it", () => {
    const groups = groupByStatus([work({ status: "Something new" })], STATUSES);
    expect(groups.map(([status]) => status)).toContain("Something new");
  });
});

/**
 * Offboarding and demotion both ask the same question of `checkAssignment`:
 * could this person still legally hold this work? The server actions run it
 * per engagement; these are the cases they rely on.
 */
describe("who may take over the work (offboarding and demotion)", () => {
  const audit = { ...LEVEL_DEFAULTS.L3, name: "Statutory audit" };
  const routine = { ...LEVEL_DEFAULTS.L1, name: "GSTR-3B" };

  const employee = { id: "e", name: "Ankit", role: "employee" };
  const ca = { id: "c", name: "Ritika", role: "ca" };
  const partner = { id: "p", name: "Praveen", role: "partner" };

  it("refuses A-tier work to an employee, so the wizard cannot park it there", () => {
    expect(checkAssignment(audit, employee, partner).ok).toBe(false);
  });

  it("allows it to a CA, reviewed by a partner", () => {
    expect(checkAssignment(audit, ca, partner).ok).toBe(true);
  });

  it("will not let the same person do and review it", () => {
    expect(checkAssignment(routine, ca, ca).ok).toBe(false);
  });

  it("allows routine work to anybody, still reviewed by a CA", () => {
    expect(checkAssignment(routine, employee, ca).ok).toBe(true);
  });

  /**
   * The demotion guard: somebody who is the reviewer on anything cannot
   * become an employee, because an employee may not review at all.
   */
  it("refuses a reviewer who is being demoted to employee", () => {
    expect(checkAssignment(routine, null, employee).ok).toBe(false);
  });
});

describe("open work by tier (owner decision D4)", () => {
  const tiered = (level, fields = {}) =>
    work({ templateSnapshot: { level }, ...fields });

  it("counts the three tiers apart, from each engagement's own snapshot", () => {
    const load = loadFor(
      [
        tiered("L3"),
        tiered("L3"),
        tiered("L2"),
        tiered("L1"),
        // finished work is nobody's load, whatever its tier
        tiered("L3", { status: "Completed" }),
      ],
      ANKIT,
      NOW,
    );
    expect(load.byTier).toEqual({ A: 2, B: 1, C: 1 });
    expect(load.asAssignee).toBe(4);
  });

  it("counts somebody else's work against them, not against this person", () => {
    const load = loadFor(
      [tiered("L3", { assigneeId: RITIKA }), tiered("L1")],
      ANKIT,
      NOW,
    );
    expect(load.byTier).toEqual({ A: 0, B: 0, C: 1 });
  });

  it("leaves work with no snapshot out rather than guessing a tier", () => {
    expect(loadFor([work()], ANKIT, NOW).byTier).toEqual({ A: 0, B: 0, C: 0 });
  });
});
