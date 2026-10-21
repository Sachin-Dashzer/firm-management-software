// @ts-check

/**
 * Pre-flight check, for the day the database exists and for every go-live
 * step after it (`docs/DEPLOY.md`).
 *
 *   npm run doctor
 *
 * It reads the environment, opens the database, proves that transactions
 * work, builds the indexes, walks the audit chain, puts a probe file through
 * the vault and takes it out again, then lists what is still missing before
 * the firm can rely on the system. It writes nothing except the probe file,
 * which it erases.
 */

import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";

/** Decoded length of a base64 key, or -1 if it is not base64 at all. */
function keyBytes(value) {
  const text = String(value);
  try {
    const bytes = Buffer.from(text, "base64");
    const round = bytes.toString("base64").replace(/=+$/, "");
    return round === text.replace(/=+$/, "") ? bytes.length : -1;
  } catch {
    return -1;
  }
}

/**
 * Everything that can be judged without opening a connection.
 *
 * @param {Record<string, string|undefined>} env
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function checkEnv(env) {
  const problems = [];
  const warnings = [];
  const uri = env.MONGODB_URI ?? "";

  if (!uri) {
    problems.push("MONGODB_URI is not set. Copy .env.example to .env.local.");
  } else {
    if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
      problems.push("MONGODB_URI does not look like a connection string.");
    }
    if (/<[^>]+>/.test(uri)) {
      problems.push(
        "MONGODB_URI still has Atlas's <db_password> placeholder in it.",
      );
    }
    const afterHost = uri.replace(/^mongodb(\+srv)?:\/\//, "");
    if (!/\/[A-Za-z0-9_-]+(\?|$)/.test(afterHost)) {
      problems.push(
        "MONGODB_URI has no database name. Put /phmg after .net, before the ?.",
      );
    }
  }

  if ((env.AUTH_SECRET ?? "").length < 32) {
    problems.push(
      "AUTH_SECRET is missing or too short. Generate 32 random bytes of base64 (DEPLOY.md §4).",
    );
  }

  for (const name of ["FIELD_ENCRYPTION_KEY", "STORAGE_ENCRYPTION_KEY"]) {
    if (!env[name]) {
      problems.push(`${name} is not set.`);
      continue;
    }
    const bytes = keyBytes(env[name]);
    if (bytes !== 32) {
      const found = bytes < 0 ? "not base64" : `${bytes} bytes`;
      problems.push(
        `${name} decodes to ${found}; it must be 32 bytes of base64.`,
      );
    }
  }

  const driver =
    env.STORAGE_DRIVER || (env.STORAGE_GATEWAY_URL ? "bigrock" : "local");
  if (!["local", "bigrock"].includes(driver)) {
    problems.push(
      `STORAGE_DRIVER is "${driver}"; it must be local or bigrock.`,
    );
  }
  if (driver === "bigrock") {
    if (!/^https:\/\//.test(env.STORAGE_GATEWAY_URL ?? "")) {
      problems.push("STORAGE_GATEWAY_URL must be set and must be https.");
    }
    if (!env.STORAGE_SHARED_SECRET) {
      problems.push(
        "STORAGE_SHARED_SECRET is not set; it must match shared_secret in the gateway's config.php.",
      );
    }
  }

  const transport = env.EMAIL_TRANSPORT || (env.SMTP_HOST ? "smtp" : "log");
  if (transport === "smtp") {
    for (const name of [
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "EMAIL_FROM",
    ]) {
      if (!env[name]) problems.push(`${name} is needed to send over SMTP.`);
    }
  }

  if (env.EMAIL_CLIENTS_ENABLED === "true" && !env.EMAIL_REDIRECT_TO) {
    warnings.push(
      "Client email is ON and nothing is redirected: messages will reach real clients.",
    );
  }
  if (env.AUTH_SKIP_2FA === "true") {
    problems.push(
      "AUTH_SKIP_2FA is on: the password alone signs anybody in. Remove it before go-live.",
    );
  }
  if (!env.JOBS_SECRET) {
    warnings.push(
      "JOBS_SECRET is not set, so the runner cannot be started over the web (DEPLOY.md §2 Option 2).",
    );
  }
  if (/localhost/.test(env.NEXT_PUBLIC_APP_URL ?? "localhost")) {
    warnings.push(
      "NEXT_PUBLIC_APP_URL still points at localhost; client upload links would be unusable.",
    );
  }

  return { problems, warnings };
}

// --- the live checks -------------------------------------------------------

const pass = (m) => console.log(`  ok    ${m}`);
const warn = (m) => console.log(`  note  ${m}`);
const fail = (m) => console.log(`  FAIL  ${m}`);

/** Load every model so its indexes and hooks are registered. */
async function loadModels() {
  const dir = new URL("../models/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    await import(new URL(file, dir).href);
  }
  return Object.keys(mongoose.models).sort();
}

/** Atlas's errors are not written for accountants. */
function explainConnection(err) {
  const text = String(err?.message ?? err);
  if (/Authentication failed/i.test(text)) {
    return "the username or password in MONGODB_URI is wrong (Atlas → Database Access).";
  }
  if (/ENOTFOUND|querySrv/i.test(text)) {
    return "the cluster address in MONGODB_URI does not exist (Atlas → Connect → Drivers).";
  }
  if (/IP|whitelist|not allowed/i.test(text)) {
    return "this machine's IP is not allowed in (Atlas → Network Access → Add IP Address).";
  }
  return text;
}

/** Put a probe file in and take it out again, through whichever driver. */
async function checkVault() {
  const { driverName } = await import("../lib/storage/index.js");
  const driver = driverName();
  const key = `probe/doctor-${Date.now()}.txt`;
  const body = Buffer.from(`doctor ${new Date().toISOString()}`);

  if (driver === "local") {
    const { putLocal, getLocal, removeLocal, vaultDir } =
      await import("../lib/storage/local.js");
    try {
      await putLocal(key, body);
      const back = await getLocal(key);
      await removeLocal(key, { purge: true });
      if (Buffer.compare(Buffer.from(back.bytes ?? back), body) !== 0) {
        fail("the local vault gave back different bytes than it was given");
        return 1;
      }
      pass(
        `local driver: wrote, read and erased a probe file in ${vaultDir()}`,
      );
      warn(
        "this is the development driver. Production uses the BigRock gateway.",
      );
      return 0;
    } catch (err) {
      fail(`the local vault refused: ${err.message}`);
      return 1;
    }
  }

  // bigrock: this reaches the real gateway over the network
  const base = String(process.env.STORAGE_GATEWAY_URL).replace(/\/$/, "");
  try {
    const front = await fetch(base, { redirect: "manual" });
    const text = await front.text();
    if (front.status === 404 && /Not found/.test(text)) {
      pass(`gateway answering at ${base} (404, no front page, as designed)`);
    } else {
      fail(
        `${base} answered ${front.status}. If the body looks like PHP source, PHP is not running.`,
      );
      return 1;
    }
  } catch (err) {
    fail(`${base} could not be reached: ${err.message}`);
    return 1;
  }

  const { getUploadTicket, getDownloadLink, remove } =
    await import("../lib/storage/index.js");
  try {
    const ticket = getUploadTicket({
      key,
      maxBytes: body.length + 1,
      types: ["text/plain"],
    });
    const form = new FormData();
    form.append(
      ticket.field,
      new Blob([body], { type: "text/plain" }),
      "probe.txt",
    );
    const up = await fetch(ticket.url, { method: "POST", body: form });
    if (!up.ok) {
      const why = (await up.text()).slice(0, 120);
      fail(`the gateway refused the upload: ${up.status} ${why}`);
      return 1;
    }
    const link = getDownloadLink({
      key,
      name: "probe.txt",
      mime: "text/plain",
    });
    const back = Buffer.from(await (await fetch(link)).arrayBuffer());
    await remove(key, { purge: true });
    if (Buffer.compare(back, body) !== 0) {
      fail(
        "the gateway gave back different bytes than it was given — check that STORAGE_ENCRYPTION_KEY matches the gateway's encryption_key",
      );
      return 1;
    }
    pass("gateway round trip: uploaded, downloaded and erased a probe file");
    return 0;
  } catch (err) {
    fail(`the gateway round trip failed: ${err.message}`);
    return 1;
  }
}

/** The go-live blockers that are data, not code. */
async function readiness() {
  const { default: Counter } = await import("../models/Counter.js");
  const { HEARTBEAT_ID } = await import("../lib/jobs/queue.js");

  /**
   * The same list the Settings screen shows (P2-10b), read here rather than
   * written out again (P2-10d).
   *
   * This function used to keep its own copy of the branch-GSTIN, due-date
   * and zero-fee checks, which is two places to add the next one and two
   * places to forget. A partner is used as the reader because the doctor
   * runs from a terminal with nobody signed in, and the point of it is to
   * see everything.
   */
  const { needsAttention } = await import("../lib/settings/attention.js");
  const { firmProfile } = await import("../lib/firm/settings.js");
  const items = await needsAttention(
    { id: "doctor", role: "partner", branchIds: [], active: true },
    { firm: await firmProfile() },
  );

  if (items.length === 0) {
    pass("nothing on the Settings 'needs attention' list");
  }
  for (const item of items) {
    warn(`${item.count} ${item.title} — ${item.detail} (${item.href})`);
  }

  /**
   * Everybody below a CA should have a reporting CA. The "My senior CA" card
   * on `/me` has nothing to show without one, and nor does the team view —
   * so this is a warning about a screen that will look broken, not about
   * anything unsafe.
   */
  const { default: User } = await import("../models/User.js");
  const noSenior = await User.countDocuments({
    active: true,
    role: { $in: ["employee", "intern"] },
    $or: [{ reportingTo: null }, { reportingTo: { $exists: false } }],
  });
  if (noSenior) {
    warn(
      `${noSenior} employee(s) or intern(s) have no reporting CA: their "My senior CA" card will be empty (Team).`,
    );
  } else {
    pass("every employee and intern has a reporting CA");
  }

  /**
   * The firm's own record (P2-6). Until a partner saves it the app signs
   * itself with the name that used to be hardcoded, which is right for this
   * firm and wrong for anybody else — and an FRN missing from an invoice is
   * the kind of thing a client's auditor notices.
   */
  const { default: FirmSettings } = await import("../models/FirmSettings.js");
  const firm = await FirmSettings.findOne({ key: "firm" }).lean();
  // the name, FRN and address are on the shared list above; the CPE target
  // is not, because no screen is wrong without it
  if (firm && !firm.cpeTargetStructured && !firm.cpeTargetUnstructured) {
    warn("no CPE target is set, so hours are totalled but not judged (ICAI).");
  }

  /**
   * The shared list says when the runner has stopped. This says how long it
   * has been alive, which a warning cannot: a terminal is where somebody
   * checks that cron is working, and "last finished 3 minutes ago" is the
   * answer they came for.
   */
  const beat = await Counter.findById(HEARTBEAT_ID).lean();
  if (beat) {
    const minutes = Math.round(
      (Date.now() - new Date(beat.updatedAt).valueOf()) / 60000,
    );
    if (minutes <= 30) {
      pass(`job runner alive, last finished ${minutes} minute(s) ago`);
    }
  }
}

async function main() {
  let failures = 0;

  console.log("\nEnvironment");
  const { problems, warnings } = checkEnv(process.env);
  problems.forEach(fail);
  warnings.forEach(warn);
  failures += problems.length;
  if (!problems.length) {
    pass("every variable the app needs is set and well formed");
  }
  if (problems.some((p) => p.startsWith("MONGODB_URI"))) {
    console.log(
      "\nStopping: nothing else can be checked without the database.\n",
    );
    process.exit(1);
  }

  console.log("\nDatabase");
  const { connectDB } = await import("../lib/db.js");
  try {
    await connectDB();
    pass(`connected to ${mongoose.connection.name}`);
  } catch (err) {
    fail(explainConnection(err));
    console.log("\nStopping: the database did not answer.\n");
    process.exit(1);
  }

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (hello.setName) {
    pass(`replica set ${hello.setName}: transactions available`);
  } else {
    fail(
      "this is a standalone server, so transactions do not work and nothing can be audited. Atlas is a replica set on every tier, including M0.",
    );
    failures += 1;
  }

  // the honest test: open a transaction, write inside it, roll it back
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    await mongoose.connection.db
      .collection("doctorProbe")
      .insertOne({ at: new Date() }, { session });
    await session.abortTransaction();
    await session.endSession();
    pass("a transaction opened and rolled back cleanly");
  } catch (err) {
    fail(`a transaction could not be opened: ${err.message}`);
    failures += 1;
  }

  const names = await loadModels();
  try {
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    pass(`${names.length} collections, indexes built`);
  } catch (err) {
    fail(`an index would not build: ${err.message}`);
    failures += 1;
  }

  console.log("\nAudit log");
  const { verifyAuditChain } = await import("../lib/audit/index.js");
  const chain = await verifyAuditChain();
  if (chain.checked === 0) {
    warn("empty: nothing has been audited yet");
  } else if (chain.ok) {
    pass(`${chain.checked} entries, chain intact`);
  } else {
    fail(`chain broken at #${chain.seq}: ${chain.problem}`);
    failures += 1;
  }

  console.log("\nFile vault");
  failures += await checkVault();

  console.log("\nStill to do before the firm relies on this");
  await readiness();

  console.log(
    failures
      ? `\n${failures} thing${failures > 1 ? "s" : ""} to fix above.\n`
      : "\nNothing broken. The list above is work, not faults.\n",
  );
  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(`\n${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
