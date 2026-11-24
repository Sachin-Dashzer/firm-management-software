import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

/**
 * The firm's own files and somebody's private files never appear in a
 * client's view (P3-48a, CLAUDE.md rule 1 and §18 of the folders brief).
 *
 * Against a real MongoDB because the claim is about **queries**, not about
 * code paths: `{ zone: "client" }` and `{ zone: { $nin: [...] } }` read the
 * same in a diff and behave differently on the rows already in Atlas, which
 * carry no `zone` field at all. A stubbed model cannot tell the two apart,
 * and the one that is wrong empties every client's Documents tab.
 *
 * Rows go in through the driver rather than the model on purpose: it is the
 * only way to write a file exactly as it was written before this step, with
 * no `zone` at all.
 */

/** @type {{ stop: () => Promise<unknown> }} */
let mongod;
/** @type {any} */
let Document;
/** @type {typeof import("../lib/documents/zones.js")} */
let zones;
/** @type {typeof import("../lib/access/clientScope.js")} */
let clientScope;

const CLIENT_A = new mongoose.Types.ObjectId();
const CLIENT_B = new mongoose.Types.ObjectId();
const ME = "66b1f2a4c9d0e1f2a3b4c5d6";
const COLLEAGUE = "66b1f2a4c9d0e1f2a3b4c5d7";

const ids = {
  legacy: new mongoose.Types.ObjectId(),
  client: new mongoose.Types.ObjectId(),
  shared: new mongoose.Types.ObjectId(),
  firm: new mongoose.Types.ObjectId(),
  otherClient: new mongoose.Types.ObjectId(),
  mine: new mongoose.Types.ObjectId(),
  theirs: new mongoose.Types.ObjectId(),
};

/** What the query found, by the names above. */
function namesOf(rows) {
  const byId = new Map(Object.entries(ids).map(([k, v]) => [String(v), k]));
  return rows.map((row) => byId.get(String(row._id)) ?? "?").sort();
}

beforeAll(async () => {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("phmg-zones");

  Document = (await import("../models/Document.js")).default;
  zones = await import("../lib/documents/zones.js");
  clientScope = await import("../lib/access/clientScope.js");

  await mongoose.connect(process.env.MONGODB_URI);

  const base = {
    fileKey: "clients/A/x.pdf",
    size: 10,
    mime: "application/pdf",
    deletedAt: null,
    createdAt: new Date(),
  };

  await mongoose.connection.collection("documents").insertMany([
    // exactly as every file in the vault looks today: no `zone` field
    {
      ...base,
      _id: ids.legacy,
      name: "Bank statement April.pdf",
      clientId: CLIENT_A,
    },
    {
      ...base,
      _id: ids.client,
      name: "GSTR-3B October.pdf",
      clientId: CLIENT_A,
      zone: "client",
    },
    {
      ...base,
      _id: ids.shared,
      name: "Acknowledgement.pdf",
      clientId: CLIENT_A,
      zone: "client",
      sharedWithClient: true,
    },
    // another client's, to prove the client filter still does its own job
    {
      ...base,
      _id: ids.otherClient,
      name: "Somebody else.pdf",
      clientId: CLIENT_B,
    },
    {
      ...base,
      _id: ids.firm,
      name: "Office leave policy.pdf",
      zone: "firm",
      clientId: null,
      fileKey: "firm/2026/x.pdf",
    },
    {
      ...base,
      _id: ids.mine,
      name: "My rough workings.xlsx",
      zone: "personal",
      clientId: null,
      ownerId: ME,
      fileKey: `users/${ME}/x.xlsx`,
    },
    {
      ...base,
      _id: ids.theirs,
      name: "A colleague's notes.docx",
      zone: "personal",
      clientId: null,
      ownerId: COLLEAGUE,
      fileKey: `users/${COLLEAGUE}/x.docx`,
    },
  ]);
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

describe("a client's own files", () => {
  it("includes files written before zones existed", async () => {
    const rows = await Document.find({
      clientId: CLIENT_A,
      ...zones.CLIENT_FILES,
    }).lean();

    expect(namesOf(rows)).toEqual(["client", "legacy", "shared"]);
  });

  it("never includes the firm's own or anybody's private files", async () => {
    const rows = await Document.find({
      clientId: CLIENT_A,
      ...zones.CLIENT_FILES,
    }).lean();

    expect(namesOf(rows)).not.toContain("firm");
    expect(namesOf(rows)).not.toContain("mine");
    expect(namesOf(rows)).not.toContain("theirs");
  });

  it("counts the same files it lists", async () => {
    const n = await Document.countDocuments({
      clientId: CLIENT_A,
      ...zones.CLIENT_FILES,
    });
    expect(n).toBe(3);
  });
});

describe("the firm-wide file register", () => {
  /**
   * The register is scoped by client, and `scopedByClient` returns an
   * **empty filter** for a partner — so for the one person who can see
   * everything, the zone filter is the only thing between the file list and
   * a colleague's private papers.
   */
  it("shows no firm or personal file even with no client scope", async () => {
    const rows = await Document.find({ ...zones.CLIENT_FILES }).lean();

    expect(namesOf(rows)).not.toContain("firm");
    expect(namesOf(rows)).not.toContain("mine");
    expect(namesOf(rows)).not.toContain("theirs");
    expect(rows).toHaveLength(4); // three of client A, one of client B
  });

  it("lists the financial years of client files only", async () => {
    const years = await Document.distinct("fy", { ...zones.CLIENT_FILES });
    expect(years).not.toContain(undefined);
  });
});

describe("the client portal", () => {
  it("shares nothing from outside the client zone", async () => {
    const scope = clientScope.documentScope({
      kind: "client",
      clientId: String(CLIENT_A),
    });
    const rows = await Document.find(scope).lean();

    expect(namesOf(rows)).toEqual(["shared"]);
    expect(scope.zone).toEqual({ $nin: ["firm", "personal"] });
  });
});

describe("the recycle bin", () => {
  it("hides a colleague's private files and keeps your own", async () => {
    const rows = await Document.find(zones.visibleZones(ME)).lean();

    expect(namesOf(rows)).toContain("mine");
    expect(namesOf(rows)).toContain("firm");
    expect(namesOf(rows)).toContain("legacy");
    expect(namesOf(rows)).not.toContain("theirs");
  });
});

describe("a client is required, unless the file has no client", () => {
  it("refuses a client file with no client", async () => {
    const bad = new Document({
      name: "x.pdf",
      fileKey: "clients/A/x.pdf",
      zone: "client",
    });
    await expect(bad.validate()).rejects.toThrow(/clientId/);
  });

  it("refuses a file that names no zone and no client", async () => {
    const bad = new Document({ name: "x.pdf", fileKey: "clients/A/x.pdf" });
    await expect(bad.validate()).rejects.toThrow(/clientId/);
  });

  it("accepts the firm's own file with no client", async () => {
    const ok = new Document({
      name: "policy.pdf",
      fileKey: "firm/2026/x.pdf",
      zone: "firm",
    });
    await expect(ok.validate()).resolves.toBeUndefined();
  });

  it("accepts somebody's own file with no client", async () => {
    const ok = new Document({
      name: "notes.xlsx",
      fileKey: `users/${ME}/x.xlsx`,
      zone: "personal",
      ownerId: ME,
    });
    await expect(ok.validate()).resolves.toBeUndefined();
  });
});

/**
 * The portal, asked the way the portal asks (P3-48f, brief §12.4).
 *
 * The three cases that matter are each a different way a file could reach
 * somebody outside the firm: another client's, the firm's own, and one of
 * this client's that nobody shared. None of them may.
 */
describe("what leaves the firm", () => {
  const person = { kind: "client", clientId: String(CLIENT_A) };

  it("is only this client's, only shared, only from the client zone", async () => {
    const scope = clientScope.documentScope(person);
    const rows = await Document.find(scope).lean();

    expect(namesOf(rows)).toEqual(["shared"]);
    expect(scope.clientId).toBe(String(CLIENT_A));
    expect(scope.sharedWithClient).toBe(true);
    expect(scope.zone).toEqual({ $nin: ["firm", "personal"] });
  });

  it("cannot be widened by sharing a firm file by mistake", async () => {
    // somebody ticks "share" on the firm's own policy: it still cannot go
    await Document.collection.updateOne(
      { _id: ids.firm },
      { $set: { sharedWithClient: true, clientId: CLIENT_A } },
    );

    const rows = await Document.find(clientScope.documentScope(person)).lean();
    expect(namesOf(rows)).not.toContain("firm");

    await Document.collection.updateOne(
      { _id: ids.firm },
      { $set: { sharedWithClient: false, clientId: null } },
    );
  });

  it("belongs to one client, whatever id is asked for", () => {
    expect(() => clientScope.documentScope({ kind: "staff" })).toThrow();
    expect(() => clientScope.documentScope({})).toThrow();
  });
});
