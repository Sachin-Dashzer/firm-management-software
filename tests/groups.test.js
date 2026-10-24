import { describe, it, expect } from "vitest";
import { engagementQuery } from "../lib/engagements/filter.js";
import { can } from "../lib/permissions.js";

/**
 * Groups (P2-11): one owner, several businesses, each business its own client
 * record because each has its own PAN.
 *
 * The rollup itself reads four collections, so it belongs to the Playwright
 * flow. What is testable here is the part that could leak: the group filter
 * arrives from the URL, and it must only ever narrow what a role may see.
 */

const NOW = new Date(Date.UTC(2026, 9, 24, 6, 0));

const partner = { id: "p1", role: "partner", branchIds: ["noi", "del"] };
const ca = { id: "c1", role: "ca", branchIds: ["noi"] };
const employee = { id: "e1", role: "employee", branchIds: ["noi"] };
const intern = { id: "i1", role: "intern", branchIds: ["noi"] };

describe("the group filter narrows and never widens", () => {
  it("holds the list to the businesses of the group", () => {
    const query = engagementQuery(
      partner,
      { clientIds: ["b1", "b2", "b3"] },
      NOW,
    );
    expect(query.clientId).toEqual({ $in: ["b1", "b2", "b3"] });
  });

  it("matches nothing when the person may see none of the businesses", () => {
    // the empty list is the whole point: `{ $in: [] }` matches nothing,
    // where dropping the condition would quietly show the firm
    const query = engagementQuery(intern, { clientIds: [] }, NOW);
    expect(query.clientId).toEqual({ $in: [] });
  });

  it("leaves the branch scope in place for a CA", () => {
    const query = engagementQuery(ca, { clientIds: ["b1"] }, NOW);
    expect(query.branchId).toEqual({ $in: ["noi"] });
    expect(query.clientId).toEqual({ $in: ["b1"] });
  });

  it("leaves own-work scoping in place for an employee", () => {
    const query = engagementQuery(employee, { clientIds: ["b1", "b2"] }, NOW);
    expect(query.$or).toEqual([{ assigneeId: "e1" }, { reviewerId: "e1" }]);
    expect(query.clientId).toEqual({ $in: ["b1", "b2"] });
  });

  it("still hides closed work unless it is asked for", () => {
    const open = engagementQuery(partner, { clientIds: ["b1"] }, NOW);
    expect(open.status).toEqual({ $nin: ["Completed", "Cancelled"] });
  });

  it("ignores a group id that was not resolved to businesses first", () => {
    // the page resolves `group` through `clientIdsInGroup`, which applies
    // the client scope; a raw `group` param must not reach the query
    const query = engagementQuery(partner, { group: "g1" }, NOW);
    expect(query.clientId).toBeUndefined();
    expect(query.group).toBeUndefined();
  });
});

describe("money on the group screens", () => {
  it("is read only by the roles that may see invoices", () => {
    // what `groupRollup` gates the outstanding columns on
    expect(can(partner, "view", "invoices")).toBe(true);
    expect(can(ca, "view", "invoices")).toBe(true);
    expect(can(employee, "view", "invoices")).toBe(false);
    expect(can(intern, "view", "invoices")).toBe(false);
  });

  it("does not stop those roles opening the group itself", () => {
    expect(can(employee, "view", "clients")).toBe(true);
    expect(can(intern, "view", "clients")).toBe(true);
  });
});
