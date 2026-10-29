import { describe, expect, it } from "vitest";
import {
  byClient,
  byDay,
  checkTime,
  formatHours,
  minutesSince,
  realisation,
  startOfISTWeek,
  timeValue,
  totals,
  unrecorded,
  utilisation,
  weekDays,
  workingDaysBetween,
} from "../lib/team/time.js";
import { istInputDate } from "../lib/dates.js";

/**
 * The timesheet arithmetic (P3-28).
 *
 * Every figure on `/team/time` comes out of this module, and a wrong one
 * is invisible: 71% utilisation looks exactly as plausible as 17%, so
 * nobody checks it. That is what these tests are for.
 */

/** IST midnight on a given day, the way the collection stores it. */
const day = (iso) => new Date(`${iso}T00:00:00+05:30`);

describe("hours and minutes", () => {
  it("says the hours the way people do", () => {
    expect(formatHours(150)).toBe("2.5");
    expect(formatHours(120)).toBe("2");
    expect(formatHours(0)).toBe("0");
    expect(formatHours(45)).toBe("0.8");
  });

  it("counts minutes off the clock without going negative", () => {
    const start = new Date("2026-10-29T10:00:00Z");
    expect(minutesSince(start, new Date("2026-10-29T10:30:00Z"))).toBe(30);
    expect(minutesSince(start, new Date("2026-10-29T09:00:00Z"))).toBe(0);
    expect(minutesSince(start, new Date("2026-10-29T10:00:20Z"))).toBe(0);
  });
});

describe("the week", () => {
  it("starts on Monday, whichever day you ask on", () => {
    /* 29-10-2026 is a Thursday. */
    expect(istInputDate(startOfISTWeek(day("2026-10-29")))).toBe("2026-10-26");
    expect(istInputDate(startOfISTWeek(day("2026-10-26")))).toBe("2026-10-26");
  });

  it("puts Sunday at the end of its own week, not the start of the next", () => {
    expect(istInputDate(startOfISTWeek(day("2026-11-01")))).toBe("2026-10-26");
  });

  it("is seven days, Monday first", () => {
    const days = weekDays(day("2026-10-29")).map(istInputDate);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-10-26");
    expect(days[6]).toBe("2026-11-01");
  });

  it("counts working days with both ends included and the weekend out", () => {
    /* Mon 26 to Sun 1 November: five working days. */
    expect(workingDaysBetween(day("2026-10-26"), day("2026-11-01"))).toBe(5);
    expect(workingDaysBetween(day("2026-10-31"), day("2026-11-01"))).toBe(0);
  });
});

describe("totals", () => {
  const entries = [
    { on: day("2026-10-26"), minutes: 150, chargeable: true },
    { on: day("2026-10-26"), minutes: 60, chargeable: false },
    { on: day("2026-10-27"), minutes: 480, chargeable: true },
  ];

  it("separates chargeable from the rest", () => {
    expect(totals(entries)).toEqual({
      minutes: 690,
      chargeable: 630,
      other: 60,
    });
  });

  it("buckets by the Indian calendar day, not the UTC one", () => {
    /* A date stored at IST midnight is 18:30 UTC the day before; bucketing
       on the UTC day would file every line under yesterday. */
    const map = byDay(entries);
    expect(map.get("2026-10-26")).toEqual({ minutes: 210, chargeable: 150 });
    expect(map.get("2026-10-27")).toEqual({ minutes: 480, chargeable: 480 });
  });
});

describe("utilisation and realisation", () => {
  it("is chargeable over available, rounded", () => {
    expect(utilisation(1200, 2400)).toBe(50);
    expect(utilisation(1700, 2400)).toBe(71);
  });

  it("is null rather than zero when there is nothing to divide by", () => {
    /* A person with no capacity set has no utilisation. Zero would read as
       a person who did nothing, which is a different accusation. */
    expect(utilisation(0, 0)).toBeNull();
    expect(realisation(50_000, 0)).toBeNull();
  });

  it("is billed over time value", () => {
    expect(realisation(84_000, 100_000)).toBe(84);
  });
});

describe("time value", () => {
  const rates = new Map([
    ["a", 150_000], // ₹1,500 an hour
    ["b", 0],
  ]);

  it("values rated minutes and names who has no rate", () => {
    const result = timeValue(
      [
        { userId: "a", minutes: 60 },
        { userId: "a", minutes: 30 },
        { userId: "b", minutes: 120 },
      ],
      rates,
    );
    expect(result.paise).toBe(225_000);
    expect(result.ratedMinutes).toBe(90);
    expect(result.unrated).toEqual(["b"]);
  });

  it("rounds each line to whole paise", () => {
    /* ₹1,000 an hour over 7 minutes is 11,666.67 paise. Carrying the
       fraction would put a stray rupee on a year of lines. */
    const result = timeValue(
      [{ userId: "a", minutes: 7 }],
      new Map([["a", 100_000]]),
    );
    expect(Number.isInteger(result.paise)).toBe(true);
    expect(result.paise).toBe(11_667);
  });

  it("does not count somebody with no time against them as unrated", () => {
    const result = timeValue([{ userId: "b", minutes: 0 }], rates);
    expect(result.unrated).toEqual([]);
  });
});

describe("client profitability", () => {
  it("puts the worst realisation first and the unmeasurable last", () => {
    const rows = byClient([
      { clientId: "1", name: "Paying well", feePaise: 120, valuePaise: 100 },
      { clientId: "2", name: "Losing money", feePaise: 60, valuePaise: 100 },
      { clientId: "3", name: "No time yet", feePaise: 50, valuePaise: 0 },
    ]);
    expect(rows.map((row) => row.name)).toEqual([
      "Losing money",
      "Paying well",
      "No time yet",
    ]);
    expect(rows[0].realisation).toBe(60);
    expect(rows[2].realisation).toBeNull();
  });
});

describe("unrecorded days", () => {
  const people = [
    { id: "a", name: "Asha" },
    { id: "b", name: "Bimal" },
  ];
  /* Monday to Sunday; the weekend is not anybody's to fill in. */
  const days = weekDays(day("2026-10-29"));

  it("names only the working days with no line at all", () => {
    const gaps = unrecorded(
      [
        { userId: "a", on: day("2026-10-26"), minutes: 480 },
        { userId: "a", on: day("2026-10-27"), minutes: 60 },
      ],
      people,
      days,
    );
    const asha = gaps.find((row) => row.id === "a");
    expect(asha.days.map(istInputDate)).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(gaps.find((row) => row.id === "b").days).toHaveLength(5);
  });

  it("counts a short day as recorded", () => {
    /* "I did an hour on Tuesday" is a timesheet. Chasing it would be
       chasing an answer the firm already has. */
    const gaps = unrecorded(
      days.map((on) => ({ userId: "a", on, minutes: 30 })),
      [people[0]],
      days,
    );
    expect(gaps).toHaveLength(0);
  });

  it("ignores a running timer, which has recorded nothing yet", () => {
    const gaps = unrecorded(
      [{ userId: "a", on: day("2026-10-26"), minutes: 0 }],
      [people[0]],
      days,
    );
    expect(gaps[0].days.map(istInputDate)).toContain("2026-10-26");
  });
});

describe("reading the form", () => {
  const now = day("2026-10-29");

  it("takes decimal hours and clock hours alike", () => {
    expect(
      checkTime({ on: "2026-10-28", hours: "2.5", what: "x" }, now),
    ).toMatchObject({ ok: true, minutes: 150 });
    expect(
      checkTime({ on: "2026-10-28", hours: "2:30", what: "x" }, now),
    ).toMatchObject({ ok: true, minutes: 150 });
  });

  it("refuses a day that has not happened", () => {
    const result = checkTime({ on: "2026-10-30", hours: "1", what: "x" }, now);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/days that have happened/);
  });

  it("allows today", () => {
    expect(checkTime({ on: "2026-10-29", hours: "1", what: "x" }, now).ok).toBe(
      true,
    );
  });

  it("refuses an hour with nothing to explain it", () => {
    const result = checkTime({ on: "2026-10-28", hours: "1" }, now);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Pick a job/);
  });

  it("refuses nonsense and more than a day", () => {
    expect(checkTime({ on: "2026-10-28", hours: "", what: "x" }, now).ok).toBe(
      false,
    );
    expect(
      checkTime({ on: "2026-10-28", hours: "lots", what: "x" }, now).ok,
    ).toBe(false);
    expect(
      checkTime({ on: "2026-10-28", hours: "25", what: "x" }, now).ok,
    ).toBe(false);
    expect(checkTime({ on: "2026-10-28", hours: "0", what: "x" }, now).ok).toBe(
      false,
    );
  });

  it("stores the day at IST midnight", () => {
    const result = checkTime({ on: "2026-10-28", hours: "1", what: "x" }, now);
    expect(istInputDate(result.on)).toBe("2026-10-28");
  });
});
