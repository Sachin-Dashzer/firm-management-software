import { describe, it, expect } from "vitest";
import {
  parseSegment,
  parsePath,
  anchorFor,
  urlFor,
  fySegment,
  fyLabel,
  canHoldFolders,
  MAX_FOLDER_DEPTH,
} from "../lib/folders/paths.js";

/**
 * The drive's addresses (P3-48b).
 *
 * This is the first thing a URL meets, so the tests that matter are the
 * refusals: a path this app would never write must come back null and be a
 * 404, not a best guess at what somebody meant.
 */

const A = "66a1f2a4c9d0e1f2a3b4c5d6";
const S = "65f1f2a4c9d0e1f2a3b4c5d7";
const E = "6701f2a4c9d0e1f2a3b4c5d8";
const F = "6711f2a4c9d0e1f2a3b4c5d9";

describe("one segment", () => {
  it("reads the words that stand for themselves", () => {
    for (const word of ["my", "hq", "clients", "services", "svc", "permanent"])
      expect(parseSegment(word)).toEqual({ type: word });
  });

  it("reads a record by its prefix", () => {
    expect(parseSegment(`c-${A}`)).toEqual({ type: "client", id: A });
    expect(parseSegment(`s-${S}`)).toEqual({ type: "service", id: S });
    expect(parseSegment(`e-${E}`)).toEqual({ type: "engagement", id: E });
    expect(parseSegment(`f-${F}`)).toEqual({ type: "folder", id: F });
  });

  it("reads a year, and not as a folder called y-2025-26", () => {
    expect(parseSegment("fy-2025-26")).toEqual({
      type: "fy",
      fy: "FY2025-26",
    });
  });

  it("refuses anything else", () => {
    for (const bad of [
      "",
      "Clients",
      "c-not-an-id",
      "c-",
      "x-66a1f2a4c9d0e1f2a3b4c5d6",
      "../etc/passwd",
      "fy-25-26",
      "fy-2025-2026",
      `c-${A}extra`,
      "%2e%2e",
    ])
      expect(parseSegment(bad), bad).toBeNull();
  });
});

describe("the two routes to one place", () => {
  const byClient = parsePath([
    "clients",
    `c-${A}`,
    "svc",
    `s-${S}`,
    "fy-2025-26",
    `e-${E}`,
  ]);
  const byService = parsePath([
    "services",
    `s-${S}`,
    `c-${A}`,
    "fy-2025-26",
    `e-${E}`,
  ]);

  it("both read the same context", () => {
    expect(byClient?.context).toEqual(byService?.context);
    expect(byClient?.context).toEqual({
      route: "clients",
      zone: "client",
      clientId: A,
      serviceTemplateId: S,
      fy: "FY2025-26",
      engagementId: E,
      folderId: null,
      permanent: false,
    });
  });

  /**
   * The point of the anchor: a folder made while browsing by service is
   * found while browsing by client, because both stored the same string.
   */
  it("both anchor to the canonical clients path", () => {
    const anchor = `clients/c-${A}/svc/s-${S}/fy-2025-26/e-${E}`;
    expect(anchorFor(byClient?.context ?? {})).toBe(anchor);
    expect(anchorFor(byService?.context ?? {})).toBe(anchor);
  });

  it("links to the canonical route whichever way you came", () => {
    expect(urlFor(byService?.context ?? {})).toBe(
      `/documents/folders/clients/c-${A}/svc/s-${S}/fy-2025-26/e-${E}`,
    );
  });
});

describe("the levels of a path", () => {
  it("reads Home", () => {
    const home = parsePath([]);
    expect(home?.node.type).toBe("root");
    expect(urlFor(home?.context ?? {})).toBe("/documents/folders");
  });

  it("reads each zone", () => {
    expect(parsePath(["my"])?.context.zone).toBe("personal");
    expect(parsePath(["hq"])?.context.zone).toBe("firm");
    expect(parsePath(["clients"])?.context.zone).toBe("client");
  });

  it("reads a client, its permanent file and its services", () => {
    expect(parsePath(["clients", `c-${A}`])?.node.type).toBe("client");
    expect(
      parsePath(["clients", `c-${A}`, "permanent"])?.context.permanent,
    ).toBe(true);
    expect(parsePath(["clients", `c-${A}`, "svc"])?.node.type).toBe("svc");
    expect(
      parsePath(["clients", `c-${A}`, "svc", `s-${S}`])?.context
        .serviceTemplateId,
    ).toBe(S);
  });

  it("carries the folder chain, deepest last", () => {
    const path = parsePath(["hq", `f-${F}`, `f-${A}`]);
    expect(path?.folderIds).toEqual([F, A]);
    expect(path?.context.folderId).toBe(A);
    expect(path?.node.type).toBe("folder");
  });

  it("refuses a record straight off Home", () => {
    expect(parsePath([`c-${A}`])).toBeNull();
    expect(parsePath([`s-${S}`])).toBeNull();
    expect(parsePath(["fy-2025-26"])).toBeNull();
  });

  it("refuses the levels in the wrong order", () => {
    expect(parsePath(["clients", `e-${E}`])).toBeNull();
    expect(parsePath(["clients", `c-${A}`, `s-${S}`])).toBeNull();
    expect(parsePath(["clients", `c-${A}`, "svc", "fy-2025-26"])).toBeNull();
    expect(parsePath(["services", `c-${A}`, `s-${S}`])).toBeNull();
    expect(parsePath(["my", `c-${A}`])).toBeNull();
  });

  it("refuses a folder where only records belong", () => {
    expect(parsePath(["clients", `f-${F}`])).toBeNull();
    expect(parsePath(["services", `f-${F}`])).toBeNull();
    expect(parsePath(["clients", `c-${A}`, "svc", `s-${S}`, `f-${F}`])).toBe(
      null,
    );
    expect(parsePath(["clients", `c-${A}`, "permanent", `f-${F}`])).toBeNull();
  });

  it("allows a folder on Home, in a client, a year and a job", () => {
    expect(parsePath([`f-${F}`])?.node.type).toBe("folder");
    expect(parsePath(["clients", `c-${A}`, `f-${F}`])?.context.clientId).toBe(
      A,
    );
    expect(
      parsePath(["clients", `c-${A}`, "svc", `s-${S}`, "fy-2025-26", `f-${F}`])
        ?.context.fy,
    ).toBe("FY2025-26");
    expect(
      parsePath([
        "clients",
        `c-${A}`,
        "svc",
        `s-${S}`,
        "fy-2025-26",
        `e-${E}`,
        `f-${F}`,
      ])?.context.engagementId,
    ).toBe(E);
  });

  it("refuses a chain deeper than the limit", () => {
    const deep = ["hq", ...Array(MAX_FOLDER_DEPTH + 1).fill(`f-${F}`)];
    expect(parsePath(deep)).toBeNull();
    const atLimit = ["hq", ...Array(MAX_FOLDER_DEPTH).fill(`f-${F}`)];
    expect(parsePath(atLimit)).not.toBeNull();
  });
});

describe("anchors and labels", () => {
  it("anchors a folder on Home to the firm, not to nothing", () => {
    expect(anchorFor({ zone: "firm", route: "hq" })).toBe("hq");
    expect(anchorFor({})).toBe("home");
    expect(anchorFor({ zone: "personal" })).toBe("my");
  });

  it("writes and reads the year the same way round", () => {
    expect(fySegment("FY2025-26")).toBe("fy-2025-26");
    expect(fySegment("rubbish")).toBe("");
    expect(fyLabel("FY2025-26")).toBe("FY 2025-26");
  });

  it("knows where folders may be made", () => {
    for (const yes of ["root", "my", "hq", "client", "fy", "engagement"])
      expect(canHoldFolders(yes), yes).toBe(true);
    for (const no of ["clients", "services", "svc", "service", "permanent"])
      expect(canHoldFolders(no), no).toBe(false);
  });
});
