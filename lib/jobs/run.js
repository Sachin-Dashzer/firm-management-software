// @ts-check

import { randomUUID } from "node:crypto";
import { purgeRecycleBin } from "../../jobs/purgeRecycleBin.js";
import { generateRecurring } from "../../jobs/generateRecurring.js";
import { expireGrants } from "../../jobs/expireGrants.js";
import { sendMailJob } from "../../jobs/sendMail.js";
import { reminders } from "../../jobs/reminders.js";
import { dailyDigest, weeklySummary } from "../../jobs/digest.js";
import { loadRules } from "../mailer/rules.js";
import { claimNext, enqueue, fail, finish, heartbeat } from "./queue.js";
import { dueSchedules } from "./schedules.js";

/**
 * One pass of the job runner (spec section 14).
 *
 * This is the whole runner. The cPanel cron script and the secured Vercel
 * route are both thin wrappers around it, so whichever way the firm's
 * hosting lets us start it, the same code does the work.
 *
 * The hard rule is the clock: shared hosting kills a long process, so every
 * pass stops well inside its budget, finishing the job in hand and leaving
 * the rest for five minutes' time. A queue that drains slowly is fine; a
 * run killed halfway is not.
 */

/** One handler per job type. */
export const HANDLERS = {
  purgeRecycleBin: (payload) => purgeRecycleBin(payload ?? {}),
  generateRecurring: (payload) => generateRecurring(payload ?? {}),
  expireGrants: (payload) => expireGrants(payload ?? {}),
  sendMail: (payload) => sendMailJob(payload ?? {}),
  reminders: (payload) => reminders(payload ?? {}),
  dailyDigest: (payload) => dailyDigest(payload ?? {}),
  weeklySummary: (payload) => weeklySummary(payload ?? {}),
};

/** Stop starting new jobs after this many seconds (spec section 14: 60). */
export const BUDGET_SECONDS = Number(process.env.JOB_RUNNER_SECONDS || 45);

/**
 * @param {{ budgetSeconds?: number, now?: () => Date, maxJobs?: number }} [options]
 */
export async function runOnce(options = {}) {
  const started = Date.now();
  const now = options.now ?? (() => new Date());
  const budget = (options.budgetSeconds ?? BUDGET_SECONDS) * 1000;
  const maxJobs = options.maxJobs ?? 25;
  const runnerId = `${process.env.VERCEL_REGION ?? "runner"}-${randomUUID().slice(0, 8)}`;

  // 1. offer every schedule; repeats collide with the unique index.
  // The digests go out at the time the firm set in settings, so the rules
  // are read first — one small query a pass.
  let scheduled = 0;
  const rules = await loadRules();
  const times = Object.fromEntries(
    Object.values(rules)
      .filter((rule) => rule.atIST)
      .map((rule) => [rule.key, rule.atIST]),
  );

  for (const schedule of dueSchedules(now(), times)) {
    const result = await enqueue(schedule.type, schedule.payload ?? {}, {
      uniqueKey: schedule.uniqueKey,
      runAt: schedule.due,
    });
    if (result.added) scheduled += 1;
  }

  // 2. work through what is due, while there is time
  const done = [];
  const failed = [];

  while (done.length + failed.length < maxJobs) {
    if (Date.now() - started > budget) break;

    const job = await claimNext(runnerId, now());
    if (!job) break;

    const handler = HANDLERS[job.type];
    if (!handler) {
      await fail(job, new Error(`No handler for job type "${job.type}"`));
      failed.push({ type: job.type, error: "no handler" });
      continue;
    }

    try {
      const result = await handler(job.payload, job);
      await finish(job, result);
      done.push({ type: job.type, result });
    } catch (err) {
      const outcome = await fail(job, err, now());
      failed.push({
        type: job.type,
        error: String(err?.message ?? err),
        ...outcome,
      });
    }
  }

  const summary = {
    scheduled,
    done: done.length,
    failed: failed.length,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    // ran out of time rather than out of work
    stoppedEarly: Date.now() - started > budget,
  };

  await heartbeat(summary);
  return { ...summary, details: { done, failed } };
}
