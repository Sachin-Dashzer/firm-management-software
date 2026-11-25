/**
 * Rebuild the two unique indexes that per-branch GST work widened (owner
 * request, 24-11-2026). **Read-only unless you pass `--apply`.**
 *
 *   node --env-file-if-exists=.env scripts/reindex-registrations.mjs
 *   node --env-file-if-exists=.env scripts/reindex-registrations.mjs --apply
 *
 * `engagements` was unique on client + service + period, and
 * `clientServices` on client + service. Both now carry `gstinId`, which is
 * what lets a client with registrations in three states have three GSTR-1s
 * for October rather than one.
 *
 * Mongoose creates the new index on its own but never drops the old one, and
 * while the old one is still there the second branch's return is refused by
 * the database exactly as before. `syncIndexes()` drops what the schema no
 * longer declares and builds what it does — nothing here is hand-rolled.
 *
 * It touches no documents: `gstinId` defaults to null, and null is a value
 * like any other in a unique key, so every engagement and subscription that
 * exists stays exactly as unique as it was.
 */

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import Engagement from "../models/Engagement.js";
import ClientService from "../models/ClientService.js";

const apply = process.argv.includes("--apply");

async function main() {
  await connectDB();

  for (const model of [Engagement, ClientService]) {
    const before = await model.collection.indexes();
    const names = before.map((i) => i.name);
    console.log(`\n${model.collection.collectionName}: ${names.join(", ")}`);

    if (!apply) {
      console.log("  (dry run — pass --apply to rebuild)");
      continue;
    }

    const dropped = await model.syncIndexes();
    console.log(
      dropped.length
        ? `  dropped: ${dropped.join(", ")}`
        : "  nothing to drop; already current",
    );
    const after = await model.collection.indexes();
    console.log(`  now: ${after.map((i) => i.name).join(", ")}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
