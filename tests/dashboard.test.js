import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { contrast, parseThemes } from "../lib/contrast.js";
import {
  wipBuckets,
  deadlineChips,
  greeting,
  ageingSegments,
  shortName,
} from "../lib/reports/dashboard.js";
import {
  heatThresholds,
  heatStep,
  heatText,
  heatClasses,
  HEAT_ALPHA,
  HEAT_STEPS,
} from "../lib/reports/heat.js";
import { rebalanceHint, COMFORT_JOB_LIMIT } from "../lib/team/workload.js";
import { isDrafted, noticeQuery } from "../lib/practice/notices.js";

/**
 * The firm dashboard's arithmetic (P3-34 phase 3).
 *
 * The screen is mostly queries, which need a database. What is here is the
 * part that is pure — and it is pure on purpose, because these are the
 * rules that go wrong **quietly**: a bucket that silently drops a status
 * makes a total a little low, and nobody reports a total that looks
 * plausible.
 */

const actor = { id: "u1", role: "partner", branchIds: ["b1"], active: true };

describe("the work-in-progress buckets", () => {
  const job = (status, over = {}) => ({ status, scope: "billable", ...over });

  it("puts every open status in exactly one bucket", () => {
    const bar = wipBuckets([
      job("Scheduled"),
      job("Awaiting documents"),
      job("In progress"),
      job("Under review"),
      job("Filed / delivered"),
    ]);
    expect(bar.total).toBe(5);
    expect(bar.segments.map((s) => s.value)).toEqual([1, 1, 1, 1, 1]);
  });

  it("counts held work as in progress rather than losing it", () => {
    // a held job is somebody's and is not done; dropping it would make the
    // bar's total disagree with the job board, which is the one thing the
    // bar must not do
    const bar = wipBuckets([job("In progress"), job("On hold")]);
    expect(bar.total).toBe(2);
    expect(bar.segments.find((s) => s.key === "progress").value).toBe(2);
    expect(bar.onHold).toBe(1);
  });

  it("calls finished-and-unbilled work 'done, to bill'", () => {
    const bar = wipBuckets([
      job("Completed", { billingStatus: "Unbilled" }),
      job("Filed / delivered"),
    ]);
    expect(bar.segments.find((s) => s.key === "toBill").value).toBe(2);
  });

  it("leaves out work that is completed and already billed", () => {
    const bar = wipBuckets([job("Completed", { billingStatus: "Billed" })]);
    expect(bar.total).toBe(0);
  });

  it("leaves out completed work nobody is going to bill", () => {
    // waived and retainer work is finished and unbilled and is not money
    // the firm is owed — the same rule `unbilled()` applies
    const bar = wipBuckets([
      { status: "Completed", billingStatus: "Unbilled", scope: "waived" },
    ]);
    expect(bar.total).toBe(0);
  });

  it("leaves out cancelled work entirely", () => {
    expect(wipBuckets([job("Cancelled")]).total).toBe(0);
  });

  it("survives a firm with nothing open", () => {
    const bar = wipBuckets([]);
    expect(bar.total).toBe(0);
    expect(bar.segments).toHaveLength(5);
  });
});

describe("the deadline chips", () => {
  const at = (iso, service, name) => ({
    statutoryDue: new Date(iso),
    serviceTemplateId: service,
    templateSnapshot: { name },
  });
  const now = new Date("2026-10-30T06:00:00Z");

  it("groups a filing twenty clients share into one chip", () => {
    const chips = deadlineChips(
      Array.from({ length: 20 }, () =>
        at("2026-10-31T06:00:00Z", "s1", "TDS Q2 return"),
      ),
      now,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].count).toBe(20);
    expect(chips[0].name).toBe("TDS Q2 return");
  });

  it("keeps two dates of the same service apart", () => {
    const chips = deadlineChips(
      [
        at("2026-10-31T06:00:00Z", "s1", "GSTR-1"),
        at("2026-11-11T06:00:00Z", "s1", "GSTR-1"),
      ],
      now,
    );
    expect(chips).toHaveLength(2);
  });

  it("colours by how close it is", () => {
    const chips = deadlineChips(
      [
        at("2026-10-31T06:00:00Z", "s1", "Tomorrow"),
        at("2026-11-04T06:00:00Z", "s2", "Next week"),
        at("2026-11-12T06:00:00Z", "s3", "A fortnight"),
      ],
      now,
    );
    expect(chips.map((c) => c.tone)).toEqual(["late", "soon", "neutral"]);
  });

  it("links a chip beyond this week to a window wide enough to hold it", () => {
    // `engagementQuery` understands week (7 days) and month (30); a chip
    // fifteen days out linked to `due=week` opens an empty list
    const [chip] = deadlineChips(
      [at("2026-11-12T06:00:00Z", "s3", "Far")],
      now,
    );
    expect(chip.href).toContain("due=month");
  });

  it("ignores what is already past and what is beyond the fortnight", () => {
    const chips = deadlineChips(
      [
        at("2026-10-20T06:00:00Z", "s1", "Gone"),
        at("2026-12-25T06:00:00Z", "s2", "Miles away"),
      ],
      now,
    );
    expect(chips).toEqual([]);
  });

  it("shows at most three, soonest first", () => {
    const chips = deadlineChips(
      ["31", "01", "02", "03", "04"].map((day, index) =>
        at(
          `2026-1${day === "31" ? "0" : "1"}-${day === "31" ? "31" : day}T06:00:00Z`,
          `s${index}`,
          `Job ${index}`,
        ),
      ),
      now,
    );
    expect(chips).toHaveLength(3);
    expect(chips[0].due <= chips[1].due).toBe(true);
  });
});

describe("the greeting", () => {
  it("follows the clock in India, not the server's", () => {
    // 03:00 UTC is 08:30 IST — morning here, still last night in London
    expect(greeting(new Date("2026-10-30T03:00:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-30T08:00:00Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-30T14:00:00Z"))).toBe("Good evening");
  });
});

describe("the rebalance suggestion", () => {
  const people = (...loads) =>
    loads.map((load, index) => ({
      id: `u${index}`,
      name: `P${index}`,
      load,
    }));

  it("says nothing when nobody is over the limit", () => {
    expect(rebalanceHint(people(10, 9, 2), 10)).toBeNull();
  });

  it("names the busiest, the roomiest, and how many jobs", () => {
    const hint = rebalanceHint(people(12, 9, 2), 10);
    expect(hint).toEqual({ from: "P0", to: "P2", jobs: 2 });
  });

  it("prefers somebody with room for the whole move", () => {
    // P1 has the lowest load but only room for 1; P2 can take all 3
    const hint = rebalanceHint(
      [
        { id: "a", name: "Busy", load: 13 },
        { id: "b", name: "Nearly full", load: 9 },
        { id: "c", name: "Free", load: 4 },
      ],
      10,
    );
    expect(hint.to).toBe("Free");
    expect(hint.jobs).toBe(3);
  });

  it("falls back to the least loaded when nobody has room for all of it", () => {
    const hint = rebalanceHint(
      [
        { id: "a", name: "Busy", load: 20 },
        { id: "b", name: "Less busy", load: 7 },
      ],
      10,
    );
    expect(hint.to).toBe("Less busy");
  });

  it("never suggests moving work to somebody also over the limit", () => {
    expect(
      rebalanceHint(
        [
          { id: "a", name: "Worst", load: 18 },
          { id: "b", name: "Also over", load: 14 },
        ],
        10,
      ),
    ).toBeNull();
  });

  it("says nothing about a firm of one", () => {
    expect(rebalanceHint(people(30), 10)).toBeNull();
    expect(rebalanceHint([], 10)).toBeNull();
  });

  it("has a limit somebody can actually hit", () => {
    expect(COMFORT_JOB_LIMIT).toBeGreaterThan(0);
  });
});

describe("the receivables bar", () => {
  it("uses the buckets ageReceivables already returns", () => {
    const segments = ageingSegments({
      current: 100,
      "0-30": 200,
      "31-60": 0,
      "61-90": 400,
      "90+": 500,
      total: 1200,
    });
    expect(segments.map((s) => s.key)).toEqual([
      "current",
      "0-30",
      "31-60",
      "61-90",
      "90+",
    ]);
    expect(segments.map((s) => s.value)).toEqual([100, 200, 0, 400, 500]);
  });

  it("survives a firm that is owed nothing", () => {
    const segments = ageingSegments(undefined);
    expect(segments.every((s) => s.value === 0)).toBe(true);
  });
});

describe("the heatmap's shading", () => {
  it("spreads cells across the steps instead of flattening them", () => {
    // the old shading was value / peak, which on this shape put eight of
    // nine cells in the bottom shade
    const values = [1, 2, 3, 4, 5, 6, 8, 11, 14];
    const thresholds = heatThresholds(values);
    const steps = values.map((value) => heatStep(value, thresholds));
    expect(new Set(steps).size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...steps)).toBe(HEAT_STEPS);
    expect(Math.min(...steps)).toBe(1);
  });

  it("never goes down as the figure goes up", () => {
    const thresholds = heatThresholds([1, 1, 2, 5, 9, 9, 20]);
    let last = 0;
    for (const value of [1, 2, 5, 9, 20, 99]) {
      const step = heatStep(value, thresholds);
      expect(step).toBeGreaterThanOrEqual(last);
      last = step;
    }
  });

  it("gives an empty cell its own look, not a paler shade of a full one", () => {
    expect(heatStep(0, [1, 2, 3, 4, 5])).toBe(0);
    expect(heatClasses(0)).toContain("bg-sunk");
    expect(heatClasses(0)).not.toContain("carbon");
  });

  it("shades a flat week evenly rather than inventing a spread", () => {
    const thresholds = heatThresholds([4, 4, 4, 4]);
    expect([4, 4, 4].map((v) => heatStep(v, thresholds))).toEqual([1, 1, 1]);
  });

  it("copes with a fortnight when nothing at all is due", () => {
    expect(heatThresholds([0, 0, 0])).toEqual([]);
    expect(heatStep(0, [])).toBe(0);
  });
});

describe("every heatmap step can still be read, in both themes", () => {
  const css = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const themes = parseThemes(css);

  /** The fill is the accent at some opacity over the card. */
  function over(colour, background, alpha) {
    const parts = (text) => [
      parseInt(text.slice(1, 3), 16),
      parseInt(text.slice(3, 5), 16),
      parseInt(text.slice(5, 7), 16),
    ];
    const [r1, g1, b1] = parts(colour);
    const [r2, g2, b2] = parts(background);
    const mix = (a, b) => Math.round(a * alpha + b * (1 - alpha));
    const pad = (value) => value.toString(16).padStart(2, "0");
    return `#${pad(mix(r1, r2))}${pad(mix(g1, g2))}${pad(mix(b1, b2))}`;
  }

  /**
   * This is the assertion that shaped the ramp. The brief asked for
   * `/10 /20 /35 /55 /80 /100`; the band from 55% to 90% has no text
   * colour that clears 4.5:1 in **both** themes, because the light
   * theme's accent darkens as it fills and the dark theme's lightens,
   * while `ink` and `on-carbon` swap meaning between them.
   */
  for (const name of ["light", "dark"]) {
    const theme = themes[name];

    it(`reads every figure on its own fill (${name})`, () => {
      for (let step = 1; step <= HEAT_STEPS; step += 1) {
        const fill = over(theme.carbon, theme.surface, HEAT_ALPHA[step - 1]);
        const text =
          heatText(step) === "text-on-carbon" ? theme["on-carbon"] : theme.ink;
        expect(
          contrast(text, fill),
          `step ${step} (${HEAT_ALPHA[step - 1] * 100}%) in ${name}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`reads the empty cell (${name})`, () => {
      // the empty cell is `ink-muted` and not `faint`: faint on the sunk
      // fill measures 4.26 light and 4.47 dark, which is how this started
      expect(heatClasses(0)).toContain("text-ink-muted");
      expect(contrast(theme["ink-muted"], theme.sunk)).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  }
});

describe("a notice reply counts as drafted once somebody has it", () => {
  it("is the person, not the filing", () => {
    expect(isDrafted({ preparedBy: "u7", filedOn: null })).toBe(true);
    expect(isDrafted({ preparedBy: null, filedOn: null })).toBe(false);
    expect(isDrafted(undefined)).toBe(false);
  });

  /**
   * The bug this closes: the query asked only whether a reply had been
   * *filed*, so one somebody was halfway through still answered to "no
   * draft" — and the tile, the rail badge and the list all over-reported
   * together, which is why it never looked wrong.
   */
  it("is the same rule the no-draft query uses", () => {
    const query = noticeQuery(actor, { show: "nodraft" });
    expect(query.submissions.$elemMatch).toMatchObject({
      filedOn: null,
      preparedBy: null,
    });
  });

  it("still only asks about replies that are actually owed", () => {
    const query = noticeQuery(actor, { show: "nodraft" });
    expect(query.submissions.$elemMatch.dueDate).toBeTruthy();
    expect(query.stage).toEqual({ $ne: "Closed" });
  });
});

describe("short names", () => {
  it("keeps the first name and initials the last", () => {
    expect(shortName("Ankit Saxena")).toBe("Ankit S.");
    expect(shortName("Gurpreet Kaur Brar")).toBe("Gurpreet B.");
  });

  it("leaves a single name alone", () => {
    expect(shortName("Gursimer")).toBe("Gursimer");
  });

  it("does not fall over on a missing name", () => {
    expect(shortName("")).toBe("—");
    expect(shortName(null)).toBe("—");
  });
});
