import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";

/**
 * Getting the firm's one document when it does not exist yet
 * (`lib/firm/settings.js`).
 *
 * Found by the browser suite the first time it ran against an empty
 * database: Settings → Customise died with "FirmSettings validation failed:
 * name is required". Both writers built the document themselves and set
 * only their own fields, and the schema requires a name — so whether
 * saving a menu word worked depended on whether somebody had saved the
 * ICAI page first.
 *
 * That is not a test-only condition. The firm's own deployment starts with
 * no firm record, and Customise is reachable before ICAI, so day one of a
 * new installation was the likeliest moment to hit it.
 *
 * Against a real MongoDB because the bug was Mongoose validation on save,
 * which is the one thing a stubbed model would not reproduce.
 */

/** @type {{ stop: () => Promise<unknown> }} */
let replset;
/** @type {any} */
let FirmSettings;
/** @type {typeof import("../lib/firm/settings.js")} */
let settings;
/**
 * Imported inside `beforeAll`, not at the top. `lib/db.js` captures
 * MONGODB_URI into a module-level constant when it is first loaded, so a
 * static import here would read the variable before the replica set exists
 * and then refuse to connect for the rest of the run.
 */
let systemAudit;

beforeAll(async () => {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  process.env.MONGODB_URI = replset.getUri("phmg-firm");

  FirmSettings = (await import("../models/FirmSettings.js")).default;
  settings = await import("../lib/firm/settings.js");

  ({ systemAudit } = await import("../lib/audit/system.js"));

  await mongoose.connect(process.env.MONGODB_URI);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  await FirmSettings.deleteMany({});
  settings.clearFirmCache();
});

describe("firmDocFor, on a database with no firm record", () => {
  it("returns a document that saves with only one field set", async () => {
    await systemAudit(async (session) => {
      const firm = await settings.firmDocFor(session);
      // exactly what Settings → Customise does, and what used to throw
      firm.set({ vocabulary: { client: "customer" }, updatedBy: "test" });
      await firm.save({ session });
    });

    const stored = await FirmSettings.findOne({ key: "firm" }).lean();
    expect(stored).toBeTruthy();
    expect(stored.vocabulary.client).toBe("customer");
  });

  it("carries the default name, so no screen changes when it is created", async () => {
    const { FIRM_DEFAULTS } = await import("../lib/firm/profile.js");

    await systemAudit(async (session) => {
      const firm = await settings.firmDocFor(session);
      firm.set({ updatedBy: "test" });
      await firm.save({ session });
    });

    const stored = await FirmSettings.findOne({ key: "firm" }).lean();
    expect(stored.name).toBe(FIRM_DEFAULTS.name);
  });
});

describe("firmDocFor, when the record is already there", () => {
  it("returns the existing document rather than a second one", async () => {
    await systemAudit(async (session) => {
      await FirmSettings.create(
        [{ key: "firm", name: "Somebody Else & Co", frn: "001234N" }],
        { session, ordered: true },
      );
    });

    await systemAudit(async (session) => {
      const firm = await settings.firmDocFor(session);
      firm.set({ vocabulary: { client: "party" }, updatedBy: "test" });
      await firm.save({ session });
    });

    // the name and FRN a partner typed are not quietly replaced by defaults
    const all = await FirmSettings.find({}).lean();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Somebody Else & Co");
    expect(all[0].frn).toBe("001234N");
    expect(all[0].vocabulary.client).toBe("party");
  });
});
