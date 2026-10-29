import { describe, it, expect } from "vitest";
import {
  BUCKETS,
  bucketOf,
  checkTodo,
  groupTodos,
  dueSoonCount,
} from "../lib/todos/list.js";
import { istDate } from "../lib/dates.js";

/**
 * Reading a to-do list (P3-22c).
 *
 * Two things here can be quietly wrong and nobody would notice for a week.
 *
 * The first is the **day boundary**. A date is stored at IST midnight,
 * which is 18:30 UTC the day before, so anything that compares with a raw
 * `Date` puts today's to-do in yesterday — the same one-day bug P2-12 found
 * in nine places. Every case below is written at a time of day that would
 * expose it.
 *
 * The second is the **undated to-do**. Half of what anybody writes down has
 * no date, and a list that refuses or hides those is a list people keep on
 * paper instead.
 */

/** 10:00 IST on 28 October 2026 — a working morning, not midnight. */
const NOW = new Date("2026-10-28T04:30:00Z");
const on = (day) => istDate(2026, 10, day);

describe("writing one down", () => {
  it("needs something to do", () => {
    expect(checkTodo({ title: "" }).ok).toBe(false);
    expect(checkTodo({ title: "   " }).ok).toBe(false);
    expect(checkTodo({ title: "Ring Jaspal" })).toMatchObject({
      ok: true,
      title: "Ring Jaspal",
      due: null,
    });
  });

  it("keeps a line a line", () => {
    const long = checkTodo({ title: "x".repeat(201) });
    expect(long.ok).toBe(false);
    expect(long.error).toMatch(/200/);
    expect(checkTodo({ title: "x".repeat(200) }).ok).toBe(true);
  });

  it("reads the date as an Indian day, not a UTC one", () => {
    const read = checkTodo({ title: "File it", due: "2026-10-28" });
    expect(read.ok).toBe(true);
    // 00:00 IST on the 28th is 18:30 UTC on the 27th
    expect(read.due.toISOString()).toBe("2026-10-27T18:30:00.000Z");
  });

  it("allows a date that has gone — people write down what they are late on", () => {
    expect(checkTodo({ title: "Chase the bank", due: "2026-09-01" }).ok).toBe(
      true,
    );
  });

  it("refuses something that is not a date", () => {
    expect(checkTodo({ title: "Ring them", due: "next Tuesday" }).ok).toBe(
      false,
    );
  });
});

describe("which bucket", () => {
  it("puts yesterday late and today today", () => {
    expect(bucketOf({ dueDate: on(27) }, NOW)).toBe("overdue");
    expect(bucketOf({ dueDate: on(28) }, NOW)).toBe("today");
  });

  it("counts the next six days as this week", () => {
    expect(bucketOf({ dueDate: on(29) }, NOW)).toBe("week");
    expect(bucketOf({ dueDate: on(31) }, NOW)).toBe("week");
    expect(bucketOf({ dueDate: istDate(2026, 11, 3) }, NOW)).toBe("week");
    expect(bucketOf({ dueDate: istDate(2026, 11, 4) }, NOW)).toBe("later");
  });

  it("keeps an undated to-do rather than dropping it", () => {
    expect(bucketOf({ dueDate: null }, NOW)).toBe("undated");
    expect(bucketOf({}, NOW)).toBe("undated");
  });

  it("is right at a minute to midnight IST", () => {
    // 18:29 UTC on the 28th is 23:59 IST on the 28th, still today
    const lateEvening = new Date("2026-10-28T18:29:00Z");
    expect(bucketOf({ dueDate: on(28) }, lateEvening)).toBe("today");
    // and a minute later it is the 29th in India, so the 28th is late
    const justAfter = new Date("2026-10-28T18:31:00Z");
    expect(bucketOf({ dueDate: on(28) }, justAfter)).toBe("overdue");
  });
});

describe("the list, grouped", () => {
  const rows = [
    { title: "Chase the bank", dueDate: on(26) },
    { title: "Ring Jaspal", dueDate: on(28) },
    { title: "Check the challan", dueDate: on(28) },
    { title: "Ask for the bank statement", dueDate: istDate(2026, 11, 20) },
    { title: "Sort the filing cabinet", dueDate: null },
    { title: "Already done", dueDate: on(27), done: true },
  ];

  it("leaves out the buckets with nothing in them", () => {
    const groups = groupTodos(rows, NOW);
    expect(groups.map((group) => group.key)).toEqual([
      "overdue",
      "today",
      "later",
      "undated",
    ]);
    // "This week" is empty here and does not appear at all
    expect(groups.some((group) => group.key === "week")).toBe(false);
  });

  it("leaves finished ones out of the buckets", () => {
    const all = groupTodos(rows, NOW).flatMap((group) => group.rows);
    expect(all).toHaveLength(5);
    expect(all.some((row) => row.title === "Already done")).toBe(false);
  });

  it("sorts a bucket by date and then alphabetically", () => {
    const today = groupTodos(rows, NOW).find((group) => group.key === "today");
    expect(today.rows.map((row) => row.title)).toEqual([
      "Check the challan",
      "Ring Jaspal",
    ]);
  });

  it("knows every bucket it can produce", () => {
    for (const group of groupTodos(rows, NOW)) {
      expect(BUCKETS.map((bucket) => bucket.key)).toContain(group.key);
      expect(group.label).toBeTruthy();
    }
  });
});

describe("the badge", () => {
  it("counts what is late and due today, and nothing further out", () => {
    const rows = [
      { dueDate: on(26) },
      { dueDate: on(28) },
      { dueDate: on(29) },
      { dueDate: null },
      { dueDate: on(27), done: true },
    ];
    expect(dueSoonCount(rows, NOW)).toBe(2);
  });

  it("is zero on an empty list rather than undefined", () => {
    expect(dueSoonCount([], NOW)).toBe(0);
    expect(dueSoonCount(undefined, NOW)).toBe(0);
  });
});
