import { describe, it, expect } from "vitest";
import { digestFor, weeklyFor } from "../lib/mailer/digest.js";
import { lastDueAt, dueSchedules, SCHEDULES } from "../lib/jobs/schedules.js";
import { formatISTDateTime, istDate } from "../lib/dates.js";

/**
 * The two emails nobody asks for and everybody reads: the 9 AM digest and
 * the Monday summary. What matters here is that an empty one is not sent
 * at all, and that the weekly one really is weekly.
 */

const now = new Date(istDate(2026, 10, 19).getTime() + 3.5 * 60 * 60 * 1000);

const row = (extra = {}) => ({
  clientName: "Rao & Co",
  service: "GSTR-3B",
  period: "October 2026",
  statutoryDue: istDate(2026, 10, 20),
  internalDue: null,
  ...extra,
});

describe("the daily digest", () => {
  it("is not sent when there is nothing to say", () => {
    expect(digestFor({}, now).empty).toBe(true);
  });

  it("lists overdue, due today and awaiting review, in that order", () => {
    const built = digestFor(
      {
        overdue: [row({ statutoryDue: istDate(2026, 10, 12) })],
        dueToday: [row({ statutoryDue: istDate(2026, 10, 19) })],
        toReview: [row()],
      },
      now,
    );

    expect(built.empty).toBe(false);
    const order = [
      "Overdue (1)",
      "Due today (1)",
      "Waiting for your review (1)",
    ];
    let last = -1;
    for (const heading of order) {
      const at = built.lines.indexOf(heading);
      expect(at, heading).toBeGreaterThan(last);
      last = at;
    }
  });

  it("says how late a thing is, in days", () => {
    const built = digestFor(
      { overdue: [row({ statutoryDue: istDate(2026, 10, 12) })] },
      now,
    );
    expect(built.lines).toContain("7 days late");
    expect(built.lines).toContain("12-10-2026");
  });

  it("gives a partner the firm's overdue list, with names against it", () => {
    const built = digestFor(
      {
        firmOverdue: [
          row({
            statutoryDue: istDate(2026, 10, 1),
            assigneeName: "Neha Bhatt",
          }),
        ],
      },
      now,
    );
    expect(built.lines).toContain("Overdue across the firm (1)");
    expect(built.lines).toContain("[Neha Bhatt]");
  });

  it("stops at fifteen and counts the rest, so it stays readable", () => {
    const built = digestFor(
      {
        firmOverdue: Array.from({ length: 23 }, () =>
          row({ statutoryDue: istDate(2026, 10, 1) }),
        ),
      },
      now,
    );
    expect(built.lines).toContain("Overdue across the firm (23)");
    expect(built.lines).toContain("…and 8 more.");
  });

  it("copes with work that has no date at all", () => {
    const built = digestFor(
      { toReview: [row({ statutoryDue: null, internalDue: null })] },
      now,
    );
    expect(built.lines).toContain("(no date)");
  });
});

describe("the Monday summary", () => {
  const counts = {
    started: 12,
    completed: 9,
    overdue: 4,
    awaitingReview: 3,
    unbilled: 6,
    receivablePaise: 18_45_000,
    overduePaise: 4_50_000,
    byPerson: [{ name: "Neha Bhatt", overdue: 3 }],
  };

  it("reports the week, the state of play and the money", () => {
    const built = weeklyFor(counts);
    expect(built.lines).toContain("Work started: 12");
    expect(built.lines).toContain("Work completed: 9");
    expect(built.lines).toContain("Overdue now: 4");
    expect(built.lines).toContain("Completed but not yet invoiced: 6");
    expect(built.lines).toContain("Neha Bhatt: 3");
  });

  it("writes money in rupees with Indian grouping", () => {
    expect(weeklyFor(counts).lines).toContain("₹18,450");
  });

  it("is sent even in a quiet week — silence is also information", () => {
    expect(
      weeklyFor({
        started: 0,
        completed: 0,
        overdue: 0,
        awaitingReview: 0,
        unbilled: 0,
        receivablePaise: 0,
        overduePaise: 0,
      }).empty,
    ).toBe(false);
  });
});

describe("the weekly schedule", () => {
  const monday = { key: "w", type: "w", at: "09:00", dow: 1 };

  it("fires on a Monday and stays on that Monday all week", () => {
    // 19 Oct 2026 is a Monday
    const mondayMorning = new Date("2026-10-19T04:00:00Z"); // 09:30 IST
    const thursday = new Date("2026-10-22T04:00:00Z");

    expect(formatISTDateTime(lastDueAt(monday, mondayMorning))).toBe(
      "19-10-2026 09:00",
    );
    expect(formatISTDateTime(lastDueAt(monday, thursday))).toBe(
      "19-10-2026 09:00",
    );
  });

  it("looks back to last Monday before 9 AM on a Monday", () => {
    const earlyMonday = new Date("2026-10-19T02:00:00Z"); // 07:30 IST
    expect(formatISTDateTime(lastDueAt(monday, earlyMonday))).toBe(
      "12-10-2026 09:00",
    );
  });

  it("gives one job a week, not seven", () => {
    const keys = new Set();
    for (let day = 19; day <= 25; day += 1) {
      const when = new Date(`2026-10-${day}T06:00:00Z`);
      keys.add(
        dueSchedules(when).find((s) => s.key === "weekly-summary").uniqueKey,
      );
    }
    expect(keys.size).toBe(1);
  });
});

describe("the digest time the firm sets", () => {
  it("is used instead of the one in the code", () => {
    const when = new Date("2026-10-19T06:00:00Z"); // 11:30 IST
    const [digest] = dueSchedules(when, { dailyDigest: "10:30" }).filter(
      (s) => s.key === "daily-digest",
    );
    expect(formatISTDateTime(digest.due)).toBe("19-10-2026 10:30");
  });

  it("falls back to the code's time when the firm has not set one", () => {
    const when = new Date("2026-10-19T06:00:00Z");
    const [digest] = dueSchedules(when).filter((s) => s.key === "daily-digest");
    expect(formatISTDateTime(digest.due)).toBe("19-10-2026 09:00");
  });

  it("still has a handler for every schedule", async () => {
    const { HANDLERS } = await import("../lib/jobs/run.js");
    for (const schedule of SCHEDULES) {
      expect(Object.keys(HANDLERS)).toContain(schedule.type);
    }
  });
});
