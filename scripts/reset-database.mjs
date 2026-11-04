/**
 * Clear the firm's working records, keeping the setup. `npm run db:reset`
 *
 * **Read-only unless you pass `--apply`.** The dry run prints every
 * collection, how many documents are in it and whether it is being kept, so
 * the decision is made with the numbers in view.
 *
 *   npm run db:reset -- --db=phmg               what would go
 *   npm run db:reset -- --db=phmg --apply       take it out
 *
 * **What is kept** is what somebody at the firm set up and no client
 * appears in: the staff logins and their 2FA secrets, the four branches,
 * the service catalog, the document templates, the due-date master and the
 * rules a partner has confirmed, the firm settings and the notification
 * rules the firm has retimed or reworded — **and the signed registers,
 * `certificates`, `udins` and `dscs`**, which outlive the client they were
 * written for: somebody will ask about a signed certificate, about which
 * UDIN went on what, or about whose token the firm had in a drawer, years
 * after that client has gone. `KEEP` below is the whole list, and it is a
 * list of *models*, so a renamed collection cannot quietly fall out of it.
 *
 * **Everything else goes**, which is every other record with a client in it
 * and every log of the firm working: clients and their groups, contacts,
 * credentials and portal logins, engagements, tasks, comments, documents,
 * invoices, payments, the audit log, the job queue, notifications, the
 * notices and audit files, timesheets, leave, incidents, announcements and
 * saved views. A collection this script has never heard of goes too — for a
 * database about to hold real records that is the safe direction to be
 * wrong in.
 *
 * Three things the demo dataset hides inside the *kept* collections are
 * named explicitly and go as well: the invented colleagues in `users`,
 * found by their `@sample.phmgindia.test` address, the invented GSTIN on a
 * branch, and any register row against an invented client. A real
 * colleague, a branch since given its real registration and a real
 * register row are left alone. On the local storage driver the vault
 * directory is emptied too, since nothing can reach those bytes once the
 * rows are gone.
 *
 * What a kept register row loses is its client: the `clientId` on it will
 * point at nothing, and the screens print "Client" / "A client" where the
 * name was. Everything that makes the row evidence — the number, the UDIN,
 * the paragraphs as signed, the member and their membership number, whose
 * token it is and when it expires, the dates — is on the row itself, which
 * is the point of these being their own records rather than fields on an
 * engagement.
 *
 * Note on numbering: `counters` goes **except** the `certificate:` series,
 * which stays with the certificates it numbered — see `PART` below. So the
 * GST invoice series starts again at 1, which is right for a database that
 * has never issued a real invoice and wrong for one that has — in which
 * case do not run this at all.
 *
 * **This is a hard delete and there is no undo.** It is not
 * `npm run purge:sample`, which soft-deletes the tagged demo clients and
 * leaves the rows in place (CLAUDE.md rule 3). The rule exists because the
 * *app* must never destroy a record a firm might need; it does not mean the
 * owner cannot clear a database that has only ever held test records. Use
 * it before go-live, not after.
 *
 * **The database name must be typed.** `--db=` has to match the database the
 * URI actually points at. This codebase has already had one incident where a
 * test suite ran `deleteMany` against the firm's live cluster because
 * nothing made it say out loud which database it meant; a full wipe is not
 * getting the same chance.
 *
 * **Afterwards**: `npm run doctor`. The setup is already there, so a
 * re-seed is only needed if you are starting from an empty database —
 * `npm run seed` is safe either way and adds nothing that is present.
 */

import { rm } from "node:fs/promises";
import mongoose from "mongoose";
import { driverName } from "../lib/storage/index.js";
import { vaultDir } from "../lib/storage/local.js";
import {
  SAMPLE_DOMAIN,
  SAMPLE_TAG,
  SAMPLE_BRANCH_STATE,
  SAMPLE_FIRM_PAN,
  makeGstin,
} from "./sample.js";
import Client from "../models/Client.js";
import User from "../models/User.js";
import Branch from "../models/Branch.js";
import ServiceTemplate from "../models/ServiceTemplate.js";
import DocTemplate from "../models/DocTemplate.js";
import DueDateRule from "../models/DueDateRule.js";
import RuleConfirmation from "../models/RuleConfirmation.js";
import FirmSettings from "../models/FirmSettings.js";
import NotificationRule from "../models/NotificationRule.js";
import Certificate from "../models/Certificate.js";
import Udin from "../models/Udin.js";
import Dsc from "../models/Dsc.js";
import Counter from "../models/Counter.js";

/**
 * The signed registers: kept, but a row against an invented client goes
 * with that client. Each one is a thing the firm signed, held or was asked
 * to answer for, and each outlives the engagement and the client.
 */
const REGISTERS = [Certificate, Udin, Dsc];

/** What to call one of them in a sentence. */
const REGISTER_LABELS = {
  Certificate: "certificate",
  Udin: "UDIN",
  Dsc: "DSC token",
};

/**
 * The firm's own setup, by model rather than by collection name, so the
 * list cannot drift from what Mongoose actually reads.
 */
const KEEP = [
  User,
  Branch,
  ServiceTemplate,
  DocTemplate,
  DueDateRule,
  RuleConfirmation,
  FirmSettings,
  NotificationRule,
  ...REGISTERS,
].map((model) => model.collection.name);

/**
 * Collections emptied except for some of their rows, keyed by collection
 * and holding the filter for the rows that **go**.
 *
 * One entry, and it exists because certificates are kept. A certificate's
 * number came out of a counter when its draft was started
 * (`lib/practice/certificateNumber.js`), and the unique index on the
 * register means handing that number out twice is not a cosmetic problem —
 * so the `certificate:` counters stay with the certificates they numbered.
 * Every other counter goes: the invoice series, the client and engagement
 * codes, the audit chain and the job heartbeat all reset with the
 * collections they count.
 */
const PART = {
  [Counter.collection.name]: { _id: { $not: /^certificate:/ } },
};

const apply = process.argv.includes("--apply");
const named = (process.argv.find((a) => a.startsWith("--db=")) ?? "").slice(5);

/**
 * The clients the demo dataset invented, by the tag `scripts/sample.js`
 * writes on them — the same question `npm run purge:sample` asks, so the
 * two cannot disagree about which clients are real.
 *
 * @param {import("mongodb").Db} db
 * @returns {Promise<any[]>}
 */
function inventedClientIds(db) {
  return db.collection(Client.collection.name).distinct("_id", {
    tags: SAMPLE_TAG,
  });
}

function hostOf(uri) {
  try {
    return new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).host;
  } catch {
    return "(unreadable)";
  }
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error(
      "\n  MONGODB_URI is not set. Run through `npm run db:reset`.\n",
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const name = mongoose.connection.name;

  console.log(`\n  ${name} at ${hostOf(process.env.MONGODB_URI)}\n`);

  if (named !== name) {
    console.error(
      named
        ? `  --db=${named} does not match the database this URI opens, which is "${name}".\n  Nothing was changed. Check which cluster you meant.\n`
        : `  Say which database you mean:\n\n      npm run db:reset -- --db=${name}\n\n  Nothing was changed.\n`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const names = (await db.listCollections().toArray())
    .map((c) => c.name)
    .sort();

  let going = 0;
  let keeping = 0;

  for (const collection of names) {
    const rows = db.collection(collection);
    const total = await rows.countDocuments({});
    // what goes: nothing if kept whole, a filtered subset if partly kept
    const loss = KEEP.includes(collection)
      ? 0
      : await rows.countDocuments(PART[collection] ?? {});

    going += loss;
    keeping += total - loss;

    const mark = KEEP.includes(collection)
      ? "KEEP"
      : loss < total
        ? "PART"
        : "";
    const figure = loss === total ? String(total) : `${loss} of ${total}`;
    console.log(`  ${mark.padEnd(6)}  ${collection.padEnd(24)} ${figure}`);
  }

  console.log(
    `\n  ${going} document(s) in ${names.filter((c) => !KEEP.includes(c)).length} collection(s) would go.`,
  );
  console.log(
    `  ${keeping} document(s) would be kept, in: ${KEEP.filter((c) => names.includes(c)).join(", ")}` +
      `${
        Object.keys(PART).some((c) => names.includes(c))
          ? `, and part of ${Object.keys(PART)
              .filter((c) => names.includes(c))
              .join(", ")}`
          : ""
      }.\n`,
  );

  /*
   * Two things the demo dataset writes into collections that are *kept*, so
   * emptying the rest does not reach them: the invented colleagues, who are
   * staff logins, and the invented GSTIN on a branch. Both are matched
   * against exactly what `scripts/sample.js` writes — a real colleague and
   * a branch since given its real registration are left alone.
   */
  const inventedPeople = new RegExp(
    `@${SAMPLE_DOMAIN.replaceAll(".", String.raw`\.`)}$`,
  );
  const inventedCount = await db
    .collection(User.collection.name)
    .countDocuments({ email: inventedPeople });
  const inventedBranches = Object.entries(SAMPLE_BRANCH_STATE).map(
    ([code, stateCode]) => ({
      code,
      gstin: makeGstin(stateCode, SAMPLE_FIRM_PAN),
    }),
  );
  const inventedGstins = await db
    .collection(Branch.collection.name)
    .countDocuments({ $or: inventedBranches });

  /*
   * And the registers, for the same reason: they are kept, but a row
   * against an invented client is invented too. The real rows — which is
   * why those collections are kept at all — stay.
   *
   * The client ids are read **now**, while the clients are still here; the
   * loop below empties that collection.
   */
  const inventedClients = { clientId: { $in: await inventedClientIds(db) } };
  const inventedRegisters = REGISTERS.map((model) => ({
    collection: model.collection.name,
    label: REGISTER_LABELS[model.modelName],
  }));
  for (const row of inventedRegisters) {
    row.count = await db
      .collection(row.collection)
      .countDocuments(inventedClients);
  }
  const inventedRows = inventedRegisters.reduce((n, r) => n + r.count, 0);

  if (inventedCount || inventedGstins || inventedRows) {
    console.log(
      `  Of what is kept: ${inventedCount} invented colleague(s), ` +
        `${inventedGstins} invented branch GSTIN(s), and — against an ` +
        "invented client — " +
        `${inventedRegisters.map((r) => `${r.count} ${r.label}(s)`).join(", ")}` +
        ", go as well.\n",
    );
  }

  if (!apply) {
    console.log("  DRY RUN — nothing was changed.\n");
    console.log(
      "  There is no undo for this one, so read the list above before you\n" +
        "  run it. The audit log goes with everything else: its hash chain\n" +
        "  starts again from zero, which is right for a database that has\n" +
        "  only ever held test records and wrong for one that has not.\n",
    );
    console.log(`      npm run db:reset -- --db=${name} --apply\n`);
    await mongoose.disconnect();
    return;
  }

  console.log("  Taking it out…\n");

  /*
   * `deleteMany` rather than `drop`: the indexes stay, so the database is
   * usable the moment this finishes and nothing has to be rebuilt first.
   */
  let cleared = 0;
  for (const collection of names) {
    if (KEEP.includes(collection)) continue;
    await db.collection(collection).deleteMany(PART[collection] ?? {});
    cleared += 1;
  }

  if (inventedCount) {
    await db
      .collection(User.collection.name)
      .deleteMany({ email: inventedPeople });
  }
  for (const row of inventedRegisters) {
    if (row.count) {
      await db.collection(row.collection).deleteMany(inventedClients);
    }
  }
  if (inventedGstins) {
    await db
      .collection(Branch.collection.name)
      .updateMany(
        { $or: inventedBranches },
        { $set: { gstin: "", updatedBy: "db:reset" } },
      );
  }

  /*
   * The rows are gone, so the bytes behind them are orphans nothing can
   * reach. On the local driver they are ours to remove. On the gateway they
   * are not: deleting a firm's file store from a script is the owner's
   * decision and a different blast radius, so it says so instead.
   */
  if (driverName() === "local") {
    await rm(vaultDir(), { recursive: true, force: true });
    console.log(`  Local vault emptied: ${vaultDir()}`);
  } else {
    console.log(
      `  The ${driverName()} file store is untouched — the rows are gone, so\n` +
        "  anything left in it is unreachable. Clear it from cPanel if you\n" +
        "  want the space back.",
    );
  }

  console.log(`  ${cleared} collection(s) emptied, ${going} document(s) gone.`);
  console.log(`  Firm setup untouched: ${keeping} document(s) still there.\n`);
  console.log("  Now: npm run doctor — it says what is still left to set up.");
  console.log("  (`npm run seed` only if this was an empty database; it adds");
  console.log("  nothing that is already present.)\n");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`\n  ${error.message}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
