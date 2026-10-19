// @ts-check

import DocumentModel from "../models/Document.js";
import { remove } from "../lib/storage/index.js";
import { systemAudit } from "../lib/audit/system.js";
import { recordAudit, ACTIONS } from "../lib/audit/index.js";
import { RECYCLE_DAYS } from "../lib/storage/retention.js";

/**
 * Erase files that have sat in the recycle bin for their 90 days
 * (spec sections 6 and 14).
 *
 * The runner that calls this arrives in Step 7; the handler lives here now
 * because the bin starts filling the moment anyone deletes a file. It works
 * in small batches and reports what it did, because each cron run on shared
 * hosting has under a minute to finish.
 *
 * The document row is kept for ever, emptied of its file key: the record
 * that something existed and was destroyed is part of the audit trail, and
 * removing it would quietly erase that too.
 *
 * @param {{ batchSize?: number, now?: Date }} [options]
 */
export async function purgeRecycleBin({
  batchSize = 50,
  now = new Date(),
} = {}) {
  const cutoff = new Date(now.getTime() - RECYCLE_DAYS * 24 * 60 * 60 * 1000);

  const due = await DocumentModel.find({
    deletedAt: { $ne: null, $lt: cutoff },
    fileKey: { $ne: "" },
  })
    .setOptions({ withDeleted: true })
    .limit(batchSize);

  let purged = 0;
  const failed = [];

  for (const document of due) {
    try {
      await remove(document.fileKey, { purge: true });
      for (const version of document.versions ?? []) {
        await remove(version.fileKey, { purge: true }).catch(() => {});
      }

      await systemAudit(async (session) => {
        await recordAudit(
          {
            action: ACTIONS.documentDelete,
            entityType: "Document",
            entityId: document._id,
            clientId: document.clientId,
            note: `erased after ${RECYCLE_DAYS} days in the recycle bin: ${document.name}`,
          },
          session,
        );
        document.fileKey = "";
        document.versions = [];
        await document.save({ session });
      });

      purged += 1;
    } catch (err) {
      // leave it in the bin and try again next run rather than losing track
      failed.push({ id: String(document._id), error: err.message });
    }
  }

  return { purged, failed, considered: due.length };
}

export default purgeRecycleBin;
