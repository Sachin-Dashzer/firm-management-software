import { describe, it, expect } from "vitest";
import {
  groupByDay,
  quickFilters,
  recordTypes,
  todayFigures,
} from "../lib/audit/log.js";
import { ACTIONS } from "../lib/audit/index.js";

/**
 * The Portal log screen (P2-10a).
 *
 * The rename itself needs no test — it is words and a route. What needs
 * one is the record-type list that used to be typed out and went stale,
 * and the day grouping, which is the usual IST-versus-UTC trap.
 */

const NOW = new Date("2026-10-21T12:00:00+05:30");
const at = (text) => new Date(text);

describe("the record types you can filter for", () => {
  it("offers what the log actually holds, not a list from Step 2", () => {
    // the bug this fixes: a partner could not ask "who has been into the
    // portal accounts" because ClientUser was not on the hardcoded list
    const types = recordTypes([
      "ClientUser",
      "Udin",
      "Dsc",
      "GeneratedDoc",
      "Client",
    ]);
    expect(types).toContain("ClientUser");
    expect(types).toContain("Udin");
    expect(types).toContain("GeneratedDoc");
  });

  it("still offers the familiar ones on an empty database", () => {
    const types = recordTypes([]);
    for (const known of ["Client", "Engagement", "Invoice", "User"]) {
      expect(types).toContain(known);
    }
  });

  it("says each one once, in order, and drops empties", () => {
    const types = recordTypes(["Client", "Client", "", null, "Udin"]);
    expect(types.filter((t) => t === "Client")).toHaveLength(1);
    expect(types).not.toContain("");
    expect(types).toEqual([...types].sort());
  });
});

describe("grouping a day's entries", () => {
  it("files an entry by its Indian day, not its UTC one", () => {
    // 4am IST on the 21st is 22:30 UTC on the 20th; grouping on the stored
    // UTC date would file it under the wrong morning
    const days = groupByDay(
      [{ ts: at("2026-10-21T04:00:00+05:30"), seq: 2 }],
      NOW,
    );
    expect(days).toHaveLength(1);
    expect(days[0].label).toBe("Today");
  });

  it("names today and yesterday, and dates everything older", () => {
    const days = groupByDay(
      [
        { ts: at("2026-10-21T10:00:00+05:30"), seq: 3 },
        { ts: at("2026-10-20T10:00:00+05:30"), seq: 2 },
        { ts: at("2026-10-14T10:00:00+05:30"), seq: 1 },
      ],
      NOW,
    );
    expect(days.map((d) => d.label)).toEqual([
      "Today",
      "Yesterday",
      "14-10-2026",
    ]);
  });

  it("keeps the newest day first and the entries inside it in order", () => {
    const days = groupByDay(
      [
        { ts: at("2026-10-20T09:00:00+05:30"), seq: 1 },
        { ts: at("2026-10-21T09:00:00+05:30"), seq: 3 },
        { ts: at("2026-10-21T08:00:00+05:30"), seq: 2 },
      ],
      NOW,
    );
    expect(days[0].label).toBe("Today");
    expect(days[0].entries.map((e) => e.seq)).toEqual([3, 2]);
  });

  it("has nothing to say about nothing", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe("the figures at the top", () => {
  const entries = [
    { action: ACTIONS.login },
    { action: ACTIONS.login },
    { action: ACTIONS.loginFailed },
    { action: ACTIONS.documentDownload },
    { action: ACTIONS.credentialReveal },
    { action: ACTIONS.update },
  ];

  it("counts the five things worth noticing", () => {
    const figures = todayFigures(entries);
    const value = (key) => figures.find((f) => f.key === key).value;
    expect(value("all")).toBe(6);
    expect(value("signIns")).toBe(2);
    expect(value("failed")).toBe(1);
    expect(value("downloads")).toBe(1);
    expect(value("reveals")).toBe(1);
  });

  it("marks a failed sign-in and a credential reveal as worth a second look", () => {
    const figures = todayFigures(entries);
    expect(figures.find((f) => f.key === "failed").alarming).toBe(true);
    expect(figures.find((f) => f.key === "reveals").alarming).toBe(true);
    expect(figures.find((f) => f.key === "signIns").alarming).toBeUndefined();
  });

  it("is all zeroes on a quiet morning, and nothing is alarming", () => {
    const figures = todayFigures([]);
    expect(figures.every((f) => f.value === 0)).toBe(true);
    expect(figures.some((f) => f.alarming)).toBe(false);
  });
});

describe("the quick filters", () => {
  it("asks the four questions a log is opened with", () => {
    const filters = quickFilters("u-1", NOW);
    expect(filters.map((f) => f.key)).toEqual([
      "today",
      "week",
      "mine",
      "failed",
    ]);
  });

  it("means the Indian day by today, and seven days by the week", () => {
    const [today, week] = quickFilters("u-1", NOW);
    expect(today.params.from).toBe("2026-10-21");
    expect(week.params.from).toBe("2026-10-15");
  });

  it("filters to the person asking, and to the action that matters", () => {
    const filters = quickFilters("u-7", NOW);
    expect(filters.find((f) => f.key === "mine").params.user).toBe("u-7");
    expect(filters.find((f) => f.key === "failed").params.action).toBe(
      ACTIONS.loginFailed,
    );
  });
});
