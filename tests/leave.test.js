import { describe, it, expect } from "vitest";
import {
  LEAVE_KINDS,
  coversDay,
  overlaps,
  awayOn,
  coveringOn,
  hoursLost,
  checkLeave,
} from "../lib/team/leave.js";
import { isMine } from "../lib/issues/shape.js";
import { istDate } from "../lib/dates.js";

/**
 * Leave, cover, and whose work it is while somebody is away (P3-16).
 *
 * The arithmetic here is the kind that fails quietly: an off-by-one on the
 * last day of leave means a person's work has no second pair of eyes on
 * exactly the day they are not there to notice.
 */

const leave = (over = {}) => ({
  _id: "l1",
  userId: "anil",
  coverId: "priya",
  kind: "Leave",
  // Monday 10 November 2026 to Friday the 14th, both days inclusive
  from: istDate(2026, 11, 10),
  to: istDate(2026, 11, 14),
  ...over,
});

describe("both ends of a leave count", () => {
  it("includes the first day", () => {
    expect(coversDay(leave(), istDate(2026, 11, 10))).toBe(true);
  });

  it("includes the last day, which is the one that gets lost", () => {
    expect(coversDay(leave(), istDate(2026, 11, 14))).toBe(true);
  });

  it("does not include the day before or the day after", () => {
    expect(coversDay(leave(), istDate(2026, 11, 9))).toBe(false);
    expect(coversDay(leave(), istDate(2026, 11, 15))).toBe(false);
  });

  /**
   * A date stored at IST midnight is 18:30 UTC the previous day, so any
   * comparison that forgets the timezone reads the wrong day entirely.
   */
  it("reads the Indian day, not the UTC one", () => {
    // 23:00 IST on the last day is already the 14th in UTC terms + 5:30
    const lateOnTheLastDay = new Date(
      istDate(2026, 11, 14).getTime() + 23 * 3_600_000,
    );
    expect(coversDay(leave(), lateOnTheLastDay)).toBe(true);
  });

  it("offers the two kinds spec section 9 names", () => {
    expect(LEAVE_KINDS).toEqual(["Leave", "Exam leave"]);
  });
});

describe("who is away and who is holding their work", () => {
  const rows = [
    leave(),
    leave({
      _id: "l2",
      userId: "ravi",
      coverId: "anil",
      from: istDate(2026, 11, 20),
      to: istDate(2026, 11, 21),
    }),
  ];

  it("answers for one day at a time", () => {
    const away = awayOn(rows, istDate(2026, 11, 11));
    expect([...away.keys()]).toEqual(["anil"]);
    expect(awayOn(rows, istDate(2026, 11, 20)).has("ravi")).toBe(true);
  });

  it("says whose work somebody is holding on a given day", () => {
    expect(coveringOn(rows, "priya", istDate(2026, 11, 11))).toHaveLength(1);
    expect(coveringOn(rows, "priya", istDate(2026, 11, 20))).toHaveLength(0);
    // Anil covers Ravi in November, and is himself away the week before
    expect(coveringOn(rows, "anil", istDate(2026, 11, 20))).toHaveLength(1);
  });

  it("overlaps where the ranges touch at all, including a single shared day", () => {
    expect(
      overlaps(leave(), {
        from: istDate(2026, 11, 14),
        to: istDate(2026, 11, 18),
      }),
    ).toBe(true);
    expect(
      overlaps(leave(), {
        from: istDate(2026, 11, 15),
        to: istDate(2026, 11, 18),
      }),
    ).toBe(false);
  });
});

describe("capacity the week loses", () => {
  const week = { start: istDate(2026, 11, 9), end: istDate(2026, 11, 16) };

  it("counts working days only, so a weekend in the leave costs nothing", () => {
    // 10th to 14th is Tue–Sat in 2026; Saturday is not a working day
    expect(hoursLost(leave(), week, 8)).toBe(32);
  });

  it("is nothing when the leave is in another week", () => {
    const other = leave({
      from: istDate(2026, 11, 23),
      to: istDate(2026, 11, 27),
    });
    expect(hoursLost(other, week, 8)).toBe(0);
  });
});

describe("a leave is refused when it would leave work with nobody", () => {
  const existing = [leave()];

  it("takes a clean one", () => {
    expect(
      checkLeave({
        userId: "ravi",
        coverId: "priya",
        from: istDate(2026, 12, 1),
        to: istDate(2026, 12, 3),
        leaves: existing,
      }),
    ).toEqual({ ok: true });
  });

  it("refuses an absence with nobody named", () => {
    const result = checkLeave({
      userId: "ravi",
      coverId: "",
      from: istDate(2026, 12, 1),
      to: istDate(2026, 12, 3),
      leaves: [],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Name who holds their work/);
  });

  it("refuses somebody covering for themselves", () => {
    const result = checkLeave({
      userId: "ravi",
      coverId: "ravi",
      from: istDate(2026, 12, 1),
      to: istDate(2026, 12, 3),
      leaves: [],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot cover for themselves/);
  });

  /**
   * The rule that keeps cover one hop deep. Without it, A covered by B
   * covered by C is a question nobody can answer at a glance, and the
   * glance is the whole point of naming a cover.
   */
  it("refuses a cover who is away themselves for any of it", () => {
    const result = checkLeave({
      userId: "ravi",
      coverId: "anil",
      from: istDate(2026, 11, 14),
      to: istDate(2026, 11, 18),
      leaves: existing,
      cover: { name: "Anil Mehra" },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Anil Mehra is away themselves/);
  });

  it("refuses a second absence over the same day", () => {
    const result = checkLeave({
      userId: "anil",
      coverId: "priya",
      from: istDate(2026, 11, 12),
      to: istDate(2026, 11, 18),
      leaves: existing,
      person: { name: "Anil Mehra" },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already recorded as away/);
  });

  it("lets the same leave be re-saved without clashing with itself", () => {
    expect(
      checkLeave({
        userId: "anil",
        coverId: "priya",
        from: istDate(2026, 11, 10),
        to: istDate(2026, 11, 17),
        leaves: existing,
        ignoreId: "l1",
      }),
    ).toEqual({ ok: true });
  });

  it("refuses dates the wrong way round", () => {
    const result = checkLeave({
      userId: "ravi",
      coverId: "priya",
      from: istDate(2026, 12, 5),
      to: istDate(2026, 12, 1),
      leaves: [],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/before the first day/);
  });
});

describe("a row belongs to whoever is covering for its owner", () => {
  const row = { ownerId: "anil", kind: "Deadlines" };
  const priya = {
    id: "priya",
    role: "employee",
    branchIds: [],
    covering: ["anil"],
  };

  it("counts the absentee's row as the cover's", () => {
    expect(isMine(row, priya)).toBe(true);
  });

  it("is not everybody's row — only the named cover's", () => {
    expect(
      isMine(row, {
        id: "ravi",
        role: "employee",
        branchIds: [],
        covering: [],
      }),
    ).toBe(false);
  });

  it("still counts their own rows as theirs", () => {
    expect(isMine({ ownerId: "priya" }, priya)).toBe(true);
  });

  /** An actor with no cover list behaves exactly as before P3-16. */
  it("does not need a covering list to work", () => {
    expect(isMine(row, { id: "anil", role: "employee", branchIds: [] })).toBe(
      true,
    );
    expect(isMine(row, { id: "ravi", role: "employee", branchIds: [] })).toBe(
      false,
    );
  });
});
