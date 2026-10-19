import { describe, it, expect } from "vitest";
import { engagementQuery, dueRange } from "../lib/engagements/filter.js";
import { startOfISTDay } from "../lib/dates.js";

/**
 * The filter builder is shared by the list screen and the CSV export, so
 * these tests are really about one promise: what you see is what you
 * download, and neither can show you more than your role allows.
 */

const NOW = new Date(Date.UTC(2026, 9, 16, 6, 0)); // 16 Oct 2026, a Friday

const partner = { id: "p1", role: "partner", branchIds: ["noi", "del"] };
const ca = { id: "c1", role: "ca", branchIds: ["noi"] };
const employee = { id: "e1", role: "employee", branchIds: ["noi"] };
const intern = { id: "i1", role: "intern", branchIds: ["noi"] };

describe("scope comes first", () => {
  it("lets a partner see every branch", () => {
    expect(engagementQuery(partner, {}, NOW).branchId).toBeUndefined();
  });

  it("holds a CA to their own branches", () => {
    expect(engagementQuery(ca, {}, NOW).branchId).toEqual({ $in: ["noi"] });
  });

  it("holds an employee to their own work, whatever the URL says", () => {
    const query = engagementQuery(employee, { assignee: "someone-else" }, NOW);
    expect(query.$or).toEqual([{ assigneeId: "e1" }, { reviewerId: "e1" }]);
    // the assignee filter from the URL is not allowed to widen it
    expect(query.assigneeId).toBeUndefined();
  });

  it("holds an intern to their own work too", () => {
    expect(engagementQuery(intern, {}, NOW).$or).toEqual([
      { assigneeId: "i1" },
      { reviewerId: "i1" },
    ]);
  });

  it("lets a partner filter by one person", () => {
    expect(engagementQuery(partner, { assignee: "e1" }, NOW).assigneeId).toBe(
      "e1",
    );
  });

  it("honours 'only mine' for a partner", () => {
    expect(engagementQuery(partner, { mine: "1" }, NOW).$or).toEqual([
      { assigneeId: "p1" },
      { reviewerId: "p1" },
    ]);
  });
});

describe("the ordinary filters", () => {
  it("hides closed work unless it is asked for", () => {
    expect(engagementQuery(partner, {}, NOW).status).toEqual({
      $nin: ["Completed", "Cancelled"],
    });
    expect(
      engagementQuery(partner, { closed: "1" }, NOW).status,
    ).toBeUndefined();
  });

  it("lets one named status win over the open-work default", () => {
    expect(engagementQuery(partner, { status: "Completed" }, NOW).status).toBe(
      "Completed",
    );
  });

  it("passes service, period, branch and priority straight through", () => {
    const query = engagementQuery(
      partner,
      {
        service: "tpl1",
        period: "2026-10",
        branch: "noi",
        priority: "Urgent",
      },
      NOW,
    );
    expect(query.serviceTemplateId).toBe("tpl1");
    expect(query.period).toBe("2026-10");
    expect(query.branchId).toBe("noi");
    expect(query.priority).toBe("Urgent");
  });
});

describe("due dates", () => {
  it("treats overdue as anything before today in IST", () => {
    expect(dueRange("overdue", NOW)).toEqual({ $lt: startOfISTDay(NOW) });
  });

  it("knows today, the week and the month", () => {
    expect(dueRange("today", NOW).$gte).toEqual(startOfISTDay(NOW));
    expect(dueRange("week", NOW).$lt.getTime()).toBe(
      startOfISTDay(NOW).getTime() + 7 * 86_400_000,
    );
    expect(dueRange("month", NOW).$lt.getTime()).toBe(
      startOfISTDay(NOW).getTime() + 30 * 86_400_000,
    );
  });

  it("ignores a due filter it does not recognise", () => {
    expect(dueRange("someday", NOW)).toBeNull();
    expect(
      engagementQuery(partner, { due: "someday" }, NOW).$and,
    ).toBeUndefined();
  });

  it("uses the statutory date where there is one, the internal date otherwise", () => {
    const query = engagementQuery(partner, { due: "overdue" }, NOW);
    expect(query.$and[0].$or).toEqual([
      { statutoryDue: { $lt: startOfISTDay(NOW) } },
      { statutoryDue: null, internalDue: { $lt: startOfISTDay(NOW) } },
    ]);
  });
});
