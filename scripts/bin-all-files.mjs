/**
 * Send every file and every folder to the recycle bin. One-off.
 *
 *   node --env-file-if-exists=.env scripts/bin-all-files.mjs --db=phmg
 *   node --env-file-if-exists=.env scripts/bin-all-files.mjs --db=phmg --apply
 *
 * This is the app's own delete, run over everything at once: the same
 * `softDelete` the Documents screen calls, in the same audited transaction
 * (CLAUDE.md rules 2 and 3). Nothing is destroyed — the rows stay, flagged,
 * and a Partner can restore them from /documents/bin for 90 days or purge
 * them there.
 *
 * The database name must be typed, as `db:reset` requires, because a wipe
 * run against the wrong cluster is the one mistake worth making impossible.
 */

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import { systemAudit } from "../lib/audit/system.js";
import { recordAudit, ACTIONS } from "../lib/audit/index.js";
import Document from "../models/Document.js";
import Folder from "../models/Folder.js";

const apply = process.argv.includes("--apply");
const named = (process.argv.find((a) => a.startsWith("--db=")) ?? "").slice(5);

await connectDB();
const name = mongoose.connection.name;

if (named !== name) {
  console.error(
    named
      ? `\n  --db=${named} is not the database this URI opens, which is "${name}". Nothing was changed.\n`
      : `\n  Say which database you mean:\n\n      node --env-file-if-exists=.env scripts/bin-all-files.mjs --db=${name}\n\n  Nothing was changed.\n`,
  );
  await mongoose.disconnect();
  process.exit(1);
}

const documents = await Document.find({});
const folders = await Folder.find({});

console.log(`\n  ${name}\n`);
for (const d of documents) console.log(`  file    ${d.name}`);
for (const f of folders) console.log(`  folder  ${f.name}`);
console.log(
  `\n  ${documents.length} file(s) and ${folders.length} folder(s) to the recycle bin.\n`,
);

if (!apply) {
  console.log("  DRY RUN — nothing was changed. Add --apply.\n");
  await mongoose.disconnect();
  process.exit(0);
}

/*
 * One transaction per record rather than one for the lot: the audit chain
 * takes a sequence number per entry anyway, and a failure part-way leaves
 * the records it already binned correctly binned rather than rolling the
 * whole run back.
 */
for (const [rows, action, type] of [
  [documents, ACTIONS.documentDelete, "Document"],
  [folders, ACTIONS.folderDelete, "Folder"],
]) {
  for (const row of rows) {
    await systemAudit(async (session) => {
      await recordAudit(
        {
          action,
          entityType: type,
          entityId: row._id,
          clientId: row.clientId,
          note: row.name,
        },
        session,
      );
      row.updatedBy = "script:bin-all-files";
      await row.softDelete("script:bin-all-files", { session });
    });
  }
}

console.log(
  `  ${documents.length} file(s) and ${folders.length} folder(s) binned.`,
);
console.log("  Restore or purge them at /documents/bin.\n");

await mongoose.disconnect();
