#!/usr/bin/env node
// @ts-check

/**
 * The job runner, as cPanel cron starts it (spec section 14).
 *
 *   cd /home/<user>/phmg-runner && /usr/bin/node runner/run.js >> runner.log 2>&1
 *
 * Use this when the BigRock plan has Node.js app support: it talks to Atlas
 * directly, so nothing depends on the website being awake. If the plan has
 * no Node.js, use the cron line in docs/DEPLOY.md that calls
 * `/api/jobs/run` instead — the same work, started a different way.
 *
 * It exits non-zero on a failure so cron's own mail tells someone.
 */

import mongoose from "mongoose";
import { runOnce } from "../lib/jobs/run.js";

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. See .env.example.");
    process.exit(1);
  }

  const summary = await runOnce();
  console.log(`${new Date().toISOString()} ${JSON.stringify(summary)}`);

  await mongoose.disconnect();

  // a job that gave up for the last time should be noticed, not buried
  if (summary.failed > 0) process.exit(2);
}

main().catch(async (err) => {
  console.error(`${new Date().toISOString()} runner failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
