// @ts-check

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import { backfillEngagementMilestones } from "../lib/migration/milestones.js";
import { renameVerifiedToAccepted } from "../lib/migration/checklist.js";

/**
 * Move pre-P3-1 filings into milestones, and rename Verified checklist
 * items to Accepted (P3-1, P3-2).
 *
 *   npm run backfill -- --dry-run
 *   npm run backfill
 *
 * Safe to run twice: work that already has milestones is left alone. Read
 * the limits in lib/migration/milestones.js before running it for real —
 * the punctuality of anything filed before P3-1 becomes indicative rather
 * than certain, because the old shape never recorded the due date that was
 * in force on the day.
 */

const dryRun = process.argv.includes("--dry-run");

try {
  await connectDB();
  const report = await backfillEngagementMilestones({ dryRun });
  const renamed = await renameVerifiedToAccepted({ dryRun });

  console.log(
    [
      dryRun ? "Dry run — nothing was written." : "Done.",
      `${report.looked} engagement(s) had no milestones.`,
      `${report.moved} ${dryRun ? "would move" : "moved"}.`,
      `${report.guessed} of those were already filed, so their punctuality is indicative only.`,
      report.skipped ? `${report.skipped} skipped.` : "",
      renamed.items
        ? `${renamed.items} checklist item(s) renamed Verified -> Accepted across ${renamed.engagements} engagement(s).`
        : "No checklist items needed renaming.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
} catch (err) {
  console.error(`Backfill failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
