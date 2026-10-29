/**
 * A MongoDB replica set on this machine, for the browser suite (D77).
 *
 * **Why.** A full pass against Atlas takes 5.6 hours, because every change
 * in this system is a transaction committed in Mumbai — and a suite nobody
 * can re-run is a suite nobody fixes, which is exactly how sixty stale
 * tests accumulated while every report said "waiting on Atlas". Against a
 * local replica set the same pass is minutes, and it can run in CI.
 *
 * It is a **replica set** and not a single `mongod` because transactions
 * need one, and this system writes nothing without a transaction
 * (CLAUDE.md rule 2).
 *
 * **It is off until `mongodb-memory-server` is installed**, and it can be
 * switched off with `PHMG_TEST_DB=atlas` when the point is the real
 * cluster — the acceptance pass, and anything about go-live.
 *
 *   npm i -D mongodb-memory-server
 *
 * Nothing here runs in production: it is imported by the Playwright config
 * and by nothing else.
 */

/** @type {{ stop: () => Promise<unknown> } | null} */
let server = null;

/**
 * Start one and point `MONGODB_URI` at it, or say why not.
 *
 * @returns {Promise<{ started: boolean, why?: string, uri?: string }>}
 */
export async function startLocalDb() {
  if (process.env.PHMG_TEST_DB === "atlas") {
    return { started: false, why: "PHMG_TEST_DB=atlas" };
  }

  let MongoMemoryReplSet;
  try {
    ({ MongoMemoryReplSet } = await import("mongodb-memory-server"));
  } catch {
    return {
      started: false,
      why: "mongodb-memory-server is not installed (npm i -D mongodb-memory-server)",
    };
  }

  /**
   * One member is enough for transactions and starts in a second or two.
   * The first ever run downloads a MongoDB binary, which needs the network
   * once and is then cached.
   */
  server = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });

  const uri = server.getUri("phmg");
  process.env.MONGODB_URI = uri;
  return { started: true, uri };
}

/** Stop it, if it was ours to start. */
export async function stopLocalDb() {
  if (!server) return;
  await server.stop();
  server = null;
}

/**
 * The firm's own furniture, which the specs assume exists: the four
 * branches, the starter service catalog, the due-date rules and the
 * document templates.
 *
 * This is what `npm run seed` writes, through the same starter data, so a
 * local database is not a different firm from a seeded one. No partner
 * account is created: every spec makes its own people.
 */
export async function seedLocalDb() {
  const [
    { connectDB },
    { default: Branch },
    { default: ServiceTemplate },
    { default: DueDateRule },
    { default: DocTemplate },
    { STARTER_CATALOG },
    { STARTER_DUE_RULES },
    { STARTER_DOC_TEMPLATES },
    { systemAudit },
  ] = await Promise.all([
    import("../../lib/db.js"),
    import("../../models/Branch.js"),
    import("../../models/ServiceTemplate.js"),
    import("../../models/DueDateRule.js"),
    import("../../models/DocTemplate.js"),
    import("../../lib/services/starter.js"),
    import("../../lib/compliance/starterRules.js"),
    import("../../lib/docs/starter.js"),
    import("../../lib/audit/system.js"),
  ]);

  await connectDB();

  await systemAudit(async (session) => {
    for (const branch of [
      { code: "NOI", name: "Noida (head office)", invoicePrefix: "NOI" },
      { code: "DEL", name: "Delhi — Rohini", invoicePrefix: "DEL" },
      { code: "LDH", name: "Ludhiana", invoicePrefix: "LDH" },
      { code: "MRT", name: "Meerut", invoicePrefix: "MRT" },
    ]) {
      await Branch.findOneAndUpdate(
        { code: branch.code },
        { $setOnInsert: { ...branch, createdBy: "test", updatedBy: "test" } },
        { upsert: true, new: true, session },
      );
    }

    for (const service of STARTER_CATALOG) {
      await ServiceTemplate.findOneAndUpdate(
        { code: service.code },
        { $setOnInsert: { ...service, createdBy: "test", updatedBy: "test" } },
        { upsert: true, new: true, session },
      );
    }

    /**
     * Unconfirmed, exactly as the real seed leaves them: a statutory date
     * is not applied until a partner has confirmed the rule behind it, and
     * a suite that started from confirmed rules would not be testing the
     * system the firm actually runs.
     */
    for (const rule of STARTER_DUE_RULES) {
      await DueDateRule.findOneAndUpdate(
        { serviceCode: rule.serviceCode, name: rule.name },
        { $setOnInsert: { ...rule, createdBy: "test", updatedBy: "test" } },
        { upsert: true, new: true, session },
      );
    }

    for (const template of STARTER_DOC_TEMPLATES) {
      await DocTemplate.findOneAndUpdate(
        { key: template.key },
        { $setOnInsert: { ...template, createdBy: "test", updatedBy: "test" } },
        { upsert: true, new: true, session },
      );
    }
  });
}
