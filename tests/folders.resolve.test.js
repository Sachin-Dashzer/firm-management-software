import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

/**
 * Turning a URL into a node of the work drive (P3-48b).
 *
 * The tests that matter are the refusals. A drive addressed by URL is a
 * drive somebody can hand-edit, and the three ways in are: ask for another
 * client's folder, ask for a job that belongs to somebody else under a
 * client you may see, and ask for a colleague's My Docs. All three must be
 * **not found** — not "not allowed", which would confirm the record exists.
 */

/** @type {{ stop: () => Promise<unknown> }} */
let replset;
/** @type {any} */ let Client;
/** @type {any} */ let ServiceTemplate;
/** @type {any} */ let Engagement;
/** @type {typeof import("../lib/folders/resolve.js")} */ let resolve;

const PARTNER = {
  id: "66b1f2a4c9d0e1f2a3b4c5d6",
  role: "partner",
  name: "A partner",
  branchIds: [],
};
const EMPLOYEE = {
  id: "66b1f2a4c9d0e1f2a3b4c5d7",
  role: "employee",
  name: "An employee",
  branchIds: [],
};

const ids = {
  clientA: new mongoose.Types.ObjectId(),
  clientB: new mongoose.Types.ObjectId(),
  service: new mongoose.Types.ObjectId(),
  other: new mongoose.Types.ObjectId(),
  jobA: new mongoose.Types.ObjectId(),
  jobB: new mongoose.Types.ObjectId(),
  branch: new mongoose.Types.ObjectId(),
};

/** `clients/c-A/svc/s-S/fy-2025-26/e-<job>` as segments. */
const underA = (...rest) => [
  "clients",
  `c-${ids.clientA}`,
  "svc",
  `s-${ids.service}`,
  "fy-2025-26",
  ...rest,
];

beforeAll(async () => {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  process.env.MONGODB_URI = replset.getUri("phmg-folders");

  Client = (await import("../models/Client.js")).default;
  ServiceTemplate = (await import("../models/ServiceTemplate.js")).default;
  Engagement = (await import("../models/Engagement.js")).default;
  resolve = await import("../lib/folders/resolve.js");

  await mongoose.connect(process.env.MONGODB_URI);

  // through the driver: these fixtures are context, not the thing tested
  await mongoose.connection.collection("clients").insertMany([
    {
      _id: ids.clientA,
      code: "PHMG-NOI-0001",
      legalName: "Ryan Medihub Private Limited",
      tradeName: "Ryan Medihub",
      branchId: ids.branch,
      deletedAt: null,
    },
    {
      _id: ids.clientB,
      code: "PHMG-NOI-0002",
      legalName: "Satyam Textiles LLP",
      tradeName: "",
      branchId: ids.branch,
      deletedAt: null,
    },
  ]);
  await mongoose.connection.collection("servicetemplates").insertMany([
    {
      _id: ids.service,
      name: "GSTR 3B",
      code: "GSTR3B",
      category: "GST",
      deletedAt: null,
    },
    {
      _id: ids.other,
      name: "Tax Audit",
      code: "TAR",
      category: "Audit",
      deletedAt: null,
    },
  ]);
  await mongoose.connection.collection("engagements").insertMany([
    {
      _id: ids.jobA,
      code: "NOI-GSTR3B-2025-10-0412",
      clientId: ids.clientA,
      serviceTemplateId: ids.service,
      periodStart: new Date("2025-10-01T00:00:00Z"),
      periodLabel: "Oct 2025",
      status: "Scheduled",
      branchId: ids.branch,
      templateSnapshot: { name: "GSTR 3B" },
      deletedAt: null,
    },
    {
      _id: ids.jobB,
      code: "NOI-GSTR3B-2025-11-0999",
      clientId: ids.clientB,
      serviceTemplateId: ids.service,
      periodStart: new Date("2025-11-01T00:00:00Z"),
      periodLabel: "Nov 2025",
      status: "Scheduled",
      branchId: ids.branch,
      templateSnapshot: { name: "GSTR 3B" },
      deletedAt: null,
    },
  ]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

describe("a path that does not parse", () => {
  it("is not found, before anything is read", async () => {
    for (const bad of [
      ["clients", "c-nonsense"],
      ["clients", `c-${ids.clientA}`, `s-${ids.service}`],
      [`c-${ids.clientA}`],
      ["..", "etc"],
    ]) {
      const out = await resolve.resolveNode(PARTNER, bad);
      expect(out.error, bad.join("/")).toBe("notFound");
    }
  });
});

describe("the records have to agree with each other", () => {
  it("opens a job that is where the path says it is", async () => {
    const out = await resolve.resolveNode(PARTNER, underA(`e-${ids.jobA}`));
    expect(out.ok).toBe(true);
    expect(out.node.type).toBe("engagement");
    expect(out.node.label).toBe("GSTR 3B · Oct 2025");
    expect(out.context.clientId).toBe(String(ids.clientA));
  });

  it("refuses another client's job under this client", async () => {
    const out = await resolve.resolveNode(PARTNER, underA(`e-${ids.jobB}`));
    expect(out.error).toBe("notFound");
  });

  it("refuses the right job under the wrong service", async () => {
    const out = await resolve.resolveNode(PARTNER, [
      "clients",
      `c-${ids.clientA}`,
      "svc",
      `s-${ids.other}`,
      "fy-2025-26",
      `e-${ids.jobA}`,
    ]);
    expect(out.error).toBe("notFound");
  });

  it("refuses the right job in the wrong financial year", async () => {
    const out = await resolve.resolveNode(PARTNER, [
      "clients",
      `c-${ids.clientA}`,
      "svc",
      `s-${ids.service}`,
      "fy-2024-25",
      `e-${ids.jobA}`,
    ]);
    expect(out.error).toBe("notFound");
  });

  it("gives the same node by either route", async () => {
    const byClient = await resolve.resolveNode(
      PARTNER,
      underA(`e-${ids.jobA}`),
    );
    const byService = await resolve.resolveNode(PARTNER, [
      "services",
      `s-${ids.service}`,
      `c-${ids.clientA}`,
      "fy-2025-26",
      `e-${ids.jobA}`,
    ]);

    expect(byService.ok).toBe(true);
    expect(byService.context.engagementId).toBe(byClient.context.engagementId);
    // and the breadcrumb is the way each of them came
    expect(byClient.crumbs.map((c) => c.label)).toEqual([
      "Home",
      "Clients",
      "Ryan Medihub",
      "Services",
      "GSTR 3B",
      "FY 2025-26",
      "Oct 2025",
    ]);
    expect(byService.crumbs.map((c) => c.label)).toEqual([
      "Home",
      "Services",
      "GSTR 3B",
      "Ryan Medihub",
      "FY 2025-26",
      "Oct 2025",
    ]);
  });
});

describe("a folder has to be where it says it is", () => {
  /** @type {any} */ let folder;

  beforeAll(async () => {
    const anchor = `clients/c-${ids.clientA}/svc/s-${ids.service}/fy-2025-26/e-${ids.jobA}`;
    // through the driver: the audit plugin rightly refuses a write
    // outside a transaction, and these rows are fixtures, not the subject
    folder = { _id: new mongoose.Types.ObjectId() };
    await mongoose.connection.collection("folders").insertOne({
      _id: folder._id,
      name: "Working papers",
      nameKey: "working papers",
      kind: "custom",
      zone: "client",
      anchor,
      parentId: null,
      clientId: ids.clientA,
      serviceTemplateId: ids.service,
      fy: "FY2025-26",
      engagementId: ids.jobA,
      branchId: ids.branch,
      ancestors: [],
      depth: 0,
      deletedAt: null,
    });
  });

  it("opens under the path it was made under", async () => {
    const out = await resolve.resolveNode(
      PARTNER,
      underA(`e-${ids.jobA}`, `f-${folder._id}`),
    );
    expect(out.ok).toBe(true);
    expect(out.node.label).toBe("Working papers");
    expect(out.node.system).toBe(false);
  });

  it("is not found under a different path", async () => {
    const out = await resolve.resolveNode(PARTNER, [
      "clients",
      `c-${ids.clientA}`,
      `f-${folder._id}`,
    ]);
    expect(out.error).toBe("notFound");
  });

  it("is not found as somebody's second-level folder", async () => {
    const out = await resolve.resolveNode(
      PARTNER,
      underA(`e-${ids.jobA}`, `f-${folder._id}`, `f-${folder._id}`),
    );
    expect(out.error).toBe("notFound");
  });
});

describe("who may be where", () => {
  it("hides a client an employee holds no grant on", async () => {
    const out = await resolve.resolveNode(EMPLOYEE, [
      "clients",
      `c-${ids.clientA}`,
    ]);
    expect(out.error).toBe("notFound");
  });

  it("keeps a partner out of somebody else's My Docs", async () => {
    const mine = { _id: new mongoose.Types.ObjectId() };
    await mongoose.connection.collection("folders").insertOne({
      _id: mine._id,
      name: "My rough work",
      nameKey: "my rough work",
      kind: "custom",
      zone: "personal",
      anchor: "my",
      parentId: null,
      ownerId: EMPLOYEE.id,
      ancestors: [],
      depth: 0,
      deletedAt: null,
    });

    const owner = await resolve.resolveNode(EMPLOYEE, ["my", `f-${mine._id}`]);
    expect(owner.ok).toBe(true);

    const partner = await resolve.resolveNode(PARTNER, ["my", `f-${mine._id}`]);
    expect(partner.error).toBe("notFound");
  });

  it("lets a partner into HQ and says what may be done there", async () => {
    const out = await resolve.resolveNode(PARTNER, ["hq"]);
    expect(out.ok).toBe(true);
    expect(out.writeRules.folders).toBe(true);
    expect(out.writeRules.upload).toBe(true);
  });

  it("refuses folders at the levels that are records", async () => {
    for (const where of [
      ["clients"],
      ["services"],
      ["clients", `c-${ids.clientA}`, "svc"],
      ["clients", `c-${ids.clientA}`, "svc", `s-${ids.service}`],
      ["clients", `c-${ids.clientA}`, "permanent"],
    ]) {
      const out = await resolve.resolveNode(PARTNER, where);
      expect(out.ok, where.join("/")).toBe(true);
      expect(out.writeRules.folders, where.join("/")).toBe(false);
      expect(out.writeRules.reason, where.join("/")).toMatch(
        /come from the records/,
      );
    }
  });

  it("still lets a file into the permanent file", async () => {
    const out = await resolve.resolveNode(PARTNER, [
      "clients",
      `c-${ids.clientA}`,
      "permanent",
    ]);
    expect(out.writeRules.upload).toBe(true);
    expect(out.writeRules.folders).toBe(false);
  });
});
