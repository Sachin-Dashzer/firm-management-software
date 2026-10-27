import { describe, it, expect } from "vitest";
import {
  targets,
  atRisk,
  PREPARE_LEAD,
  REVIEW_LEAD,
} from "../lib/engagements/risk.js";
import { approve } from "../lib/engagements/gates.js";
import { istWeekday } from "../lib/dates.js";

/**
 * The three dates, and the state they make possible (P3-5).
 *
 * The property worth testing is what **at risk is not**. Overdue is the list
 * where acting is too late; at risk is the list where acting still works,
 * and a job that appears in both is a job counted twice — which is exactly
 * how a partner comes to distrust both numbers.
 *
 * The second is that the targets are working days. A target that falls on a
 * Sunday is a target nobody can hit, and the prototype's calendar-day
 * version produces them.
 */

const d = (s) => new Date(`${s}T00:00:00+05:30`);
const REVIEWER = { id: "u-ca", role: "ca", name: "Ritika Chandra" };

/**
 * GSTR-3B for October 2026 falls on Friday 20 November.
 *   prepare by  −4 working days → Monday 16 November
 *   reviewed by −2 working days → Wednesday 18 November
 */
const DUE = d("2026-11-20");

const job = (over = {}) => ({
  status: "In progress",
  version: 1,
  assigneeId: "u-maker",
  reviewerId: REVIEWER.id,
  internalDue: null,
  templateSnapshot: { minReviewRole: "ca", level: "L1" },
  milestones: [{ _id: "m1", name: "GSTR-3B", dueDate: DUE, filedOn: null }],
  ...over,
});

describe("three dates counted back from the deadline", () => {
  it("lands the two computed ones on working days", () => {
    const t = targets(job());
    expect(t.statutory).toEqual(DUE);
    expect(t.prepare).toEqual(d("2026-11-16"));
    expect(t.review).toEqual(d("2026-11-18"));
    // the weekend of the 21st and 22nd is why these are not −4 and −2 days
    expect(istWeekday(t.prepare)).not.toBe(0);
    expect(istWeekday(t.prepare)).not.toBe(6);
    expect(istWeekday(t.review)).not.toBe(0);
    expect(istWeekday(t.review)).not.toBe(6);
  });

  it("steps over a weekend rather than through it", () => {
    // Monday 23 November: −2 working days is Thursday the 19th, not the 21st
    const t = targets(
      job({
        milestones: [
          { _id: "m1", name: "AOC-4", dueDate: d("2026-11-23"), filedOn: null },
        ],
      }),
    );
    expect(t.review).toEqual(d("2026-11-19"));
    expect(t.prepare).toEqual(d("2026-11-17"));
  });

  it("counts back from the next open filing, not the last one", () => {
    const t = targets(
      job({
        milestones: [
          {
            _id: "m1",
            name: "GSTR-1",
            dueDate: d("2026-11-11"),
            filedOn: null,
          },
          { _id: "m2", name: "GSTR-3B", dueDate: DUE, filedOn: null },
        ],
      }),
    );
    expect(t.name).toBe("GSTR-1");
    expect(t.statutory).toEqual(d("2026-11-11"));
  });

  it("is null when there is no date to count back from", () => {
    // an unconfirmed due-date rule produces no milestones (CLAUDE.md rule 8)
    expect(targets(job({ milestones: [] }))).toBeNull();
    expect(
      targets(
        job({
          milestones: [
            { _id: "m1", name: "GSTR-3B", dueDate: null, filedOn: null },
          ],
        }),
      ),
    ).toBeNull();
    // everything filed: nothing is next
    expect(
      targets(
        job({
          milestones: [
            {
              _id: "m1",
              name: "GSTR-3B",
              dueDate: DUE,
              filedOn: d("2026-11-18"),
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("keeps the leads where the spec put them", () => {
    // §8's firm target is −3, so preparation sits before it and review after
    expect(PREPARE_LEAD).toBe(4);
    expect(REVIEW_LEAD).toBe(2);
    expect(PREPARE_LEAD).toBeGreaterThan(3);
    expect(REVIEW_LEAD).toBeLessThan(3);
  });
});

describe("at risk is the list where acting still works", () => {
  it("is quiet while everything is on time", () => {
    expect(atRisk(job(), d("2026-11-14"))).toBeNull();
  });

  it("fires when the preparation target has passed", () => {
    const why = atRisk(job(), d("2026-11-17"));
    expect(why).toMatch(/Preparation target for GSTR-3B has passed/);
  });

  it("says so when the hold-up is the client", () => {
    const why = atRisk(job({ status: "Awaiting documents" }), d("2026-11-17"));
    expect(why).toMatch(/waiting on the client/);
  });

  it("fires when the review target has passed and nobody approved", () => {
    const why = atRisk(job({ status: "Under review" }), d("2026-11-19"));
    expect(why).toMatch(/Review target for GSTR-3B has passed/);
  });

  it("goes quiet once it is approved", () => {
    const e = job({ status: "Under review" });
    expect(atRisk(e, d("2026-11-19"))).not.toBeNull();
    approve(e, REVIEWER);
    expect(atRisk(e, d("2026-11-19"))).toBeNull();
  });

  it("reads back the firm's own target, which nothing used to", () => {
    const e = job({ internalDue: d("2026-11-13") });
    // before either computed target has passed, so this is the only trigger
    expect(atRisk(e, d("2026-11-14"))).toBe(
      "The firm's target date has passed",
    );
  });

  it("is silent on work that is already overdue — that is a harder state", () => {
    // 21 November: the deadline itself has gone
    expect(atRisk(job(), d("2026-11-21"))).toBeNull();
  });

  it("is silent on a job with one filing overdue and another still ahead", () => {
    const e = job({
      milestones: [
        { _id: "m1", name: "GSTR-1", dueDate: d("2026-11-11"), filedOn: null },
        { _id: "m2", name: "GSTR-3B", dueDate: DUE, filedOn: null },
      ],
    });
    // GSTR-1 is overdue on the 17th, so this job belongs in Overdue and must
    // not also be counted here
    expect(atRisk(e, d("2026-11-17"))).toBeNull();
  });

  it("is silent on finished and abandoned work", () => {
    expect(atRisk(job({ status: "Completed" }), d("2026-11-17"))).toBeNull();
    expect(atRisk(job({ status: "Cancelled" }), d("2026-11-17"))).toBeNull();
  });

  it("is silent when there is no date at all", () => {
    expect(atRisk(job({ milestones: [] }), d("2026-11-17"))).toBeNull();
  });
});
