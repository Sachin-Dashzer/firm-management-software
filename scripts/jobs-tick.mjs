/**
 * One pass of the job runner, by hand. `npm run jobs:tick`
 *
 * The same `runOnce()` that cron calls — not a copy of it — so what this
 * prints is what the firm's scheduled run would do. Useful for draining a
 * queue while setting things up, and for seeing a handler's error without
 * waiting five minutes for the next tick.
 *
 * Reads `MONGODB_URI` from the environment, which `npm run jobs:tick`
 * fills from `.env`. Point it somewhere else deliberately:
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/phmg npm run jobs:tick
 *
 * It says which database it is about to work on before it starts, because
 * a tick against the firm's queue sends real email.
 */

import mongoose from "mongoose";
import { runOnce } from "../lib/jobs/run.js";
import { queueHealth } from "../lib/jobs/queue.js";

function hostOf(uri) {
  try {
    return new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).host;
  } catch {
    return "(unreadable)";
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "\n  MONGODB_URI is not set. Run through `npm run jobs:tick`, which loads .env.\n",
    );
    process.exit(1);
  }

  console.log(`\n  Job runner, one pass against ${hostOf(uri)}`);

  const before = await queueHealth();
  console.log(`  Queue before: ${describe(before.byStatus)}`);
  if (before.lastRun) {
    console.log(`  Last pass: ${before.minutesSince} minutes ago (${before.runs} runs recorded)`);
  } else {
    console.log("  Last pass: never — this is the first time the runner has been started");
  }

  const summary = await runOnce();

  console.log(
    `\n  Scheduled ${summary.scheduled}, completed ${summary.done}, failed ${summary.failed}, in ${summary.seconds}s${summary.stoppedEarly ? " (stopped on time, not on work)" : ""}`,
  );

  for (const job of summary.details.done) {
    console.log(`    ok    ${job.type} ${summarise(job.result)}`);
  }
  for (const job of summary.details.failed) {
    console.log(
      `    FAIL  ${job.type}: ${job.error}${job.gaveUp ? " (gave up, left for the admin screen)" : ` (retrying in ${job.retryIn}s)`}`,
    );
  }

  const after = await queueHealth();
  console.log(`\n  Queue after: ${describe(after.byStatus)}\n`);

  await mongoose.disconnect();
  process.exit(summary.failed > 0 ? 2 : 0);
}

/** @param {Record<string, number>} byStatus */
function describe(byStatus) {
  const parts = Object.entries(byStatus).map(([status, n]) => `${n} ${status}`);
  return parts.length ? parts.join(", ") : "empty";
}

/** Keep a handler's return value to one readable line. */
function summarise(result) {
  if (result === null || result === undefined) return "";
  if (typeof result !== "object") return String(result);
  const text = JSON.stringify(result);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

main().catch(async (error) => {
  console.error(`\n  The runner itself failed: ${error.message}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
