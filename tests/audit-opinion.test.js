import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  OPINIONS,
  MODIFIED_OPINIONS,
  checkAssurance,
  missingOpinion,
  isAuditWork,
  EMPTY_OPINION_QUERY,
  CLOSED_WITHOUT_OPINION_QUERY,
} from "../lib/practice/books.js";

/**
 * The audit opinion, against a real MongoDB.
 *
 * `tests/e2e/books.spec.js:235` found an audit filing stored with an empty
 * opinion while the screen said "Filing details saved" and still showed the
 * opinion selected. The root cause was in the browser — React 19 resets a
 * form after its action and the wiped `<select>` posted `""` on the next
 * submit — but the reason it was *silent* was that nothing underneath the
 * form had an opinion about the value. The route took whatever arrived and
 * the schema stored whatever it was given.
 *
 * So these are the tests for the layer the browser cannot reach: that each
 * of the standard's opinions survives a write and a re-read, that a value
 * which is not one of them cannot be written at all, and that a file is not
 * allowed to be closed or numbered while the opinion is blank.
 *
 * A real database rather than a stub: `enum` and `strict` are the thing
 * being tested, and a stub would be testing the stub.
 *
 * The full write-up is `docs/BUG_AUDIT_OPINION.md`.
 */

/** @type {{ stop: () => Promise<unknown> }} */
let replset;
/** @type {any} */
let Engagement;
/** @type {typeof import("../lib/audit/system.js").systemAudit} */
let systemAudit;

const AUDIT = { category: "Audit and Assurance", minReviewRole: "partner" };

/**
 * The smallest engagement the assurance fields hang off.
 *
 * Through `systemAudit` because every write in this system goes in a
 * transaction with its audit entry (CLAUDE.md rule 2) and the plugin refuses
 * anything else — including in a test.
 */
async function auditEngagement(assurance = {}) {
  return systemAudit(async (session) => {
    const [made] = await Engagement.create(
      [
        {
          code: "PHMG-NOI-AUD-1",
          clientId: new mongoose.Types.ObjectId(),
          branchId: new mongoose.Types.ObjectId(),
          serviceTemplateId: new mongoose.Types.ObjectId(),
          templateSnapshot: AUDIT,
          period: "2026-03",
          periodLabel: "FY 2025-26",
          status: "In progress",
          assurance,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    return made;
  });
}

beforeAll(async () => {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  process.env.MONGODB_URI = replset.getUri("phmg-opinion");

  // imported here, not at the top: lib/db.js reads MONGODB_URI when it loads
  Engagement = (await import("../models/Engagement.js")).default;
  systemAudit = (await import("../lib/audit/system.js")).systemAudit;
  await mongoose.connect(process.env.MONGODB_URI);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  await Engagement.deleteMany({}, { withDeleted: true });
});

describe("an opinion that was chosen is the opinion on file", () => {
  // the point of the bug: the screen is not evidence, the record is
  for (const opinion of OPINIONS) {
    it(`stores and reads back "${opinion}"`, async () => {
      const made = await auditEngagement({
        auditType: "Statutory audit",
        opinion,
        qualificationNote: MODIFIED_OPINIONS.includes(opinion)
          ? "Inventory at the Ludhiana godown was not observed."
          : "",
      });

      const read = await Engagement.findById(made._id).lean();
      expect(read.assurance.opinion).toBe(opinion);
    });
  }

  it("keeps the opinion when a later save touches another field", async () => {
    const made = await auditEngagement({ opinion: "Qualified" });

    // a second section of the same screen saving its own field
    await Engagement.updateOne(
      { _id: made._id },
      { $set: { ackNo: "AB2610174455621" } },
    );

    const read = await Engagement.findById(made._id).lean();
    expect(read.assurance.opinion).toBe("Qualified");
  });
});

describe("what the database refuses", () => {
  it("refuses an opinion that is not one of the standard's words", async () => {
    await expect(auditEngagement({ opinion: "Clean" })).rejects.toThrow(
      /opinion/i,
    );
  });

  it("refuses a differently cased opinion rather than storing it", async () => {
    // a form posting a label instead of a value is the shape to catch here
    await expect(auditEngagement({ opinion: "qualified" })).rejects.toThrow(
      /opinion/i,
    );
  });

  it("refuses the same on an update, not only on a create", async () => {
    const made = await auditEngagement({ opinion: "Unmodified" });
    made.assurance.opinion = "Mostly fine";
    await expect(
      systemAudit((session) => made.save({ session })),
    ).rejects.toThrow(/opinion/i);

    const read = await Engagement.findById(made._id).lean();
    expect(read.assurance.opinion).toBe("Unmodified");
  });

  it("refuses an audit type that is not one of ours", async () => {
    await expect(auditEngagement({ auditType: "Vibe audit" })).rejects.toThrow(
      /auditType/i,
    );
  });

  it("still allows a blank opinion, which is work in progress", async () => {
    const made = await auditEngagement({ auditType: "Tax audit" });
    const read = await Engagement.findById(made._id).lean();
    expect(read.assurance.opinion).toBe("");
  });
});

describe("checkAssurance", () => {
  it("refuses a modified opinion with nothing said about it", () => {
    const checked = checkAssurance({
      opinion: "Qualified",
      qualificationNote: "   ",
    });
    expect(checked.ok).toBe(false);
    expect(checked.error).toMatch(/modified for/);
  });

  it("accepts a modified opinion that says why", () => {
    expect(
      checkAssurance({
        opinion: "Adverse",
        qualificationNote: "The accounts do not present a true and fair view.",
      }).ok,
    ).toBe(true);
  });

  it("refuses an opinion outside the list", () => {
    expect(checkAssurance({ opinion: "Clean" }).ok).toBe(false);
  });
});

describe("missingOpinion: when a file may not be closed", () => {
  it("is true for audit work with nothing recorded", () => {
    expect(missingOpinion({ templateSnapshot: AUDIT, assurance: {} })).toBe(
      true,
    );
  });

  it("is true for audit work that says the opinion is not yet issued", () => {
    expect(
      missingOpinion({
        templateSnapshot: AUDIT,
        assurance: { opinion: "Not yet issued" },
      }),
    ).toBe(true);
  });

  it("is false once an opinion has been given", () => {
    for (const opinion of [
      "Unmodified",
      "Qualified",
      "Adverse",
      "Disclaimer",
    ]) {
      expect(
        missingOpinion({ templateSnapshot: AUDIT, assurance: { opinion } }),
      ).toBe(false);
    }
  });

  it("does not apply to work that carries no audit report", () => {
    const gst = { templateSnapshot: { category: "Indirect Tax" } };
    expect(isAuditWork(gst)).toBe(false);
    expect(missingOpinion(gst)).toBe(false);
  });

  it("survives an engagement with no snapshot at all", () => {
    expect(missingOpinion({})).toBe(false);
    expect(missingOpinion(null)).toBe(false);
  });
});

/**
 * The two filters `npm run opinions:empty` and `npm run doctor` read. They
 * are the same question as `missingOpinion()` asked of every record at once,
 * so what matters is that they agree with it — a report that disagreed with
 * the gate would send a CA looking for a file that is fine, or worse, miss
 * one that is not.
 */
describe("finding them all at once", () => {
  /** @param {any} extra */
  async function row(extra) {
    return mongoose.connection.db.collection("engagements").insertOne({
      clientId: new mongoose.Types.ObjectId(),
      templateSnapshot: AUDIT,
      period: "2026-03",
      ...extra,
    });
  }

  async function counts() {
    const engagements = mongoose.connection.db.collection("engagements");
    return {
      blank: await engagements.countDocuments(EMPTY_OPINION_QUERY),
      closed: await engagements.countDocuments(CLOSED_WITHOUT_OPINION_QUERY),
    };
  }

  it("finds nothing in an empty database", async () => {
    expect(await counts()).toEqual({ blank: 0, closed: 0 });
  });

  it("warns about work in progress and does not fail it", async () => {
    await row({ status: "In progress", assurance: { opinion: "" } });
    expect(await counts()).toEqual({ blank: 1, closed: 0 });
  });

  it("passes over a completed audit that said what it concluded", async () => {
    await row({ status: "Completed", assurance: { opinion: "Unmodified" } });
    expect(await counts()).toEqual({ blank: 0, closed: 0 });
  });

  it("fails a completed audit with nothing on record", async () => {
    await row({ status: "Completed", assurance: { opinion: "" } });
    expect(await counts()).toEqual({ blank: 1, closed: 1 });
  });

  it("fails one that is numbered, whatever its status", async () => {
    await row({
      status: "Under review",
      udin: "25419876AAAAAAAAAA",
      assurance: { opinion: "" },
    });
    expect(await counts()).toEqual({ blank: 1, closed: 1 });
  });

  it("fails one with a report date and no opinion", async () => {
    await row({
      status: "Under review",
      assurance: { opinion: "", reportDate: new Date("2026-09-20") },
    });
    expect(await counts()).toEqual({ blank: 1, closed: 1 });
  });

  it('counts a completed "Not yet issued" as missing', async () => {
    await row({
      status: "Completed",
      assurance: { opinion: "Not yet issued" },
    });
    expect(await counts()).toEqual({ blank: 1, closed: 1 });
  });

  it("finds one whose assurance block is absent altogether", async () => {
    await row({ status: "Completed" });
    expect(await counts()).toEqual({ blank: 1, closed: 1 });
  });

  it("does not ask the question of work that carries no audit report", async () => {
    await row({
      templateSnapshot: { category: "Indirect Tax" },
      status: "Completed",
      assurance: { opinion: "" },
    });
    expect(await counts()).toEqual({ blank: 0, closed: 0 });
  });
});
