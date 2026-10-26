// @ts-check

import Engagement from "../../models/Engagement.js";
import { systemAudit } from "../audit/system.js";
import { recordAudit, ACTIONS } from "../audit/index.js";

/**
 * Rename `Verified` to `Accepted` on checklist items (P3-2).
 *
 * The word changed because the state did. `Verified` sat at the end of
 * Requested → Received → Verified and meant "somebody looked at this". The
 * new chain separates the automatic format check from a person accepting,
 * and `Accepted` is what a person does.
 *
 * `Verified` stays valid in the schema and is read as settled everywhere, so
 * nothing breaks if this is never run. It is tidying, not a prerequisite —
 * which is why it does not touch `submissionCount`: an item accepted before
 * P3-2 has no submission history to invent, and guessing one would put a
 * number on screen that means nothing.
 *
 * Idempotent.
 *
 * @param {{ dryRun?: boolean, limit?: number }} [options]
 */
export async function renameVerifiedToAccepted({
  dryRun = false,
  limit = 20_000,
} = {}) {
  const pending = await Engagement.find({
    "checklist.status": "Verified",
  })
    .limit(limit)
    .withDeleted();

  const report = { looked: pending.length, engagements: 0, items: 0 };

  for (const engagement of pending) {
    const rows = (engagement.checklist ?? []).filter(
      (item) => item.status === "Verified",
    );
    if (!rows.length) continue;

    for (const item of rows) {
      item.status = "Accepted";
      // `verifiedBy` already held who did it; carry it to the new field so
      // the panel can say a name rather than going quiet
      if (!item.acceptedBy && item.verifiedBy)
        item.acceptedBy = item.verifiedBy;
    }

    report.items += rows.length;
    report.engagements += 1;

    if (dryRun) continue;

    await systemAudit(async (session) => {
      engagement.updatedBy = "migration:P3-2";
      await engagement.save({ session });
      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          diff: { checklist: ["Verified", "Accepted"] },
          note: `P3-2 rename: ${rows.length} checklist item(s) moved from Verified to Accepted. The state is the same; the word changed because a format check is no longer confused with a person accepting.`,
        },
        session,
      );
    });
  }

  return report;
}
