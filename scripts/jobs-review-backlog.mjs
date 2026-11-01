/**
 * What is sitting in the job queue, and what sending it now would mean.
 *
 * The audit that opened this work found 88 jobs queued and none ever run,
 * because no cron job had ever been set up. Switching the runner on points
 * it at that backlog — and some of those jobs are client-facing reminders
 * and emails generated weeks ago. Draining them all at once would send a
 * client a chase for a deadline that has already passed, which is worse
 * than never having sent it.
 *
 * So this is a decision the owner makes, not one the runner makes quietly.
 * This script shows the backlog grouped by type and age. With `--apply` it
 * marks the ones the owner names as `expired` — kept, not deleted, so the
 * decision is on the record.
 *
 *   node --env-file=.env scripts/jobs-review-backlog.mjs
 *   node --env-file=.env scripts/jobs-review-backlog.mjs --expire-older-than=7 --types=reminders,sendMail
 *   node --env-file=.env scripts/jobs-review-backlog.mjs --expire-older-than=7 --types=reminders --apply
 *
 * Read-only unless `--apply` is given. Nothing is deleted, ever.
 */

import mongoose from "mongoose";
import Job from "../models/Job.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");

/** @param {string} name */
function flag(name) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const olderThanDays = flag("expire-older-than")
  ? Number(flag("expire-older-than"))
  : null;
const onlyTypes = flag("types")
  ? flag("types")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
  : null;

/** Whole days between then and now. */
function ageDays(date, now) {
  return Math.floor((now.getTime() - new Date(date).getTime()) / 86_400_000);
}

function bucket(days) {
  if (days < 1) return "today";
  if (days < 7) return "this week";
  if (days < 30) return "1–4 weeks";
  return "over a month";
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("\n  MONGODB_URI is not set. Run with --env-file=.env\n");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const now = new Date();

  const queued = await Job.find({ status: { $in: ["queued", "running"] } })
    .sort({ runAt: 1 })
    .lean();

  if (queued.length === 0) {
    console.log("\n  Nothing is waiting in the queue.\n");
    await mongoose.disconnect();
    return;
  }

  console.log(`\n  ${queued.length} jobs are waiting to run.\n`);

  /** @type {Map<string, {total: number, buckets: Map<string, number>, oldest: number}>} */
  const byType = new Map();
  for (const job of queued) {
    const days = ageDays(job.runAt ?? job.createdAt, now);
    const entry =
      byType.get(job.type) ??
      { total: 0, buckets: new Map(), oldest: 0 };
    entry.total += 1;
    entry.oldest = Math.max(entry.oldest, days);
    entry.buckets.set(bucket(days), (entry.buckets.get(bucket(days)) ?? 0) + 1);
    byType.set(job.type, entry);
  }

  const typeWidth = Math.max(...[...byType.keys()].map((t) => t.length), 4);
  console.log(`  ${"type".padEnd(typeWidth)}  count  oldest  spread`);
  console.log(`  ${"-".repeat(typeWidth)}  -----  ------  ------`);
  for (const [type, entry] of [...byType].sort((a, b) => b[1].total - a[1].total)) {
    const spread = [...entry.buckets]
      .map(([label, n]) => `${n} ${label}`)
      .join(", ");
    console.log(
      `  ${type.padEnd(typeWidth)}  ${String(entry.total).padStart(5)}  ${String(entry.oldest).padStart(4)}d  ${spread}`,
    );
  }

  /*
   * The ones that reach a client are called out separately: a late internal
   * digest is noise, a late chase to a client is a phone call the owner has
   * to make.
   */
  const clientFacing = queued.filter((j) =>
    ["sendMail", "reminders"].includes(j.type),
  );
  if (clientFacing.length) {
    console.log(
      `\n  ${clientFacing.length} of these can leave the building (sendMail, reminders).`,
    );
    console.log(
      "  Client email is off until the owner switches it on, so staff mail is the",
    );
    console.log("  immediate risk. Check Settings → Messages before the first tick.");
  }

  if (olderThanDays === null) {
    console.log(
      [
        "",
        "  Nothing has been changed. To mark the stale ones as expired, say which:",
        "",
        "    --expire-older-than=<days> --types=<comma,separated>",
        "",
        "  Add --apply to write it. Without it you get this list again with the",
        "  exact rows that would change.",
        "",
      ].join("\n"),
    );
    await mongoose.disconnect();
    return;
  }

  const doomed = queued.filter((job) => {
    if (ageDays(job.runAt ?? job.createdAt, now) < olderThanDays) return false;
    if (onlyTypes && !onlyTypes.includes(job.type)) return false;
    return true;
  });

  console.log(
    `\n  ${doomed.length} job${doomed.length === 1 ? "" : "s"} older than ${olderThanDays} day${olderThanDays === 1 ? "" : "s"}${onlyTypes ? ` of type ${onlyTypes.join(", ")}` : ""}:`,
  );
  for (const job of doomed.slice(0, 40)) {
    const days = ageDays(job.runAt ?? job.createdAt, now);
    console.log(`    ${job.type.padEnd(typeWidth)}  ${String(days).padStart(4)}d  ${job._id}`);
  }
  if (doomed.length > 40) console.log(`    … and ${doomed.length - 40} more`);

  if (!apply) {
    console.log(
      "\n  DRY RUN — nothing was changed. Add --apply to mark these expired.\n",
    );
    await mongoose.disconnect();
    return;
  }

  if (doomed.length === 0) {
    console.log("\n  Nothing matched, so nothing to do.\n");
    await mongoose.disconnect();
    return;
  }

  const result = await Job.updateMany(
    { _id: { $in: doomed.map((j) => j._id) } },
    {
      $set: {
        status: "expired",
        finishedAt: now,
        lockedBy: null,
        lockedUntil: null,
        lastError: `expired by jobs-review-backlog: older than ${olderThanDays} days when the runner was first switched on`,
      },
    },
  );

  console.log(
    `\n  ${result.modifiedCount} job${result.modifiedCount === 1 ? "" : "s"} marked expired. Nothing was deleted; the rows are still there.\n`,
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`\n  ${error.message}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
