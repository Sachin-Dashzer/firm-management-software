import { describe, it, expect } from "vitest";
import {
  checkName,
  checkPlace,
  checkMove,
  suggestName,
  fyChoices,
  MAX_FOLDER_DEPTH,
} from "../lib/folders/rules.js";

/**
 * What a folder may be called and where it may go (P3-48c).
 *
 * Pure, so these run without a database — and the actions call exactly
 * these functions, so a rule proved here is the rule the server applies.
 */

const node = (type) => ({ type });

describe("a folder's name", () => {
  it("takes an ordinary name", () => {
    expect(checkName(" Bank statements ")).toEqual({
      ok: true,
      name: "Bank statements",
    });
  });

  it("refuses an empty one", () => {
    expect(checkName("   ").ok).toBe(false);
    expect(checkName("").error).toMatch(/needs a name/);
  });

  it("stops at 80 characters", () => {
    expect(checkName("a".repeat(80)).ok).toBe(true);
    expect(checkName("a".repeat(81)).ok).toBe(false);
  });

  it("refuses the characters a path would eat", () => {
    for (const bad of [
      "bank/statements",
      "bank\\statements",
      "a:b",
      "a*b",
      "a?b",
      'a"b',
      "a<b",
      "a>b",
      "a|b",
    ])
      expect(checkName(bad).ok, bad).toBe(false);
  });

  it("refuses dots that mean something else", () => {
    expect(checkName(".").ok).toBe(false);
    expect(checkName("..").ok).toBe(false);
    expect(checkName(".hidden").ok).toBe(false);
    expect(checkName("name.").ok).toBe(false);
    // a dot in the middle is just a name
    expect(checkName("A.G. Enterprises").ok).toBe(true);
  });

  it("keeps the drive's own names at the level that uses them", () => {
    expect(checkName("Clients", { parentType: "root" }).ok).toBe(false);
    expect(checkName("hq", { parentType: "root" }).ok).toBe(false);
    expect(checkName("Permanent file", { parentType: "client" }).ok).toBe(
      false,
    );
    expect(checkName("Services", { parentType: "client" }).ok).toBe(false);
    // the same words are fine where the drive does not use them
    expect(checkName("Clients", { parentType: "folder" }).ok).toBe(true);
  });

  it("refuses a name a sibling already has, whatever the case", () => {
    const taken = { siblings: ["Bank statements", "Correspondence"] };
    const out = checkName("bank statements", taken);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/already here/);
    expect(out.suggest).toBe("bank statements (2)");
  });

  it("suggests the next free number", () => {
    const siblings = ["Bank statements", "Bank statements (2)"];
    expect(suggestName("Bank statements", siblings)).toBe(
      "Bank statements (3)",
    );
    expect(suggestName("Letters", siblings)).toBe("Letters");
  });
});

describe("where a folder may be made", () => {
  it("allows the levels that are not records", () => {
    for (const type of [
      "root",
      "my",
      "hq",
      "client",
      "fy",
      "engagement",
      "folder",
    ])
      expect(checkPlace(node(type)).ok, type).toBe(true);
  });

  it("refuses the levels that are records", () => {
    for (const type of ["clients", "services", "svc", "service", "permanent"]) {
      const out = checkPlace(node(type));
      expect(out.ok, type).toBe(false);
      expect(out.error).toMatch(/come from the records/);
    }
  });

  it("stops at the depth limit", () => {
    expect(checkPlace(node("folder"), MAX_FOLDER_DEPTH - 1).ok).toBe(true);
    const out = checkPlace(node("folder"), MAX_FOLDER_DEPTH);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/stop at 8 deep/);
  });
});

describe("where a folder may move to", () => {
  const folder = {
    _id: "f1",
    zone: "client",
    clientId: "c1",
    ancestors: [],
  };
  const to = (context, type = "folder") => ({
    node: node(type),
    context: { zone: "client", clientId: "c1", folderIds: [], ...context },
  });

  it("moves within the same client", () => {
    expect(checkMove(folder, to({ folderIds: ["f2"] })).ok).toBe(true);
  });

  it("never moves to another client", () => {
    const out = checkMove(folder, to({ clientId: "c2" }));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/another client/);
  });

  it("never moves between the zones", () => {
    const out = checkMove(folder, to({ zone: "firm", clientId: null }, "hq"));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/My Docs, HQ and a client/);
  });

  it("never moves inside itself", () => {
    const out = checkMove(folder, to({ folderIds: ["f2", "f1"] }));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/inside itself/);
  });

  it("refuses a move that would be too deep", () => {
    const deep = Array.from(
      { length: MAX_FOLDER_DEPTH - 1 },
      (_, i) => `x${i}`,
    );
    // the folder carries two levels of its own below it
    const out = checkMove(folder, to({ folderIds: deep }), 2);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/more than 8 deep/);
  });

  it("refuses a move onto a level that holds only records", () => {
    expect(checkMove(folder, to({}, "service")).ok).toBe(false);
  });
});

describe("the years a service offers", () => {
  it("offers the next year, this one and six back", () => {
    const years = fyChoices("FY2026-27");
    expect(years[0]).toBe("FY2027-28");
    expect(years).toContain("FY2026-27");
    expect(years).toContain("FY2020-21");
    expect(years).toHaveLength(8);
  });

  it("leaves out a year that is already there", () => {
    const years = fyChoices("FY2026-27", ["FY2026-27", "FY2025-26"]);
    expect(years).not.toContain("FY2026-27");
    expect(years).not.toContain("FY2025-26");
    expect(years).toHaveLength(6);
  });

  it("offers nothing for a year it cannot read", () => {
    expect(fyChoices("2026-27")).toEqual([]);
    expect(fyChoices("")).toEqual([]);
  });
});
