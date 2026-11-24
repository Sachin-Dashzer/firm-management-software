import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";

/**
 * Deleting a folder, and getting it back (P3-48c).
 *
 * The two halves have to agree about one thing: **what went down together**.
 * A folder's delete takes its subfolders and every file in them; its restore
 * brings back exactly those, and not a file somebody deleted on its own a
 * week earlier — which is the mistake a naive "restore everything in this
 * folder" makes, and which would quietly undo somebody else's decision.
 *
 * The actions are server actions, so the two things a server action gets
 * from Next — the signed-in person and the request headers — are stubbed.
 * Everything below them is real: a real replica set, real transactions, real
 * audit entries.
 */

const ACTOR = {
  id: "66b1f2a4c9d0e1f2a3b4c5d6",
  name: "A partner",
  role: "partner",
  branchIds: [],
};

vi.mock("@/auth", () => ({ requireUser: async () => ACTOR }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["user-agent", "vitest"]]),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
/** The vault is not here; the record is what this test is about. */
vi.mock("@/lib/storage", () => ({
  remove: async () => ({ ok: true }),
  ALLOWED_TYPES: ["application/pdf"],
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  getUploadTicket: () => ({}),
  getDownloadLink: () => "",
}));

/** @type {{ stop: () => Promise<unknown> }} */
let replset;
/** @type {any} */ let Folder;
/** @type {any} */ let Document;
/** @type {any} */ let actions;

const ids = {
  client: new mongoose.Types.ObjectId(),
  branch: new mongoose.Types.ObjectId(),
};

/** A folder row, written the way the actions write one. */
async function makeFolder(name, { parentId = null, ancestors = [] } = {}) {
  const { insertedId } = await Folder.collection.insertOne({
    _id: new mongoose.Types.ObjectId(),
    name,
    nameKey: name.toLowerCase(),
    kind: "custom",
    zone: "client",
    anchor: `clients/c-${ids.client}`,
    parentId,
    clientId: ids.client,
    serviceTemplateId: null,
    fy: "",
    engagementId: null,
    branchId: ids.branch,
    ancestors,
    depth: ancestors.length,
    deletedAt: null,
    deletedWithFolderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertedId;
}

async function makeFile(name, folderId) {
  const { insertedId } = await Document.collection.insertOne({
    _id: new mongoose.Types.ObjectId(),
    name,
    fileKey: `clients/x/${name}`,
    size: 10,
    mime: "application/pdf",
    checksum: "x",
    clientId: ids.client,
    branchId: ids.branch,
    zone: "client",
    folderId,
    engagementId: null,
    versions: [],
    deletedAt: null,
    deletedWithFolderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertedId;
}

beforeAll(async () => {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  process.env.MONGODB_URI = replset.getUri("phmg-folder-bin");

  Folder = (await import("../models/Folder.js")).default;
  Document = (await import("../models/Document.js")).default;
  actions = await import("../app/(app)/documents/folders/actions.js");

  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.collection("clients").insertOne({
    _id: ids.client,
    code: "PHMG-NOI-0042",
    legalName: "Satyam Textiles LLP",
    tradeName: "",
    branchId: ids.branch,
    deletedAt: null,
  });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

describe("a folder, its subfolders and its files", () => {
  /** @type {any} */ let parent;
  /** @type {any} */ let child;
  /** @type {any} */ let inParent;
  /** @type {any} */ let inChild;
  /** @type {any} */ let deletedEarlier;

  beforeAll(async () => {
    parent = await makeFolder("Bank statements");
    child = await makeFolder("April", {
      parentId: parent,
      ancestors: [parent],
    });
    inParent = await makeFile("Summary.pdf", parent);
    inChild = await makeFile("ICICI April.pdf", child);
    deletedEarlier = await makeFile("A wrong scan.pdf", parent);

    // somebody deleted this one on its own, a week before the folder went
    await Document.collection.updateOne(
      { _id: deletedEarlier },
      { $set: { deletedAt: new Date("2026-11-16T00:00:00Z") } },
    );
  });

  it("says what a delete would take, before it takes it", async () => {
    const out = await actions.folderContents(String(parent));
    expect(out.ok).toBe(true);
    expect(out.name).toBe("Bank statements");
    expect(out.folders).toBe(1);
    // the one already in the bin is not counted again
    expect(out.files).toBe(2);
  });

  it("goes to the bin together, stamped with the same folder", async () => {
    const out = await actions.deleteFolder(String(parent), "tidying up");
    expect(out.ok).toMatch(/2 files moved to the recycle bin/);

    const rows = await Folder.find({ clientId: ids.client })
      .setOptions({ withDeleted: true })
      .lean();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.deletedAt, row.name).not.toBeNull();
      expect(String(row.deletedWithFolderId)).toBe(String(parent));
    }

    const files = await Document.find({ clientId: ids.client })
      .setOptions({ withDeleted: true })
      .lean();
    const stamped = files.filter(
      (f) => String(f.deletedWithFolderId ?? "") === String(parent),
    );
    expect(stamped.map((f) => f.name).sort()).toEqual([
      "ICICI April.pdf",
      "Summary.pdf",
    ]);
  });

  it("is gone from every ordinary query", async () => {
    expect(await Folder.countDocuments({ clientId: ids.client })).toBe(0);
    expect(await Document.countDocuments({ clientId: ids.client })).toBe(0);
  });

  it("wrote one audit entry for the delete", async () => {
    const AuditLog = (await import("../models/AuditLog.js")).default;
    const entries = await AuditLog.find({
      entityType: "Folder",
      action: "folder_delete",
    }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toMatch(/Bank statements — 2 files — tidying up/);
  });

  it("comes back with everything that went down with it", async () => {
    const out = await actions.restoreFolder(String(parent));
    expect(out.ok).toMatch(/restored/);

    const live = await Folder.find({ clientId: ids.client }).lean();
    expect(live.map((f) => f.name).sort()).toEqual([
      "April",
      "Bank statements",
    ]);

    const files = await Document.find({ clientId: ids.client }).lean();
    expect(files.map((f) => f.name).sort()).toEqual([
      "ICICI April.pdf",
      "Summary.pdf",
    ]);
  });

  it("leaves a file deleted earlier where it was", async () => {
    const row = await Document.findById(deletedEarlier)
      .setOptions({ withDeleted: true })
      .lean();
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedWithFolderId).toBeNull();
  });
});

describe("a name taken while the folder was in the bin", () => {
  it("comes back as (restored) rather than as a second one", async () => {
    const folder = await makeFolder("Correspondence");
    await actions.deleteFolder(String(folder));

    // somebody made a new one with the same name in the meantime
    await makeFolder("Correspondence");

    const out = await actions.restoreFolder(String(folder));
    expect(out.ok).toMatch(/Correspondence \(restored\)/);

    const live = await Folder.find({ nameKey: /correspondence/ }).lean();
    expect(live.map((f) => f.name).sort()).toEqual([
      "Correspondence",
      "Correspondence (restored)",
    ]);
  });
});

describe("a file moved off a job it was answering", () => {
  /** @type {any} */ let job;
  /** @type {any} */ let item;
  /** @type {any} */ let file;

  beforeAll(async () => {
    const service = new mongoose.Types.ObjectId();
    job = new mongoose.Types.ObjectId();
    item = new mongoose.Types.ObjectId();

    await mongoose.connection.collection("servicetemplates").insertOne({
      _id: service,
      name: "GSTR 3B",
      code: "GSTR3B",
      category: "Indirect Tax",
      deletedAt: null,
    });
    await mongoose.connection.collection("engagements").insertOne({
      _id: job,
      code: "NOI-GSTR3B-2025-10-0001",
      clientId: ids.client,
      serviceTemplateId: service,
      periodStart: new Date("2025-10-01T00:00:00Z"),
      period: "2025-10",
      periodLabel: "Oct 2025",
      status: "In progress",
      branchId: ids.branch,
      templateSnapshot: { name: "GSTR 3B" },
      checklist: [
        {
          _id: item,
          name: "Bank statement",
          side: "client",
          status: "Received",
          receivedAt: new Date(),
          documentIds: [],
        },
      ],
      deletedAt: null,
    });

    file = await makeFile("HDFC October.pdf", null);
    await Document.collection.updateOne(
      { _id: file },
      {
        $set: {
          engagementId: job,
          serviceTemplateId: service,
          fy: "FY2025-26",
          checklistItemId: item,
        },
      },
    );
    await mongoose.connection
      .collection("engagements")
      .updateOne({ _id: job }, { $set: { "checklist.0.documentIds": [file] } });
  });

  const clientRoot = () => ["clients", `c-${ids.client}`];

  it("asks before it un-ticks anything", async () => {
    const out = await actions.moveDocument(String(file), clientRoot());

    expect(out.confirm).toMatch(/answers "Bank statement" on the checklist/);
    expect(out.ok).toBeUndefined();

    // and nothing moved while the question stood
    const row = await Document.findById(file).lean();
    expect(String(row.engagementId)).toBe(String(job));
  });

  it("un-ticks the item once somebody says yes", async () => {
    const out = await actions.moveDocument(String(file), clientRoot(), {
      confirmed: true,
    });
    expect(out.ok).toMatch(/filed in/);
    expect(out.unticked).toBe(true);

    const row = await Document.findById(file).lean();
    expect(row.engagementId).toBeNull();
    expect(row.checklistItemId).toBeNull();

    const live = await mongoose.connection
      .collection("engagements")
      .findOne({ _id: job });
    expect(live.checklist[0].documentIds).toHaveLength(0);
    expect(live.checklist[0].status).toBe("Requested");
  });

  it("never moves a file to another client", async () => {
    const elsewhere = new mongoose.Types.ObjectId();
    const out = await actions.moveDocument(String(file), [
      "clients",
      `c-${elsewhere}`,
    ]);
    expect(out.error).toBeTruthy();
    expect(out.ok).toBeUndefined();
  });
});

describe("restoring one file whose folder is still in the bin", () => {
  it("puts it in the nearest folder that is still there, and says so", async () => {
    const parent = await makeFolder("Correspondence 2026");
    const child = await makeFolder("Drafts", {
      parentId: parent,
      ancestors: [parent],
    });
    const file = await makeFile("A letter.pdf", child);

    // the child alone goes to the bin, taking the file with it
    await actions.deleteFolder(String(child));

    const documents = await import("../app/(app)/documents/actions.js");
    const out = await documents.restoreDocument(String(file));

    expect(out.ok).toMatch(/restored to Correspondence 2026/);
    expect(out.ok).toMatch(/still in the bin/);

    const row = await Document.findById(file).lean();
    expect(String(row.folderId)).toBe(String(parent));
    expect(row.deletedAt).toBeNull();
  });
});

describe("the levels that are records, asked directly", () => {
  /**
   * Brief §18: they cannot be made, renamed, moved or deleted **from the
   * UI or by calling the server action directly**. The screen not offering
   * it is not the check; this is.
   */
  it("refuses a folder at every level that comes from the records", async () => {
    const service = await mongoose.connection
      .collection("servicetemplates")
      .insertOne({
        _id: new mongoose.Types.ObjectId(),
        name: "Direct refusal",
        code: "DRF",
        category: "Audit and Assurance",
        deletedAt: null,
      });

    const places = [
      ["clients"],
      ["services"],
      ["clients", `c-${ids.client}`, "svc"],
      ["clients", `c-${ids.client}`, "svc", `s-${service.insertedId}`],
      ["clients", `c-${ids.client}`, "permanent"],
    ];

    for (const parentPath of places) {
      const out = await actions.createFolder({
        parentPath,
        name: "Sneaked in",
      });
      expect(out.error, parentPath.join("/")).toMatch(
        /come from the records|cannot|not/i,
      );
      expect(out.ok, parentPath.join("/")).toBeUndefined();
    }

    expect(await Folder.countDocuments({ nameKey: "sneaked in" })).toBe(0);
  });

  it("refuses to rename or delete something that is not a stored folder", async () => {
    const notAFolder = String(new mongoose.Types.ObjectId());
    expect(
      (await actions.renameFolder(notAFolder, "New name")).error,
    ).toBeTruthy();
    expect((await actions.deleteFolder(notAFolder)).error).toBeTruthy();
  });
});

describe("a year opened before its job", () => {
  it("offers the years that are free and makes the one chosen", async () => {
    const service = new mongoose.Types.ObjectId();
    await mongoose.connection.collection("servicetemplates").insertOne({
      _id: service,
      name: "Statutory audit",
      code: "SA",
      category: "Audit and Assurance",
      deletedAt: null,
    });

    const servicePath = ["clients", `c-${ids.client}`, "svc", `s-${service}`];

    const offered = await actions.fyOptions(servicePath);
    expect(Array.isArray(offered), JSON.stringify(offered)).toBe(true);
    expect(offered.length).toBeGreaterThan(0);

    const first = offered[0];
    const made = await actions.addFyFolder({ servicePath, fy: first.fy });
    expect(made.error).toBeUndefined();
    expect(made.ok).toContain(first.label);

    const row = await Folder.findOne({ kind: "fy", fy: first.fy }).lean();
    expect(row).toBeTruthy();
    expect(row.anchor).toBe(`clients/c-${ids.client}/svc/s-${service}`);

    // and the same year cannot be added twice
    const again = await actions.addFyFolder({ servicePath, fy: first.fy });
    expect(again.error).toMatch(/already here/);

    // nor one the folder does not offer
    const silly = await actions.addFyFolder({ servicePath, fy: "FY1999-00" });
    expect(silly.error).toBeTruthy();
  });
});

describe("erasing a file for good", () => {
  /**
   * The one path in this app that destroys anything, and it had never
   * run: `purgeDocument` empties `fileKey`, and the schema required it,
   * so both the partner's button and the 90-day cron died on validation.
   * Reported by the owner from the recycle bin, 24-11-2026.
   */
  it("keeps the record and loses the key", async () => {
    const file = await makeFile("A scan to erase.pdf", null);
    await Document.collection.updateOne(
      { _id: file },
      { $set: { deletedAt: new Date("2026-08-01T00:00:00Z") } },
    );

    const documents = await import("../app/(app)/documents/actions.js");
    const out = await documents.purgeDocument(String(file));
    expect(out.error).toBeUndefined();
    expect(out.ok).toMatch(/erased/i);

    const row = await Document.findById(file)
      .setOptions({ withDeleted: true })
      .lean();
    expect(row, "the record itself must survive the purge").toBeTruthy();
    expect(row.fileKey).toBe("");
    expect(row.purgedAt).toBeTruthy();
    expect(row.versions).toHaveLength(0);
    expect(row.name).toMatch(/\(purged\)$/);
    // and it stays deleted: purging is not a restore
    expect(row.deletedAt).not.toBeNull();
  });

  it("refuses to erase something still in use", async () => {
    const live = await makeFile("Still in use.pdf", null);
    const documents = await import("../app/(app)/documents/actions.js");
    const out = await documents.purgeDocument(String(live));
    expect(out.error).toMatch(/Delete it first/);
  });

  it("lets the cron clear the bin, which is the same write", async () => {
    const old = await makeFile("Long gone.pdf", null);
    await Document.collection.updateOne(
      { _id: old },
      { $set: { deletedAt: new Date("2026-01-01T00:00:00Z") } },
    );

    const { purgeRecycleBin } = await import("../jobs/purgeRecycleBin.js");
    const result = await purgeRecycleBin({ now: new Date() });

    expect(result.failed ?? []).toEqual([]);
    const row = await Document.findById(old)
      .setOptions({ withDeleted: true })
      .lean();
    expect(row.purgedAt).toBeTruthy();
    expect(row.fileKey).toBe("");
  });
});
