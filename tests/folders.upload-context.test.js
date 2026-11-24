import { describe, it, expect } from "vitest";
import { parsePath } from "../lib/folders/paths.js";
import { fieldsFromContext, originFor } from "../lib/folders/place.js";

/**
 * Where an upload lands, by the folder it was dropped into (P3-48c, brief
 * §9.2).
 *
 * The brief gives this as a table. A table in a comment is a claim; this is
 * the table, run. Every row starts from a **real path** rather than a
 * hand-written context, so a change to how a path is read shows up here too.
 */

const CLIENT = "66a1f2a4c9d0e1f2a3b4c5d6";
const SERVICE = "65f1f2a4c9d0e1f2a3b4c5d7";
const JOB = "6701f2a4c9d0e1f2a3b4c5d8";
const FOLDER = "6711f2a4c9d0e1f2a3b4c5d9";
const ME = "66b1f2a4c9d0e1f2a3b4c5d6";
const CLIENT_BRANCH = "6721f2a4c9d0e1f2a3b4c5d1";
const JOB_BRANCH = "6731f2a4c9d0e1f2a3b4c5d2";

/** What the resolver would have loaded for these paths. */
const records = {
  client: { _id: CLIENT, branchId: CLIENT_BRANCH },
  engagement: { _id: JOB, branchId: JOB_BRANCH },
};

/** A path, read and then turned into the fields a `Document` takes. */
function fieldsFor(segments, loaded = records) {
  const path = parsePath(segments);
  expect(path, segments.join("/")).not.toBeNull();
  return fieldsFromContext({
    context: path.context,
    records: loaded,
    actorId: ME,
  });
}

describe("a file dropped into a client's own folder", () => {
  it("belongs to that client, in no job", () => {
    const fields = fieldsFor(["clients", `c-${CLIENT}`], {
      client: records.client,
    });

    expect(fields).toMatchObject({
      zone: "client",
      clientId: CLIENT,
      ownerId: null,
      folderId: null,
      serviceTemplateId: null,
      engagementId: null,
      fy: "",
      isPermanent: false,
      branchId: CLIENT_BRANCH,
    });
  });

  it("carries the folder when it is in one", () => {
    const fields = fieldsFor(["clients", `c-${CLIENT}`, `f-${FOLDER}`], {
      client: records.client,
    });
    expect(fields.folderId).toBe(FOLDER);
    expect(fields.clientId).toBe(CLIENT);
  });
});

describe("the permanent file", () => {
  it("is the client's for ever, and on no job", () => {
    const fields = fieldsFor(["clients", `c-${CLIENT}`, "permanent"], {
      client: records.client,
    });
    expect(fields.isPermanent).toBe(true);
    expect(fields.clientId).toBe(CLIENT);
    expect(fields.engagementId).toBeNull();
  });
});

describe("a year with no job yet", () => {
  it("takes the client, the service and the year", () => {
    const fields = fieldsFor(
      ["clients", `c-${CLIENT}`, "svc", `s-${SERVICE}`, "fy-2025-26"],
      { client: records.client },
    );

    expect(fields).toMatchObject({
      zone: "client",
      clientId: CLIENT,
      serviceTemplateId: SERVICE,
      fy: "FY2025-26",
      engagementId: null,
      branchId: CLIENT_BRANCH,
    });
  });
});

describe("a job", () => {
  const segments = [
    "clients",
    `c-${CLIENT}`,
    "svc",
    `s-${SERVICE}`,
    "fy-2025-26",
    `e-${JOB}`,
  ];

  it("takes the job, its service and its year", () => {
    expect(fieldsFor(segments)).toMatchObject({
      zone: "client",
      clientId: CLIENT,
      serviceTemplateId: SERVICE,
      fy: "FY2025-26",
      engagementId: JOB,
    });
  });

  it("is filed under the job's branch, not the client's", () => {
    expect(fieldsFor(segments).branchId).toBe(JOB_BRANCH);
  });

  it("reaches the same fields by the service route", () => {
    const byService = fieldsFor([
      "services",
      `s-${SERVICE}`,
      `c-${CLIENT}`,
      "fy-2025-26",
      `e-${JOB}`,
    ]);
    expect(byService).toEqual(fieldsFor(segments));
  });

  it("keeps the folder inside a job", () => {
    const fields = fieldsFor([...segments, `f-${FOLDER}`]);
    expect(fields.folderId).toBe(FOLDER);
    expect(fields.engagementId).toBe(JOB);
  });
});

describe("the firm's own files", () => {
  it("belong to no client and no owner", () => {
    for (const segments of [["hq"], ["hq", `f-${FOLDER}`]]) {
      const fields = fieldsFor(segments, {});
      expect(fields.zone, segments.join("/")).toBe("firm");
      expect(fields.clientId).toBeNull();
      expect(fields.ownerId).toBeNull();
      expect(fields.fy).toBe("");
      expect(fields.serviceTemplateId).toBeNull();
    }
  });

  it("includes a folder sitting on Home", () => {
    const fields = fieldsFor([`f-${FOLDER}`], {});
    expect(fields.zone).toBe("firm");
    expect(fields.folderId).toBe(FOLDER);
  });
});

describe("My Docs", () => {
  it("belongs to the person and to nobody else", () => {
    const fields = fieldsFor(["my", `f-${FOLDER}`], {});
    expect(fields).toMatchObject({
      zone: "personal",
      ownerId: ME,
      clientId: null,
      folderId: FOLDER,
    });
  });
});

describe("whose paper it is", () => {
  it("takes the uploader's word under a client", () => {
    expect(originFor("client", "firm")).toBe("firm");
    expect(originFor("client", "client")).toBe("client");
    // anything unrecognised is the client's, as the vault has always had it
    expect(originFor("client", undefined)).toBe("client");
    expect(originFor("client", "nonsense")).toBe("client");
  });

  it("is the firm's where there is no client", () => {
    expect(originFor("firm", "client")).toBe("firm");
    expect(originFor("personal", "client")).toBe("firm");
  });
});
