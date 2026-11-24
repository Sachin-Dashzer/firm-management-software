/**
 * Yesterday's folders become real folders (owner, 23-11-2026; P3-48c).
 * **Read-only unless you pass `--apply`.**
 *
 *   node --env-file-if-exists=.env scripts/kind-to-folders.mjs
 *   node --env-file-if-exists=.env scripts/kind-to-folders.mjs --apply
 *
 * The folders shipped on 23-11-2026 were a label on the document — its
 * `kind` — which was also the field meaning *what the document is*: PAN
 * card, engagement letter, acknowledgement. One field, two jobs, and the
 * work drive needs them separated: `Folder` now holds a folder, and `kind`
 * goes back to being the type.
 *
 * So every `kind` in use becomes a custom folder under its client, and the
 * documents in it get `folderId`. The old value is **kept in `kind`** where
 * it looks like a type and cleared where it looks like a folder — and since
 * nothing can tell those apart reliably, the rule is simply: a value that
 * was used as a folder by this client becomes a folder, and `kind` is
 * cleared on exactly those rows. The owner reads the dry run first and sees
 * every name that would move.
 *
 * One folder per client per name. A client with "Bank statements" and
 * another with "Bank statements" get one folder each, under their own
 * client, because that is what the two of them are.
 *
 * Every write is a transaction with its own audit entry attributed to
 * System (CLAUDE.md rule 2), and nothing is deleted.
 */

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import { systemAudit } from "../lib/audit/system.js";
import { recordAudit, ACTIONS } from "../lib/audit/index.js";
import Client from "../models/Client.js";
import Document from "../models/Document.js";
import Folder from "../models/Folder.js";

const apply = process.argv.includes("--apply");

try {
  await connectDB();

  /** Every client file that carries a label, grouped by client and name. */
  const rows = await Document.aggregate([
    {
      $match: {
        deletedAt: null,
        kind: { $nin: ["", null] },
        clientId: { $ne: null },
        folderId: null,
        zone: { $nin: ["firm", "personal"] },
      },
    },
    {
      $group: {
        _id: { clientId: "$clientId", kind: "$kind" },
        ids: { $push: "$_id" },
      },
    },
    { $sort: { "_id.clientId": 1, "_id.kind": 1 } },
  ]);

  if (rows.length === 0) {
    console.log("\n  No labelled files to move. Nothing to do.\n");
    process.exit(0);
  }

  const clients = await Client.find({
    _id: { $in: [...new Set(rows.map((r) => String(r._id.clientId)))] },
  })
    .select("legalName tradeName")
    .lean();
  const nameOf = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  let folders = 0;
  let files = 0;

  for (const row of rows) {
    const clientId = row._id.clientId;
    const label = String(row._id.kind).trim();
    if (!label) continue;

    const anchor = `clients/c-${clientId}`;
    const nameKey = label.toLowerCase();
    const client = nameOf.get(String(clientId)) ?? "a client";

    const existing = await Folder.findOne({ anchor, parentId: null, nameKey });

    console.log(
      `  ${client.slice(0, 34).padEnd(36)} ${label.slice(0, 28).padEnd(30)}` +
        ` ${String(row.ids.length).padStart(4)} file(s)` +
        (existing ? "  (folder already there)" : ""),
    );

    folders += existing ? 0 : 1;
    files += row.ids.length;

    if (!apply) continue;

    await systemAudit(async (session) => {
      let folder = existing;
      if (!folder) {
        const clientRecord = await Client.findById(clientId)
          .select("branchId")
          .session(session)
          .lean();
        [folder] = await Folder.create(
          [
            {
              name: label,
              nameKey,
              kind: "custom",
              zone: "client",
              anchor,
              parentId: null,
              clientId,
              branchId: clientRecord?.branchId ?? null,
              ancestors: [],
              depth: 0,
              createdBy: "system",
              updatedBy: "system",
            },
          ],
          { session },
        );
        await recordAudit(
          {
            action: ACTIONS.folderCreate,
            entityType: "Folder",
            entityId: folder._id,
            clientId,
            note: `${label} — made from the folder label the files carried (P3-48c)`,
          },
          session,
        );
      }

      /**
       * One document at a time, because the audit plugin cannot log an
       * `updateMany` and rule 2 wants an entry per change.
       *
       * ponytail: slow for a vault of tens of thousands of labelled files.
       * It is a one-off, and a batched version would have to write its own
       * audit entries by hand.
       */
      for (const id of row.ids) {
        const document = await Document.findById(id).session(session);
        if (!document) continue;
        document.folderId = folder._id;
        // the label was the folder; `kind` is free to mean the type again
        document.kind = "";
        document.updatedBy = "system";
        await document.save({ session });
      }
    });
  }

  console.log(
    `\n  ${folders} folder(s) ${apply ? "made" : "would be made"},` +
      ` ${files} file(s) ${apply ? "filed" : "would be filed"}.`,
  );
  if (!apply) {
    console.log("  DRY RUN — nothing was written. Add --apply.\n");
  } else {
    console.log("  Done.\n");
  }
} catch (error) {
  console.error(`\n  Failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close();
}
