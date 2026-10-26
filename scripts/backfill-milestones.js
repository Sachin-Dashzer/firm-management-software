// @ts-check

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import { backfillEngagementMilestones } from "../lib/migration/milestones.js";

/**
 * Move pre-P3-1 filings into milestones (P3-1).
 *
 *   npm run backfill:milestones -- --dry-run
 *   npm run backfill:milestones
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

  console.log(
    [
      dryRun ? "Dry run — nothing was written." : "Done.",
      `${report.looked} engagement(s) had no milestones.`,
      `${report.moved} ${dryRun ? "would move" : "moved"}.`,
      `${report.guessed} of those were already filed, so their punctuality is indicative only.`,
      report.skipped ? `${report.skipped} skipped.` : "",
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
