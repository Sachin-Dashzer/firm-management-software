/**
 * Empty the database before the firm starts using it, keeping the staff
 * logins. `npm run db:reset`
 *
 * **Read-only unless you pass `--apply`.** The dry run prints every
 * collection, how many documents are in it and whether it is being kept, so
 * the decision is made with the numbers in view.
 *
 *   npm run db:reset -- --db=phmg               what would go
 *   npm run db:reset -- --db=phmg --apply       take it out
 *
 * **This is a hard delete and there is no undo.** It is not
 * `npm run purge:sample`, which soft-deletes a tagged subset and leaves the
 * records in place (CLAUDE.md rule 3). This drops whole collections. The
 * rule exists because the *app* must never destroy a record a firm might
 * need; it does not mean the owner cannot clear a database that has never
 * held a real client. Use it before go-live, not after.
 *
 * **`users` is never touched.** The staff accounts and their 2FA secrets
 * survive, so you can still sign in afterwards. Everything else goes,
 * including `clientusers` — those are client portal logins, which belong to
 * clients that are being removed.
 *
 * **The database name must be typed.** `--db=` has to match the database the
 * URI actually points at. This codebase has already had one incident where a
 * test suite ran `deleteMany` against the firm's live cluster because
 * nothing made it say out loud which database it meant; a full wipe is not
 * getting the same chance.
 *
 * **Afterwards**, in this order:
 *
 *   npm run seed      branches, the service catalog, the 11 due-date rules,
 *                     the 8 document templates. The sample clients are
 *                     opt-in and do not come back.
 *   npm run doctor    rebuilds indexes and tells you what is left to set up.
 */

import mongoose from "mongoose";

const KEEP = ["users"];

const apply = process.argv.includes("--apply");
const named = (process.argv.find((a) => a.startsWith("--db=")) ?? "").slice(5);

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
    const count = await db.collection(collection).countDocuments({});
    if (KEEP.includes(collection)) {
      keeping += count;
      console.log(`  KEEP    ${collection.padEnd(24)} ${count}`);
    } else {
      going += count;
      console.log(`          ${collection.padEnd(24)} ${count}`);
    }
  }

  console.log(
    `\n  ${going} document(s) in ${names.length - KEEP.filter((k) => names.includes(k)).length} collection(s) would go.`,
  );
  console.log(`  ${keeping} staff login(s) in "users" would be kept.\n`);

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

  let dropped = 0;
  for (const collection of names) {
    if (KEEP.includes(collection)) continue;
    await db.collection(collection).drop();
    dropped += 1;
  }

  console.log(`  ${dropped} collection(s) dropped, ${going} document(s) gone.`);
  console.log(`  "users" untouched: ${keeping} login(s) still there.\n`);
  console.log("  Now, in this order:\n");
  console.log("      npm run seed      the firm's starter configuration");
  console.log("      npm run doctor    rebuilds indexes, says what is left\n");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`\n  ${error.message}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
