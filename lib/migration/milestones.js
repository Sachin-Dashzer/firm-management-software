// @ts-check

import Engagement from "../../models/Engagement.js";
import { systemAudit } from "../audit/system.js";
import { recordAudit, ACTIONS } from "../audit/index.js";
import { backfillMilestones } from "../engagements/milestones.js";

/**
 * Give engagements created before P3-1 the one filing they always had.
 *
 * Before P3-1 an engagement held a single `ackNo` and `filedOn`. This moves
 * each of those into one milestone so every screen reads the same shape, and
 * marks the row `schemaVersion: 2`.
 *
 * Two honest limits, both unavoidable:
 *
 * - The old shape never recorded **which due date was in force when the
 *   return went in**, so `dueDateAtFiling` is set from today's
 *   `statutoryDue`. For anything whose deadline was later extended that is a
 *   guess, and the punctuality report will read it as fact. The note on each
 *   audit entry says so.
 * - A pre-P3-1 GST engagement becomes **one** milestone, not two. There is
 *   nothing in the old row to say which of the pair the acknowledgement
 *   belonged to, and splitting it would be inventing a filing. Months from
 *   before the change therefore cannot show the GSTR-1 / GSTR-3B split; from
 *   P3-1 onward they can.
 *
 * Idempotent: a row that already has milestones is left alone, so running it
 * twice is safe.
 *
 * @param {{ dryRun?: boolean, limit?: number }} [options]
 */
export async function backfillEngagementMilestones({
  dryRun = false,
  limit = 20_000,
} = {}) {
  const pending = await Engagement.find({
    $or: [{ milestones: { $size: 0 } }, { milestones: { $exists: false } }],
  })
    .limit(limit)
    .withDeleted();

  const report = { looked: pending.length, moved: 0, guessed: 0, skipped: 0 };

  for (const engagement of pending) {
    if ((engagement.milestones ?? []).length) {
      report.skipped += 1;
      continue;
    }

    const wasFiled = Boolean(engagement.filedOn);
    backfillMilestones(engagement);
    if (wasFiled && engagement.statutoryDue) report.guessed += 1;

    if (dryRun) {
      report.moved += 1;
      continue;
    }

    await systemAudit(async (session) => {
      engagement.updatedBy = "migration:P3-1";
      await engagement.save({ session });

      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          diff: { schemaVersion: [1, 2] },
          note: wasFiled
            ? "P3-1 backfill: the filing moved into one milestone. The date it was judged against is taken from the current statutory date, because the old shape never recorded the date in force at filing — treat its punctuality as indicative."
            : "P3-1 backfill: one empty milestone created from the service.",
        },
        session,
      );
    });

    report.moved += 1;
  }

  return report;
}
