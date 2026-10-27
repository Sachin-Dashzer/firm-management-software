import { describe, it, expect } from "vitest";
import {
  readView,
  viewBranch,
  viewIsMine,
  viewLabel,
  outsideViewNote,
  VIEW_ALL,
  VIEW_MINE,
} from "../lib/access/view.js";
import { branchFilter } from "../lib/permissions.js";
import { engagementQuery } from "../lib/engagements/filter.js";

/**
 * Access versus view (P3-7).
 *
 * One property matters more than all the rest and every test here is about
 * it: **a view never widens access.** The selector is a filter on reading.
 * If it could ever add a branch, it would be a permission control wearing a
 * dropdown's clothes, and the thing spec §2 is most careful about would have
 * been handed to the person it is meant to restrain.
 *
 * So the cookie is treated as hostile input throughout: the worst a
 * hand-edited one may do is show you less than you are allowed.
 */

const NOI = "aaaaaaaaaaaaaaaaaaaaaaa1";
const LDH = "aaaaaaaaaaaaaaaaaaaaaaa2";
const MRT = "aaaaaaaaaaaaaaaaaaaaaaa3";

const manager = { id: "u-ca", role: "ca", branchIds: [NOI, LDH] };
const partner = { id: "u-rg", role: "partner", branchIds: [NOI] };
const employee = { id: "u-neha", role: "employee", branchIds: [NOI] };

describe("a view is validated against the account, not trusted", () => {
  it("accepts a branch the person is assigned to", () => {
    expect(readView(LDH, manager)).toBe(LDH);
  });

  it("discards a branch they are not assigned to", () => {
    // the whole point: a cookie cannot add Meerut to a Noida account
    expect(readView(MRT, manager)).toBe(VIEW_ALL);
    expect(readView(MRT, employee)).toBe(VIEW_ALL);
  });

  it("discards nonsense", () => {
    for (const bad of [
      "",
      null,
      undefined,
      "   ",
      "{}",
      "all; drop",
      "../..",
    ]) {
      expect(readView(bad, manager)).toBe(VIEW_ALL);
    }
  });

  it("lets a partner narrow to any real branch, because they see them all", () => {
    expect(readView(MRT, partner)).toBe(MRT);
    expect(readView("not-an-id", partner)).toBe(VIEW_ALL);
  });

  it("knows the two views that are not branches", () => {
    expect(readView(VIEW_MINE, employee)).toBe(VIEW_MINE);
    expect(viewIsMine(VIEW_MINE)).toBe(true);
    expect(viewBranch(VIEW_MINE)).toBe(null);
    expect(viewBranch(VIEW_ALL)).toBe(null);
    expect(viewBranch(LDH)).toBe(LDH);
  });
});

describe("the query a view produces", () => {
  it("narrows a manager to one of their branches", () => {
    const wide = branchFilter({ ...manager, view: VIEW_ALL }, "clients");
    expect(wide).toEqual({ branchId: { $in: [NOI, LDH] } });

    const one = branchFilter({ ...manager, view: LDH }, "clients");
    expect(one).toEqual({ branchId: LDH });
  });

  it("narrows a partner, who is otherwise unfiltered", () => {
    expect(branchFilter({ ...partner, view: VIEW_ALL }, "clients")).toBe(null);
    expect(branchFilter({ ...partner, view: MRT }, "clients")).toEqual({
      branchId: MRT,
    });
  });

  it("never widens, even if a bad view reaches it", () => {
    // readView would have discarded this; the filter refuses it anyway
    const filter = branchFilter({ ...manager, view: MRT }, "clients");
    expect(filter).toEqual({ branchId: { $in: [NOI, LDH] } });
    expect(JSON.stringify(filter)).not.toContain(MRT);
  });

  it("leaves an area the person cannot see alone", () => {
    // accounts has no engagements at all; the view does not grant them any
    const accounts = { id: "u-acc", role: "accounts", branchIds: [NOI] };
    expect(branchFilter({ ...accounts, view: NOI }, "engagementsWork")).toEqual(
      {
        branchId: NOI,
      },
    );
  });

  it("does nothing at all without a view — the runner has no cookie", () => {
    expect(branchFilter(manager, "clients")).toEqual({
      branchId: { $in: [NOI, LDH] },
    });
  });
});

describe('"my work across branches"', () => {
  it("returns the jobs you prepare or review, inside your access", () => {
    const query = engagementQuery({ ...manager, view: VIEW_MINE }, {});
    expect(query.$or).toEqual([
      { assigneeId: manager.id },
      { reviewerId: manager.id },
    ]);
    // and still only their branches: the view narrowed, it did not replace
    expect(query.branchId).toEqual({ $in: [NOI, LDH] });
  });

  it("is not the same as one branch", () => {
    const branchOnly = engagementQuery({ ...manager, view: LDH }, {});
    expect(branchOnly.$or).toBeUndefined();
    expect(branchOnly.branchId).toBe(LDH);
  });

  it("changes nothing for an employee, who only ever saw their own", () => {
    const wide = engagementQuery({ ...employee, view: VIEW_ALL }, {});
    const mine = engagementQuery({ ...employee, view: VIEW_MINE }, {});
    expect(wide.$or).toEqual(mine.$or);
  });
});

describe("what the screen says about the view", () => {
  const branches = [
    { id: NOI, name: "Noida (head office)" },
    { id: LDH, name: "Ludhiana" },
  ];

  it("names the current view", () => {
    expect(viewLabel(VIEW_ALL, branches)).toBe("All my branches");
    expect(viewLabel(LDH, branches)).toBe("Ludhiana");
    expect(viewLabel(VIEW_MINE, branches)).toBe("My work across branches");
  });

  it("explains a record that the view would have hidden", () => {
    const note = outsideViewNote(LDH, NOI, branches);
    expect(note).toMatch(/You are viewing Ludhiana/);
    expect(note).toMatch(/belongs to Noida/);
    expect(note).toMatch(/opened it directly/);
  });

  it("says nothing when the record is inside the view", () => {
    expect(outsideViewNote(LDH, LDH, branches)).toBe(null);
    expect(outsideViewNote(VIEW_ALL, NOI, branches)).toBe(null);
    // "my work" is not a branch, so a branch cannot be outside it
    expect(outsideViewNote(VIEW_MINE, NOI, branches)).toBe(null);
  });
});
