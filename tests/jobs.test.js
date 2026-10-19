import { describe, it, expect } from "vitest";
import { backoffSeconds } from "../lib/jobs/queue.js";
import { lastDueAt, dueSchedules, SCHEDULES } from "../lib/jobs/schedules.js";
import { formatISTDateTime } from "../lib/dates.js";

/**
 * The runner's two tricky parts, tested without a database: when a schedule
 * was last due, and how long a failure waits before trying again. Both are
 * pure functions for exactly that reason.
 */

describe("retry back-off", () => {
  it("doubles from a minute", () => {
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(2)).toBe(120);
    expect(backoffSeconds(3)).toBe(240);
    expect(backoffSeconds(4)).toBe(480);
    expect(backoffSeconds(5)).toBe(960);
  });

  it("never waits longer than two hours", () => {
    expect(backoffSeconds(20)).toBe(2 * 60 * 60);
  });

  it("copes with a nonsense attempt count", () => {
    expect(backoffSeconds(0)).toBe(60);
    expect(backoffSeconds(-3)).toBe(60);
  });
});

describe("when a schedule was last due", () => {
  const nightly = { key: "test", type: "test", at: "02:40" };

  it("gives today's time once it has passed, in IST", () => {
    // 17 Oct 2026, 09:00 IST (03:30 UTC) — after 02:40
    const now = new Date("2026-10-17T03:30:00Z");
    expect(formatISTDateTime(lastDueAt(nightly, now))).toBe("17-10-2026 02:40");
  });

  it("gives yesterday's time before it has come round", () => {
    // 17 Oct 2026, 01:00 IST (16 Oct 19:30 UTC) — before 02:40
    const now = new Date("2026-10-16T19:30:00Z");
    expect(formatISTDateTime(lastDueAt(nightly, now))).toBe("16-10-2026 02:40");
  });

  it("is the same answer all day, which is what makes it idempotent", () => {
    const morning = lastDueAt(nightly, new Date("2026-10-17T05:00:00Z"));
    const evening = lastDueAt(nightly, new Date("2026-10-17T16:00:00Z"));
    expect(+morning).toBe(+evening);
  });

  it("does not drift across a month end", () => {
    const now = new Date("2026-11-01T01:00:00Z"); // 06:30 IST on 1 Nov
    expect(formatISTDateTime(lastDueAt(nightly, now))).toBe("01-11-2026 02:40");
  });

  it("works for a schedule set for midnight", () => {
    const midnight = { key: "t", type: "t", at: "00:00" };
    const now = new Date("2026-10-17T03:30:00Z"); // 09:00 IST
    expect(formatISTDateTime(lastDueAt(midnight, now))).toBe(
      "17-10-2026 00:00",
    );
  });
});

describe("what the runner offers the queue", () => {
  it("gives every schedule a key that repeats within the day", () => {
    const morning = dueSchedules(new Date("2026-10-17T05:00:00Z"));
    const evening = dueSchedules(new Date("2026-10-17T16:00:00Z"));

    expect(morning).toHaveLength(SCHEDULES.length);
    // the same key all day: offering it again is a no-op, which is how
    // twelve cron runs an hour produce one nightly job
    expect(morning.map((s) => s.uniqueKey)).toEqual(
      evening.map((s) => s.uniqueKey),
    );
  });

  it("gives a different key the next day", () => {
    const today = dueSchedules(new Date("2026-10-17T05:00:00Z"));
    const tomorrow = dueSchedules(new Date("2026-10-18T05:00:00Z"));
    expect(today[0].uniqueKey).not.toBe(tomorrow[0].uniqueKey);
  });

  it("names a real handler for every schedule", async () => {
    const { HANDLERS } = await import("../lib/jobs/run.js");
    for (const schedule of SCHEDULES) {
      expect(Object.keys(HANDLERS)).toContain(schedule.type);
    }
  });
});
