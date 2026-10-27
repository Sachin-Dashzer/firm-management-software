import { describe, it, expect } from "vitest";
import { planFor, weekOf, weekStart, weeksFrom } from "../lib/team/plan.js";
import { istDate } from "../lib/dates.js";

/**
 * The weekly board (P3-16).
 *
 * The test that matters is the two lanes landing in **different weeks** for
 * the same job, because that is the whole claim the board makes: a return
 * due on the 20th is the preparer's problem this week and the reviewer's
 * next week, and a board with one lane per person shows the reviewer
 * nothing until the work arrives.
 */

const people = [
  { _id: "anil", name: "Anil Mehra", role: "employee", capacityHours: 8 },
  { _id: "priya", name: "Priya Nair", role: "ca", capacityHours: 6 },
];

/**
 * GSTR-3B due Friday 20 November 2026. Preparation target is four working
 * days before (the 16th, a Monday); review is two (the 18th).
 */
const job = (over = {}) => ({
  _id: "e1",
  code: "NOI-GSTR3B-2026-10-0001",
  status: "In progress",
  clientId: "c1",
  assigneeId: "anil",
  reviewerId: "priya",
  periodLabel: "Oct 2026",
  milestones: [
    { name: "GSTR-3B", dueDate: istDate(2026, 11, 20), filedOn: null },
  ],
  templateSnapshot: { name: "GST monthly", level: "L2", effortHours: 3 },
  ...over,
});

const run = (over = {}) =>
  planFor({
    engagements: [job(over.job ?? {})],
    people,
    leaves: over.leaves ?? [],
    week: over.week ?? weekOf(istDate(2026, 11, 17)),
    now: over.now ?? istDate(2026, 11, 17),
  });

const rowFor = (plan, id) => plan.rows.find((row) => row.person.id === id);

describe("the week runs Monday to Sunday in IST", () => {
  it("starts on the Monday of the week a day falls in", () => {
    // 20 November 2026 is a Friday; its Monday is the 16th
    expect(weekStart(istDate(2026, 11, 20)).getTime()).toBe(
      istDate(2026, 11, 16).getTime(),
    );
  });

  it("treats Sunday as the end of the week it closes, not the start", () => {
    expect(weekStart(istDate(2026, 11, 22)).getTime()).toBe(
      istDate(2026, 11, 16).getTime(),
    );
  });

  it("offers this week and the next few", () => {
    const weeks = weeksFrom(istDate(2026, 11, 17), 4);
    expect(weeks).toHaveLength(4);
    expect(weeks[0].start.getTime()).toBe(istDate(2026, 11, 16).getTime());
    expect(weeks[3].start.getTime()).toBe(istDate(2026, 12, 7).getTime());
  });
});

describe("the two lanes are two different weeks", () => {
  it("puts preparation and review in the same week when the targets agree", () => {
    const plan = run();
    expect(rowFor(plan, "anil").prepare.jobs).toHaveLength(1);
    expect(rowFor(plan, "priya").review.jobs).toHaveLength(1);
  });

  /**
   * Move the statutory date to the Monday and the preparation target falls
   * into the previous week while the review target stays in this one. One
   * job, two people, two weeks.
   */
  it("separates them when the lead times straddle a weekend", () => {
    const earlier = {
      milestones: [{ name: "GSTR-3B", dueDate: istDate(2026, 11, 18) }],
    };
    const thisWeek = run({ job: earlier });
    expect(rowFor(thisWeek, "anil").prepare.jobs).toHaveLength(0);
    expect(rowFor(thisWeek, "priya").review.jobs).toHaveLength(1);

    const weekBefore = run({
      job: earlier,
      week: weekOf(istDate(2026, 11, 10)),
      now: istDate(2026, 11, 10),
    });
    expect(rowFor(weekBefore, "anil").prepare.jobs).toHaveLength(1);
    expect(rowFor(weekBefore, "priya").review.jobs).toHaveLength(0);
  });

  it("says what has reached the reviewer and what is still being prepared", () => {
    const coming = rowFor(run(), "priya").review;
    expect(coming.arrived).toBe(0);
    expect(coming.coming).toBe(1);

    const here = rowFor(
      run({ job: { status: "Under review" } }),
      "priya",
    ).review;
    expect(here.arrived).toBe(1);
    expect(here.coming).toBe(0);
  });

  it("drops work nobody has to do any more", () => {
    const plan = run({ job: { status: "Completed" } });
    expect(rowFor(plan, "anil").prepare.jobs).toHaveLength(0);
    expect(rowFor(plan, "priya").review.jobs).toHaveLength(0);
  });
});

describe("hours only where the whole lane has an estimate", () => {
  it("totals the estimates it has", () => {
    expect(rowFor(run(), "anil").prepare).toMatchObject({
      hours: 3,
      estimated: 1,
      unestimated: 0,
    });
  });

  /**
   * A part-total reads as the whole and says somebody is free when they are
   * not, so an unestimated job in the lane takes the over-capacity flag off
   * rather than quietly undercounting.
   */
  it("refuses to call somebody over capacity on a part-total", () => {
    const plan = planFor({
      engagements: [
        job({ _id: "a", templateSnapshot: { name: "A", effortHours: 40 } }),
        job({ _id: "b", templateSnapshot: { name: "B", effortHours: null } }),
      ],
      people,
      leaves: [],
      week: weekOf(istDate(2026, 11, 17)),
      now: istDate(2026, 11, 17),
    });
    const anil = rowFor(plan, "anil");
    expect(anil.prepare.unestimated).toBe(1);
    expect(anil.over).toBe(false);
  });

  it("flags over capacity when every job in the lane is estimated", () => {
    const plan = planFor({
      engagements: [
        job({ _id: "a", templateSnapshot: { name: "A", effortHours: 30 } }),
        job({ _id: "b", templateSnapshot: { name: "B", effortHours: 30 } }),
      ],
      people,
      leaves: [],
      week: weekOf(istDate(2026, 11, 17)),
      now: istDate(2026, 11, 17),
    });
    // five working days at eight hours is forty, and sixty is more
    expect(rowFor(plan, "anil")).toMatchObject({
      capacityHours: 40,
      over: true,
    });
  });
});

describe("leave takes capacity away and raises the warning", () => {
  const away = [
    {
      _id: "l1",
      userId: "anil",
      coverId: "priya",
      kind: "Leave",
      // Tuesday and Wednesday: the preparation target on Monday the 16th
      // falls outside it, which is what the warning test turns on
      from: istDate(2026, 11, 17),
      to: istDate(2026, 11, 18),
    },
  ];

  it("reduces the hours available, and says what was taken off", () => {
    const anil = rowFor(run({ leaves: away }), "anil");
    expect(anil.fullCapacityHours).toBe(40);
    expect(anil.lostHours).toBe(16);
    expect(anil.capacityHours).toBe(24);
  });

  it("names who is holding the work", () => {
    expect(rowFor(run({ leaves: away }), "priya").covering).toEqual([
      { userId: "anil", to: "18-11-2026" },
    ]);
  });

  /**
   * Spec section 9's warning. It is deliberately not "away and has work
   * this week": a job targeted at the Friday they are back is their own
   * problem and needs no warning.
   */
  it("warns only when the work is due on a day they are not here", () => {
    expect(run({ leaves: away }).warnings).toEqual([]);

    const overTheTarget = [
      { ...away[0], from: istDate(2026, 11, 16), to: istDate(2026, 11, 18) },
    ];
    const warnings = run({ leaves: overTheTarget }).warnings;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ name: "Anil Mehra", count: 1 });
  });
});

describe("work with no date is counted, never guessed at", () => {
  it("keeps it out of the lanes and says how much there is", () => {
    const plan = planFor({
      engagements: [job({ milestones: [], internalDue: null })],
      people,
      leaves: [],
      week: weekOf(istDate(2026, 11, 17)),
      now: istDate(2026, 11, 17),
    });
    expect(plan.unscheduled).toBe(1);
    expect(rowFor(plan, "anil").prepare.jobs).toHaveLength(0);
  });

  it("falls back to the firm's own target where there is no statutory date", () => {
    const plan = planFor({
      engagements: [
        job({ milestones: [], internalDue: istDate(2026, 11, 19) }),
      ],
      people,
      leaves: [],
      week: weekOf(istDate(2026, 11, 17)),
      now: istDate(2026, 11, 17),
    });
    expect(plan.unscheduled).toBe(0);
    expect(rowFor(plan, "anil").prepare.jobs).toHaveLength(1);
  });
});
