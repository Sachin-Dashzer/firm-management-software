import { describe, it, expect } from "vitest";
import {
  documentQuery,
  searchClause,
  locationOf,
  FILE_KINDS,
  LOCATIONS,
} from "../lib/documents/filter.js";

/**
 * The file register's filters (P3-48e).
 *
 * One builder serves the screen, the Excel export and the bulk actions, so
 * these cases are about all three at once — and the first of them is the
 * one that matters most: the scope and the zone guard are in the query
 * whatever the URL says, because a filter somebody types must never widen
 * what their role may see.
 */

const ACTOR = { id: "u1", role: "partner", branchIds: [] };
const SCOPE = { clientId: { $in: ["c1", "c2"] } };

describe("what is always true of the query", () => {
  it("carries the caller's scope and the zone guard", () => {
    const { query } = documentQuery(ACTOR, {}, { scope: SCOPE });

    expect(query.clientId).toEqual(SCOPE.clientId);
    expect(query.zone).toEqual({ $nin: ["firm", "personal"] });
  });

  it("keeps the zone guard even when every filter is set", () => {
    const { query } = documentQuery(
      ACTOR,
      {
        client: "c1",
        branch: "b1",
        service: "s1",
        fy: "FY2025-26",
        job: "e1",
        where: "job",
        origin: "firm",
        kind: "PAN card",
        type: "pdf",
        by: "u9",
        shared: "yes",
        versions: "1",
        big: "1",
      },
      { scope: SCOPE },
    );

    expect(query.zone).toEqual({ $nin: ["firm", "personal"] });
  });

  it("asks for nothing it was not given", () => {
    const { query, applied } = documentQuery(ACTOR, {}, {});
    expect(Object.keys(query)).toEqual(["zone"]);
    expect(applied).toEqual([]);
  });
});

describe("one filter at a time", () => {
  const q = (params) => documentQuery(ACTOR, params, {}).query;

  it("narrows to a client, a branch, a service, a year and a job", () => {
    expect(q({ client: "c1" }).clientId).toBe("c1");
    expect(q({ branch: "b1" }).branchId).toBe("b1");
    expect(q({ service: "s1" }).serviceTemplateId).toBe("s1");
    expect(q({ fy: "FY2025-26" }).fy).toBe("FY2025-26");
    expect(q({ job: "e1" }).engagementId).toBe("e1");
  });

  it("reads a group as the businesses in it, and an empty group as none", () => {
    const some = documentQuery(ACTOR, {}, { clientIds: ["c7"] }).query;
    expect(some.clientId).toEqual({ $in: ["c7"] });

    /*
      A group with nothing in it is still a group: the query must match
      nothing, not fall back to every file in the firm. `$in: []` is how
      that is said.
    */
    const none = documentQuery(ACTOR, {}, { clientIds: [] }).query;
    expect(none.clientId).toEqual({ $in: [] });
  });

  it("knows the three places a file sits", () => {
    expect(q({ where: "permanent" }).isPermanent).toBe(true);
    expect(q({ where: "job" }).engagementId).toEqual({ $ne: null });
    expect(q({ where: "loose" })).toMatchObject({
      engagementId: null,
      isPermanent: { $ne: true },
    });
  });

  it("maps a file type to what the mime actually says", () => {
    expect("application/pdf").toMatch(q({ type: "pdf" }).mime);
    expect("image/jpeg").toMatch(q({ type: "image" }).mime);
    expect(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ).toMatch(q({ type: "excel" }).mime);
    expect(q({ type: "nonsense" }).mime).toBeUndefined();
  });

  it("reads a date range as IST days, the last one included", () => {
    const { query } = documentQuery(
      ACTOR,
      { from: "2026-11-01", to: "2026-11-23" },
      {},
    );
    expect(query.createdAt.$gte).toBeInstanceOf(Date);
    // the end is the start of the next day, so the evening of the 23rd is in
    expect(query.createdAt.$lt.getTime() - query.createdAt.$gte.getTime()).toBe(
      23 * 86_400_000,
    );
  });

  it("tells shared from not shared, and leaves it alone otherwise", () => {
    expect(q({ shared: "yes" }).sharedWithClient).toBe(true);
    expect(q({ shared: "no" }).sharedWithClient).toBe(false);
    expect(q({ shared: "" }).sharedWithClient).toBeUndefined();
  });

  it("finds the files with earlier copies, and the big ones", () => {
    expect(q({ versions: "1" })["versions.0"]).toEqual({ $exists: true });
    expect(q({ big: "1" }).size).toEqual({ $gt: 5 * 1024 * 1024 });
  });
});

describe("the chips a person can take off again", () => {
  it("names every filter that is on", () => {
    const { applied } = documentQuery(
      ACTOR,
      { fy: "FY2025-26", where: "permanent", origin: "firm", big: "1" },
      {},
    );
    expect(applied.map((chip) => chip.key)).toEqual([
      "fy",
      "where",
      "origin",
      "big",
    ]);
    expect(applied[0].label).toBe("FY2025-26");
    expect(applied[1].label).toBe(LOCATIONS.permanent);
  });
});

describe("searching", () => {
  it("covers the file's name, its client and the job's code", () => {
    const or = searchClause(/ryan/i, {
      clientIds: ["c1"],
      engagementIds: ["e1"],
    });
    expect(or).toEqual([
      { name: /ryan/i },
      { clientId: { $in: ["c1"] } },
      { engagementId: { $in: ["e1"] } },
    ]);
  });

  it("asks only about the name when nothing else matched", () => {
    expect(searchClause(/x/i, {})).toEqual([{ name: /x/i }]);
  });
});

describe("where the register says a file is", () => {
  it("names the permanent file, the job, and the pile in between", () => {
    expect(locationOf({ isPermanent: true })).toBe(LOCATIONS.permanent);
    expect(
      locationOf(
        { engagementId: "e1" },
        { templateSnapshot: { name: "GSTR 3B" }, periodLabel: "Oct 2025" },
      ),
    ).toBe("GSTR 3B · Oct 2025");
    expect(locationOf({})).toBe(LOCATIONS.loose);
  });

  /** Brief §14, case 2: the job went, the file stayed, and it says so. */
  it("says so when the job it was on has been deleted", () => {
    expect(locationOf({ engagementId: "e1" }, null)).toBe("On a deleted job");
  });
});

describe("the file families", () => {
  it("has a label for each, for the filter and the export", () => {
    for (const [key, family] of Object.entries(FILE_KINDS)) {
      expect(family.label, key).toBeTruthy();
      expect(family.test, key).toBeInstanceOf(RegExp);
    }
  });
});
