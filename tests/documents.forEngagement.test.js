import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

/**
 * One job, one answer (P3-48b, brief §7).
 *
 * The job's Files tab and the job's folder in the work drive must show the
 * same set. Before this they were two queries in two files, and the folder
 * was about to become a third — which is how a reviewer signs off what one
 * screen showed while another screen holds one more paper.
 *
 * So the test is a comparison, not an assertion about a number: whatever
 * `filesForEngagement` gives the tab, `listChildren` must give the folder.
 */

/** @type {{ stop: () => Promise<unknown> }} */
let mongod;
/** @type {typeof import("../lib/documents/forEngagement.js")} */ let forJob;
/** @type {typeof import("../lib/folders/resolve.js")} */ let resolve;
/** @type {typeof import("../lib/folders/list.js")} */ let list;

const PARTNER = {
  id: "66b1f2a4c9d0e1f2a3b4c5d6",
  role: "partner",
  name: "A partner",
  branchIds: [],
};

const ids = {
  client: new mongoose.Types.ObjectId(),
  service: new mongoose.Types.ObjectId(),
  job: new mongoose.Types.ObjectId(),
  branch: new mongoose.Types.ObjectId(),
  item: new mongoose.Types.ObjectId(),
  onJob: new mongoose.Types.ObjectId(),
  checklistAnswer: new mongoose.Types.ObjectId(),
  panCard: new mongoose.Types.ObjectId(),
  otherPermanent: new mongoose.Types.ObjectId(),
  firmPolicy: new mongoose.Types.ObjectId(),
  letter: new mongoose.Types.ObjectId(),
};

const segments = [
  "clients",
  `c-${ids.client}`,
  "svc",
  `s-${ids.service}`,
  "fy-2025-26",
  `e-${ids.job}`,
];

beforeAll(async () => {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("phmg-job-files");

  forJob = await import("../lib/documents/forEngagement.js");
  resolve = await import("../lib/folders/resolve.js");
  list = await import("../lib/folders/list.js");

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;

  await db.collection("clients").insertOne({
    _id: ids.client,
    code: "PHMG-NOI-0007",
    legalName: "Ryan Medihub Private Limited",
    tradeName: "Ryan Medihub",
    branchId: ids.branch,
    deletedAt: null,
  });
  await db.collection("servicetemplates").insertOne({
    _id: ids.service,
    name: "GSTR 3B",
    code: "GSTR3B",
    category: "GST",
    deletedAt: null,
  });
  await db.collection("engagements").insertOne({
    _id: ids.job,
    code: "NOI-GSTR3B-2025-10-0412",
    clientId: ids.client,
    serviceTemplateId: ids.service,
    periodStart: new Date("2025-10-01T00:00:00Z"),
    periodLabel: "Oct 2025",
    status: "In progress",
    branchId: ids.branch,
    templateSnapshot: { name: "GSTR 3B" },
    // the item is answered by the client's PAN card, which lives elsewhere
    checklist: [
      {
        _id: ids.item,
        name: "PAN card",
        side: "client",
        status: "Received",
        documentIds: [ids.panCard, ids.checklistAnswer],
      },
    ],
    deletedAt: null,
  });

  const base = {
    size: 100,
    mime: "application/pdf",
    checksum: "x",
    deletedAt: null,
    createdAt: new Date("2025-10-10T00:00:00Z"),
    clientId: ids.client,
    zone: "client",
  };

  await db.collection("documents").insertMany([
    {
      ...base,
      _id: ids.onJob,
      name: "Sales register.pdf",
      fileKey: "clients/x/1.pdf",
      engagementId: ids.job,
    },
    {
      ...base,
      _id: ids.checklistAnswer,
      name: "Purchase register.pdf",
      fileKey: "clients/x/2.pdf",
      engagementId: ids.job,
      checklistItemId: ids.item,
    },
    {
      ...base,
      _id: ids.panCard,
      name: "PAN card.pdf",
      fileKey: "clients/x/permanent/3.pdf",
      engagementId: null,
      isPermanent: true,
    },
    {
      ...base,
      _id: ids.otherPermanent,
      name: "Incorporation certificate.pdf",
      fileKey: "clients/x/permanent/4.pdf",
      engagementId: null,
      isPermanent: true,
    },
    {
      // the firm's own paper, which is nobody's job
      ...base,
      _id: ids.firmPolicy,
      name: "Office leave policy.pdf",
      fileKey: "firm/2026/5.pdf",
      zone: "firm",
      clientId: null,
      engagementId: ids.job,
    },
  ]);

  await db.collection("generateddocs").insertOne({
    _id: ids.letter,
    templateId: new mongoose.Types.ObjectId(),
    templateName: "Engagement letter",
    templateVersion: 1,
    clientId: ids.client,
    engagementId: ids.job,
    branchId: ids.branch,
    state: "final",
    issuedByName: "A partner",
    issuedAt: new Date("2025-10-11T00:00:00Z"),
    createdAt: new Date("2025-10-11T00:00:00Z"),
    deletedAt: null,
  });
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

describe("what one job holds", () => {
  it("has the files uploaded against it", async () => {
    const set = await forJob.filesForEngagement(PARTNER, String(ids.job));
    expect(set.files.map((r) => r.name).sort()).toEqual([
      "Purchase register.pdf",
      "Sales register.pdf",
    ]);
  });

  it("marks the permanent file it rests on as linked, not as its own", async () => {
    const set = await forJob.filesForEngagement(PARTNER, String(ids.job));

    expect(set.linked).toHaveLength(1);
    expect(set.linked[0].name).toBe("PAN card.pdf");
    expect(set.linked[0].linked).toBe(true);
    expect(set.linked[0].from).toBe("From the permanent file");
    // a file already on the job is not also a link to itself
    expect(set.linked.map((r) => r.id)).not.toContain(
      String(ids.checklistAnswer),
    );
  });

  it("leaves out a permanent file no step asked for", async () => {
    const set = await forJob.filesForEngagement(PARTNER, String(ids.job));
    const names = [...set.files, ...set.linked].map((r) => r.name);
    expect(names).not.toContain("Incorporation certificate.pdf");
  });

  it("leaves out the firm's own paper even when it names the job", async () => {
    const set = await forJob.filesForEngagement(PARTNER, String(ids.job));
    const names = [...set.files, ...set.linked].map((r) => r.name);
    expect(names).not.toContain("Office leave policy.pdf");
  });

  it("carries the letters written from templates", async () => {
    const set = await forJob.filesForEngagement(PARTNER, String(ids.job));
    expect(set.letters).toHaveLength(1);
    expect(set.letters[0].name).toBe("Engagement letter");
    expect(set.letters[0].final).toBe(true);
  });
});

describe("the Files tab and the job's folder", () => {
  it("show exactly the same set", async () => {
    const set = await forJob.filesForEngagement(PARTNER, String(ids.job));
    const onTheTab = [...set.files, ...set.linked, ...set.udin, ...set.samples]
      .map((r) => r.id)
      .sort();

    const node = await resolve.resolveNode(PARTNER, segments);
    expect(node.ok).toBe(true);
    const inTheFolder = await list.listChildren(PARTNER, node);

    expect(inTheFolder.files.map((r) => r.id).sort()).toEqual(onTheTab);
    expect(inTheFolder.letters.map((r) => r.id)).toEqual([String(ids.letter)]);
  });

  it("refuses somebody who may not see the job's files", async () => {
    const outsider = {
      id: "66b1f2a4c9d0e1f2a3b4c5d9",
      role: "intern",
      name: "An intern",
      branchIds: [],
    };
    const set = await forJob.filesForEngagement(outsider, String(ids.job));
    expect(set.error).toBeTruthy();
    expect(set.files).toBeUndefined();
  });
});
