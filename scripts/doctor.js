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

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import {
  inProduction,
  checkProductionStorage,
} from "../lib/storage/production.js";

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
  /*
   * Several checks are advice on a laptop and blockers on the real thing —
   * a localhost callback URL, for instance. Judged from the environment
   * passed in, not from this process, so a test can ask about a
   * deployment it is not running on.
   */
  const production = inProduction(env);

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
    if (!env.EMAIL_REPLY_TO) {
      warnings.push(
        "EMAIL_REPLY_TO is not set, so replies go to the sending mailbox and nothing reads it. Four templates invite the client to reply. Set it to a mailbox a person opens.",
      );
    }
  }

  if (env.EMAIL_CLIENTS_ENABLED === "true" && !env.EMAIL_REDIRECT_TO) {
    warnings.push(
      "Client email is ON in the environment and nothing is redirected: messages will reach real clients. The firm's own switch, on Settings -> Automation, overrides this line either way once a partner has thrown it.",
    );
  }
  if (env.AUTH_SKIP_2FA === "true") {
    /*
     * It is ignored on a production deployment (lib/twoFactor.js), so
     * sign-in is still safe there — but it being set at all means the
     * firm's environment is configured to skip the second factor, and that
     * is a fault either way.
     */
    problems.push(
      production
        ? "AUTH_SKIP_2FA=true is set on a production deployment. It is ignored, so sign-in is still safe, but remove it: the firm's environment should not ask to skip 2FA. (Vercel → Settings → Environment Variables)"
        : "AUTH_SKIP_2FA is on: the password alone signs anybody in. Remove it before go-live.",
    );
  }

  /**
   * The runner's only lock. A missing one was a warning, which is how 88
   * jobs sat unrun for weeks: without it `/api/jobs/run` refuses every
   * caller, so nothing scheduled happens at all — no reminders, no
   * recurring filings, no email. That is a failure, not a note.
   */
  if (!env.JOBS_SECRET) {
    problems.push(
      "JOBS_SECRET is not set, so /api/jobs/run refuses every caller and nothing scheduled runs — no reminders, no recurring work, no email. Generate one with `npm run secrets` (DEPLOY.md §2).",
    );
  } else if (env.JOBS_SECRET.length < 32) {
    problems.push(
      `JOBS_SECRET is ${env.JOBS_SECRET.length} characters; it guards the only unauthenticated-by-default route in the app. Use at least 32 (\`npm run secrets\`).`,
    );
  }

  if (/localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_APP_URL ?? "localhost")) {
    const message =
      "NEXT_PUBLIC_APP_URL still points at localhost; client upload links would be unusable.";
    // on the real deployment this is not a cosmetic problem: every link the
    // firm emails to a client would point at the recipient's own machine
    (production ? problems : warnings).push(message);
  }

  /**
   * `NEXTAUTH_URL` is what Auth.js builds its callback and redirect URLs
   * from. Wrong in production and sign-in sends people to localhost; http
   * in production and the session cookie travels in the clear.
   */
  const authUrl = env.NEXTAUTH_URL ?? "";
  if (!authUrl) {
    (production ? problems : warnings).push(
      "NEXTAUTH_URL is not set. Auth.js builds its sign-in redirects from it (DEPLOY.md §4).",
    );
  } else if (production) {
    if (/localhost|127\.0\.0\.1/.test(authUrl)) {
      problems.push(
        `NEXTAUTH_URL is "${authUrl}" on a production deployment: every sign-in would redirect to the user's own machine. Set it to https://crm.phmgindia.com.`,
      );
    } else if (!/^https:\/\//.test(authUrl)) {
      problems.push(
        `NEXTAUTH_URL is "${authUrl}": it must be https in production, or the session cookie travels in the clear.`,
      );
    }
  }

  /**
   * Which deployment an error came from. Without it every environment
   * reports into one bucket and a preview's noise is indistinguishable from
   * the firm hitting a real bug.
   */
  if (env.SENTRY_DSN && !env.SENTRY_ENVIRONMENT) {
    warnings.push(
      "SENTRY_ENVIRONMENT is not set, so errors from production, previews and laptops all land in the same bucket (DEPLOY.md §8).",
    );
  }

  /**
   * The local file driver in production is silent data loss: Vercel's disk
   * is discarded on every deploy. Read from the same function the app
   * refuses to boot on, so the two cannot disagree.
   */
  /**
   * The self-hosted case the boot guard cannot see.
   *
   * `inProduction()` keys on `VERCEL_ENV` alone, because `NODE_ENV` is
   * `production` for `npm start` on a laptop too — see the note in
   * `lib/storage/production.js`. That leaves one real gap: a deployment
   * somewhere other than Vercel, where `NODE_ENV=production` genuinely is
   * the signal and nothing refuses to boot.
   *
   * It is a warning rather than a failure because the overwhelmingly more
   * likely reader of this line is somebody running `npm start` on their own
   * machine, where the local driver is right.
   */
  if (
    !env.VERCEL_ENV &&
    env.NODE_ENV === "production" &&
    (env.STORAGE_DRIVER || "local") === "local"
  ) {
    warnings.push(
      "This is a production build with the local file driver and no VERCEL_ENV. On a laptop that is fine. If this is a deployment serving the firm, the local driver loses every document when the server is replaced — set STORAGE_DRIVER=bigrock (docs/GATEWAY_DEPLOY.md §6).",
    );
  }

  const storage = checkProductionStorage(env);
  if (!storage.ok) problems.push(storage.reason);

  return { problems, warnings };
}

// --- the live checks -------------------------------------------------------

const pass = (m) => console.log(`  PASS  ${m}`);
const warn = (m) => console.log(`  WARN  ${m}`);
const fail = (m) => console.log(`  FAIL  ${m}`);

/**
 * Are clients actually being emailed?
 *
 * The environment check above can only read `EMAIL_CLIENTS_ENABLED`, and
 * since 04-11-2026 that variable is merely the fallback: the real switch is
 * `firmSettings.clientMailOn`, thrown by a partner on Settings →
 * Automation. So on a firm that has used the screen — which is every firm
 * past go-live — `doctor` was reporting the wrong answer to the single most
 * consequential question it asks, and reporting it confidently.
 *
 * It goes through `clientMailFrom` rather than reading the field, so there
 * stays exactly one place that knows the variable is the fallback. A second
 * copy of that rule is a `doctor` that can disagree with the sender.
 *
 * Never a failure. Client email being off is the correct state for most of
 * the build and a deliberate state afterwards; what was wrong was not
 * knowing which state the firm was in.
 *
 * @returns {Promise<number>} failures
 */
async function checkClientMail() {
  const { firmProfile } = await import("../lib/firm/settings.js");
  const { clientMailFrom, mailSettings } =
    await import("../lib/mailer/guard.js");

  const firm = await firmProfile();
  const thrown = typeof firm?.clientMailOn === "boolean";
  const on = clientMailFrom(firm);
  const source = thrown
    ? "the firm's own switch, on Settings -> Automation"
    : "EMAIL_CLIENTS_ENABLED, because nobody has thrown the switch on screen";
  const { redirectTo } = mailSettings();

  if (!on) {
    pass(
      `client email is OFF (${source}). Messages are composed, logged and visible on Settings -> Messages, and do not leave the building.`,
    );
    return 0;
  }

  if (redirectTo) {
    warn(
      `client email is ON (${source}) but everything is redirected to ${redirectTo}. This is the right state for testing and the wrong one for go-live — no client is receiving anything.`,
    );
    return 0;
  }

  pass(`client email is ON (${source}). Clients are receiving mail.`);
  return 0;
}

/**
 * Is the queue being worked?
 *
 * The audit that opened the go-live work found 88 jobs queued and none ever
 * run, and `doctor` said nothing about it: the shared attention list
 * noticed the runner was quiet, but nothing reported a backlog or counted
 * what had failed. A queue with work in it and nobody taking it is the
 * single quietest way for this system to be wrong — the screens all look
 * right and nothing happens.
 *
 * @returns {Promise<number>} failures
 */
async function checkJobQueue() {
  const { default: Job } = await import("../models/Job.js");
  const { default: Counter } = await import("../models/Counter.js");
  const { HEARTBEAT_ID } = await import("../lib/jobs/queue.js");

  let failures = 0;
  const now = Date.now();

  const beat = await Counter.findById(HEARTBEAT_ID).lean();
  if (!beat) {
    fail(
      "the job runner has never run. Nothing scheduled is happening: no reminders, no recurring work, no email. Set up the cron job (DEPLOY.md §2) and check with `npm run jobs:tick`.",
    );
    failures += 1;
  } else {
    const minutes = Math.round(
      (now - new Date(beat.updatedAt).valueOf()) / 60000,
    );
    if (minutes <= 15) {
      pass(
        `job runner alive, last finished ${minutes} minute(s) ago (${beat.seq} runs)`,
      );
    } else {
      // three missed five-minute ticks: cron is not reaching it
      fail(
        `the job runner last finished ${minutes} minutes ago. It should run every five. Check the cron job (DEPLOY.md §2); the queue is not being worked.`,
      );
      failures += 1;
    }
  }

  const [queued, stale, failed] = await Promise.all([
    Job.countDocuments({ status: "queued" }),
    Job.countDocuments({
      status: { $in: ["queued", "running"] },
      runAt: { $lte: new Date(now - 60 * 60 * 1000) },
    }),
    Job.countDocuments({ status: "failed" }),
  ]);

  if (stale > 0) {
    fail(
      `${stale} job(s) have been waiting over an hour. Read them with \`npm run jobs:backlog\` before switching the runner on: some may be client reminders that are no longer true.`,
    );
    failures += 1;
  } else if (queued > 0) {
    pass(`${queued} job(s) queued, none older than an hour`);
  } else {
    pass("the queue is empty");
  }

  if (failed > 0) {
    warn(
      `${failed} job(s) gave up after their last attempt and are waiting for somebody to look (Settings → Background jobs).`,
    );
  }

  return failures;
}

/**
 * Is the browser suite still unable to reach the firm's database?
 *
 * This is the one check here about the repo rather than the deployment, and
 * it earns its place: for twenty-odd steps `npm run test:e2e` ran against
 * the live Atlas cluster while its specs called `Client.deleteMany`. The
 * guard that stops it is only a guard while it is wired in, and the thing
 * it replaced was dead code whose own comment claimed it was wired in.
 *
 * @returns {number} failures
 */
function checkE2eGuard() {
  const root = new URL("../", import.meta.url);
  const guardPath = new URL("tests/e2e/assert-safe-db.mjs", root);
  const configPath = new URL("playwright.config.mjs", root);

  if (!existsSync(guardPath)) {
    fail(
      "tests/e2e/assert-safe-db.mjs is missing. Without it `npm run test:e2e` can run against the firm's database, and those specs delete users and clients.",
    );
    return 1;
  }

  /*
   * Comments stripped before matching. The config explains at length why it
   * no longer calls `loadEnvFile(".env")` — and the first version of this
   * check read that explanation as the thing it was warning about, and
   * failed go-live over a comment.
   */
  const config = (
    existsSync(configPath) ? readFileSync(configPath, "utf8") : ""
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  if (!/assertSafeDb\s*\(/.test(config)) {
    fail(
      "playwright.config.mjs does not call assertSafeDb(). The guard exists but nothing runs it — which is exactly how the suite came to run against Atlas before.",
    );
    return 1;
  }

  if (/loadEnvFile\(["']\.env["']\)/.test(config)) {
    fail(
      "playwright.config.mjs loads .env, so the suite can pick up the firm's live MONGODB_URI. It should read .env.test only.",
    );
    return 1;
  }

  pass("the browser suite is locked to a throwaway database");
  return 0;
}

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

/**
 * Which of the Settings checks stop go-live, as opposed to being work.
 *
 * The attention list carries its own `severity`, and it is right for what
 * it is for: a nudge on a screen somebody reads every week. Go-live asks a
 * different question, so two of them are harder here than there —
 *
 *  - `sampleData`: invented clients mixed in with real ones means every
 *    total the firm reads is wrong. Fine while trying the system out,
 *    unacceptable on the day it is relied on.
 *  - `firm`: the firm's name and FRN print on every invoice and letter.
 *    A missing FRN is the kind of thing a client's own auditor notices.
 *
 * — and one is softer, because the system already fails safe on it:
 *
 *  - `dueDates`: an unconfirmed rule puts no date on anything
 *    (`lib/compliance/dueDate.js` refuses), so the calendar is empty
 *    rather than wrong. It is the owner's to confirm and nobody else's,
 *    and it cannot be done from here.
 *
 * `runner` is left out entirely: the Background jobs section above says the
 * same thing with more detail, and reporting it twice reads like two
 * problems.
 */
const GO_LIVE_BLOCKERS = new Set(["sampleData", "firm", "branchGstin"]);
const REPORTED_ELSEWHERE = new Set(["runner", "failedJobs"]);

/**
 * The go-live blockers that are data, not code.
 * @returns {Promise<number>} failures
 */
/**
 * Audit files that do not say what was concluded.
 *
 * An opinion is the audit report. Blank is fine while the work is running —
 * the opinion is formed at the end — so that is a warning. Blank on a file
 * that is completed, carries a UDIN or has a report date is a failure: that
 * file reads as a finished audit to everybody who opens it and says nothing
 * at all, and it is exactly what `docs/BUG_AUDIT_OPINION.md` describes being
 * able to happen silently.
 *
 * Nothing here fills anything in. `npm run opinions:empty` lists the records
 * with the names and dates a CA needs to correct them one by one.
 */
async function checkAuditOpinions() {
  const { default: Engagement } = await import("../models/Engagement.js");
  const { EMPTY_OPINION_QUERY, CLOSED_WITHOUT_OPINION_QUERY } =
    await import("../lib/practice/books.js");

  const blank = await Engagement.countDocuments(EMPTY_OPINION_QUERY);
  const closed = await Engagement.countDocuments(CLOSED_WITHOUT_OPINION_QUERY);

  if (closed) {
    fail(
      `${closed} audit file(s) are completed, numbered or dated with no opinion on record. A CA must read each report and enter the opinion that was given: \`npm run opinions:empty\` lists them.`,
    );
    return 1;
  }
  if (blank) {
    warn(
      `${blank} audit engagement(s) have no opinion yet. That is normal while the work is running — none of them can be completed or given a UDIN until it is entered (\`npm run opinions:empty\`).`,
    );
    return 0;
  }
  pass("every audit file that is closed or numbered says what was concluded");
  return 0;
}

async function readiness() {
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

  let failures = 0;
  for (const item of items) {
    if (REPORTED_ELSEWHERE.has(item.key)) continue;
    const line = `${item.count} ${item.title} — ${item.detail} (${item.href})`;
    if (GO_LIVE_BLOCKERS.has(item.key)) {
      fail(line);
      failures += 1;
    } else {
      warn(line);
    }
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

  /*
   * The runner's heartbeat used to be reported here as well. It has moved
   * to `checkJobQueue`, which has its own section and judges the backlog
   * too — one place that answers "is anything scheduled actually running".
   */

  return failures;
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

  console.log("\nAudit opinions");
  failures += await checkAuditOpinions();

  console.log("\nFile vault");
  failures += await checkVault();

  console.log("\nBackground jobs");
  failures += await checkJobQueue();

  console.log("\nClient email");
  failures += await checkClientMail();

  console.log("\nThe browser suite");
  failures += checkE2eGuard();

  console.log("\nStill to do before the firm relies on this");
  failures += await readiness();

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
