import { describe, it, expect } from "vitest";
import { periodsInYear, cellFor, buildGrid } from "../lib/compliance/grid.js";
import { istDate } from "../lib/dates.js";

/**
 * The grid exists to answer one question at a glance: what did we not file?
 * So the test that matters most is the difference between a period nobody
 * created work for and a period where the work is simply not finished.
 */

const NOW = new Date("2026-10-17T06:00:00Z"); // 17 Oct 2026, IST afternoon

describe("the columns of a financial year", () => {
  it("gives twelve months, April first", () => {
    const months = periodsInYear("monthly", 2026);
    expect(months).toHaveLength(12);
    expect(months[0].code).toBe("2026-04");
    expect(months[0].short).toBe("Apr");
    expect(months[11].code).toBe("2027-03");
    expect(months[11].short).toBe("Mar");
  });

  it("gives four quarters on the Indian year", () => {
    const quarters = periodsInYear("quarterly", 2026);
    expect(quarters.map((q) => q.code)).toEqual([
      "2026-Q1",
      "2026-Q2",
      "2026-Q3",
      "2026-Q4",
    ]);
    expect(quarters[0].short).toBe("Q1");
  });

  it("gives two halves", () => {
    expect(periodsInYear("half-yearly", 2026).map((h) => h.short)).toEqual([
      "H1",
      "H2",
    ]);
  });

  it("gives one column for an annual service", () => {
    const years = periodsInYear("annual", 2026);
    expect(years).toHaveLength(1);
    expect(years[0].code).toBe("FY2026-27");
  });
});

describe("what a cell means", () => {
  const past = { start: istDate(2026, 5, 1), end: istDate(2026, 6, 1) };
  const future = { start: istDate(2027, 2, 1), end: istDate(2027, 3, 1) };

  it("marks a period nobody created work for", () => {
    const cell = cellFor(null, NOW, past);
    expect(cell.state).toBe("missing");
    expect(cell.title).toMatch(/ever created/);
  });

  it("does not mark a period that has not arrived yet", () => {
    expect(cellFor(null, NOW, future).state).toBe("future");
  });

  it("does not call the period we are in a missing filing", () => {
    // October's return is not a hole on 17 October: it is not due yet, and
    // the generator only creates it a fortnight before it falls
    const current = { start: istDate(2026, 10, 1), end: istDate(2026, 11, 1) };
    expect(cellFor(null, NOW, current).state).toBe("current");
  });

  it("separates finished from filed-but-unsigned", () => {
    expect(cellFor({ status: "Completed" }, NOW, past).state).toBe("done");
    expect(cellFor({ status: "Filed / delivered" }, NOW, past).state).toBe(
      "filed",
    );
  });

  it("marks open work past its date as late, and before it as open", () => {
    const overdue = {
      status: "In progress",
      statutoryDue: istDate(2026, 6, 20),
    };
    const ahead = {
      status: "In progress",
      statutoryDue: istDate(2026, 12, 20),
    };
    expect(cellFor(overdue, NOW, past).state).toBe("late");
    expect(cellFor(ahead, NOW, past).state).toBe("open");
  });

  it("does not call work late when no date is known", () => {
    // an unverified due-date rule leaves the date blank; that is not lateness
    const undated = { status: "In progress", statutoryDue: null };
    expect(cellFor(undated, NOW, past).state).toBe("open");
  });

  it("shows held and cancelled work as neither late nor done", () => {
    expect(cellFor({ status: "On hold" }, NOW, past).state).toBe("held");
    expect(cellFor({ status: "Cancelled" }, NOW, past).state).toBe("cancelled");
  });
});

describe("the grid", () => {
  const periods = periodsInYear("monthly", 2026);
  const clients = [
    { id: "c1", name: "Aggarwal Traders" },
    { id: "c2", name: "Bhatia Textiles" },
  ];

  it("lines engagements up with their client and period", () => {
    const grid = buildGrid({
      clients,
      periods,
      now: NOW,
      engagements: [
        { _id: "e1", clientId: "c1", period: "2026-04", status: "Completed" },
        { _id: "e2", clientId: "c1", period: "2026-05", status: "Completed" },
        {
          _id: "e3",
          clientId: "c2",
          period: "2026-04",
          status: "In progress",
          statutoryDue: istDate(2026, 5, 20),
        },
      ],
    });

    expect(grid.rows[0].cells[0].state).toBe("done");
    expect(grid.rows[0].cells[0].engagementId).toBe("e1");
    expect(grid.rows[1].cells[0].state).toBe("late");
  });

  it("counts the holes, which is the number worth seeing", () => {
    const grid = buildGrid({
      clients,
      periods,
      now: NOW,
      engagements: [
        { _id: "e1", clientId: "c1", period: "2026-04", status: "Completed" },
      ],
    });

    // Apr to Sep have ended: c1 is missing five of them, c2 all six.
    // October is in progress and counts against nobody.
    expect(grid.rows[0].missing).toBe(5);
    expect(grid.rows[1].missing).toBe(6);
    expect(grid.totalMissing).toBe(11);
    expect(grid.rows[0].cells.filter((c) => c.state === "future")).toHaveLength(
      5,
    );
    expect(
      grid.rows[0].cells.filter((c) => c.state === "current"),
    ).toHaveLength(1);
  });

  it("leaves a client with nothing at all fully marked", () => {
    const grid = buildGrid({
      clients: [{ id: "c9", name: "Never Filed Ltd" }],
      periods,
      now: NOW,
      engagements: [],
    });
    expect(grid.totalMissing).toBe(6);
    expect(grid.totalLate).toBe(0);
  });
});

describe("the same grid, one client's services down the side", () => {
  const periods = periodsInYear("monthly", 2026);
  const services = [
    { id: "s-gst", name: "GSTR-3B filing" },
    { id: "s-tds", name: "TDS return" },
  ];

  /** The client's own Compliance tab passes `keyOf` and nothing else changes. */
  const forOneClient = (engagements) =>
    buildGrid({
      clients: services,
      periods,
      now: NOW,
      engagements,
      keyOf: (engagement) => String(engagement.serviceTemplateId),
    });

  it("lines engagements up with their service instead of their client", () => {
    const grid = forOneClient([
      {
        _id: "e1",
        clientId: "c1",
        serviceTemplateId: "s-gst",
        period: "2026-04",
        status: "Completed",
      },
      {
        _id: "e2",
        clientId: "c1",
        serviceTemplateId: "s-tds",
        period: "2026-04",
        status: "In progress",
        statutoryDue: istDate(2026, 5, 20),
      },
    ]);

    expect(grid.rows[0].cells[0].engagementId).toBe("e1");
    expect(grid.rows[0].cells[0].state).toBe("done");
    expect(grid.rows[1].cells[0].state).toBe("late");
  });

  it("counts a service's holes the same way it counts a client's", () => {
    const grid = forOneClient([
      {
        _id: "e1",
        clientId: "c1",
        serviceTemplateId: "s-gst",
        period: "2026-04",
        status: "Completed",
      },
    ]);
    // Apr to Sep have ended; October is current and counts against nobody
    expect(grid.rows[0].missing).toBe(5);
    expect(grid.rows[1].missing).toBe(6);
  });

  it("still keys on the client when nothing says otherwise", () => {
    const grid = buildGrid({
      clients: [{ id: "c1", name: "Aggarwal Traders" }],
      periods,
      now: NOW,
      engagements: [
        {
          _id: "e1",
          clientId: "c1",
          serviceTemplateId: "s-gst",
          period: "2026-04",
          status: "Completed",
        },
      ],
    });
    expect(grid.rows[0].cells[0].engagementId).toBe("e1");
  });
});

describe("part-filed cells (P3-1)", () => {
  const d = (s) => new Date(`${s}T00:00:00+05:30`);
  const periods = periodsInYear("monthly", 2026);

  /** October GST: GSTR-1 in, GSTR-3B still owing. */
  const halfDone = {
    _id: "e9",
    clientId: "c1",
    serviceTemplateId: "s-gst",
    period: "2026-04",
    status: "In progress",
    statutoryDue: d("2026-05-20"),
    milestones: [
      { name: "GSTR-1", dueDate: d("2026-05-11"), filedOn: d("2026-05-10") },
      { name: "GSTR-3B", dueDate: d("2026-05-20"), filedOn: null },
    ],
  };

  it("is neither open nor filed, and names both returns", () => {
    const grid = buildGrid({
      clients: [{ id: "c1", name: "Aggarwal Traders" }],
      periods,
      now: d("2026-05-15"),
      engagements: [halfDone],
    });
    const cell = grid.rows[0].cells[0];
    expect(cell.state).toBe("part");
    expect(cell.title).toMatch(/GSTR-1 filed/);
    expect(cell.title).toMatch(/GSTR-3B still owing/);
  });

  it("goes late once the outstanding return passes its date", () => {
    const grid = buildGrid({
      clients: [{ id: "c1", name: "Aggarwal Traders" }],
      periods,
      now: d("2026-05-25"),
      engagements: [halfDone],
    });
    // half a month's GST filed is not a reason to stop calling it overdue
    expect(grid.rows[0].cells[0].state).toBe("late");
  });

  it("leaves a fully filed month alone", () => {
    const grid = buildGrid({
      clients: [{ id: "c1", name: "Aggarwal Traders" }],
      periods,
      now: d("2026-05-25"),
      engagements: [
        {
          ...halfDone,
          status: "Completed",
          milestones: halfDone.milestones.map((m) => ({
            ...m,
            filedOn: d("2026-05-19"),
          })),
        },
      ],
    });
    expect(grid.rows[0].cells[0].state).toBe("done");
  });
});

/**
 * An empty cell meant one thing and is three (P3-9).
 *
 * The property that matters is that the **count** separates them. "Periods
 * with nothing created" was the one figure a partner read off this screen,
 * and it mixed the firm's own failures in with clients it was never that
 * firm's job to file for — so it was a number nobody could act on.
 */
describe("a period with nothing against it, and why", () => {
  const april = periodsInYear("monthly", 2026)[0];

  it("is a miss when nobody has said anything", () => {
    const cell = cellFor(null, NOW, april);
    expect(cell.state).toBe("missing");
    expect(cell.title).toMatch(/was ever created/);
  });

  it("is not a miss when another professional did it", () => {
    const cell = cellFor(null, NOW, april, {
      reason: "other-professional",
      note: "filed by their earlier CA",
      recordedByName: "Ritika Chandra",
    });
    expect(cell.state).toBe("explained");
    expect(cell.label).toBe("E");
    expect(cell.title).toBe(
      "Handled by another professional — filed by their earlier CA (Ritika Chandra)",
    );
  });

  it("is not a miss when the client was not with us", () => {
    const cell = cellFor(null, NOW, april, { reason: "not-engaged" });
    expect(cell.state).toBe("explained");
    expect(cell.label).toBe("NE");
    expect(cell.title).toBe("Not engaged for this period");
  });

  it("does not explain away a period that is not even due", () => {
    const march = periodsInYear("monthly", 2027)[11];
    // a reason on a future period is meaningless, and future wins
    expect(cellFor(null, NOW, march, { reason: "not-engaged" }).state).toBe(
      "future",
    );
  });

  it("does not explain away work that exists", () => {
    const engagement = { status: "In progress", milestones: [] };
    expect(
      cellFor(engagement, NOW, april, { reason: "not-engaged" }).state,
    ).toBe("open");
  });

  it("takes the explained periods out of the count, and names them", () => {
    const periods = periodsInYear("monthly", 2026).slice(0, 3);
    const grid = buildGrid({
      clients: [{ id: "c1", name: "Ravi Textiles" }],
      engagements: [],
      periods,
      reasons: [
        { clientId: "c1", period: periods[0].code, reason: "not-engaged" },
        {
          clientId: "c1",
          period: periods[1].code,
          reason: "other-professional",
        },
      ],
      now: NOW,
    });

    // three past months, two answered for, one still nobody's
    expect(grid.totalMissing).toBe(1);
    expect(grid.totalExplained).toBe(2);
    expect(grid.rows[0].missing).toBe(1);
    expect(grid.rows[0].cells.map((c) => c.state)).toEqual([
      "explained",
      "explained",
      "missing",
    ]);
  });

  it("keys a reason to one client, service and period and no other", () => {
    const periods = periodsInYear("monthly", 2026).slice(0, 1);
    const grid = buildGrid({
      clients: [
        { id: "c1", name: "Ravi Textiles" },
        { id: "c2", name: "Jaiswal Steels" },
      ],
      engagements: [],
      periods,
      // the reason belongs to c1; c2's identical period is untouched
      reasons: [
        { clientId: "c1", period: periods[0].code, reason: "not-engaged" },
      ],
      now: NOW,
    });

    expect(grid.rows[0].cells[0].state).toBe("explained");
    expect(grid.rows[1].cells[0].state).toBe("missing");
    expect(grid.totalMissing).toBe(1);
  });
});
