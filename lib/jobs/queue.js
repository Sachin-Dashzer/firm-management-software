// @ts-check

import Job from "../../models/Job.js";
import Counter from "../../models/Counter.js";
import { connectDB } from "../db.js";

/**
 * The queue itself (spec section 14).
 *
 * Everything here assumes two runners can overlap — shared hosting cron is
 * not precise, and a slow run can still be going when the next one starts.
 * So a job is claimed with an atomic update that also takes a short lease,
 * and nothing is ever picked up by two runners at once.
 */

/** How long a runner holds a job before another may take it over. */
export const LEASE_SECONDS = Number(process.env.JOB_LEASE_SECONDS || 300);

/** The heartbeat and run count live on the counters collection. */
export const HEARTBEAT_ID = "jobs:heartbeat";

/**
 * Put a job on the queue.
 *
 * With a `uniqueKey`, enqueuing twice is harmless: the second one collides
 * with the unique index and is reported as already queued, which is what
 * makes the scheduled jobs safe to offer on every single run.
 *
 * @param {string} type
 * @param {object} [payload]
 * @param {{ runAt?: Date, uniqueKey?: string, maxAttempts?: number }} [options]
 * @returns {Promise<{ added: boolean, id?: string }>}
 */
export async function enqueue(type, payload = {}, options = {}) {
  await connectDB();
  try {
    const job = await Job.create({
      type,
      payload,
      runAt: options.runAt ?? new Date(),
      uniqueKey: options.uniqueKey ?? null,
      maxAttempts: options.maxAttempts ?? 5,
    });
    return { added: true, id: String(job._id) };
  } catch (err) {
    if (err?.code === 11000) return { added: false };
    throw err;
  }
}

/**
 * Take the next job that is due, and hold it.
 *
 * One `findOneAndUpdate` does the finding and the locking together, so two
 * runners asking at the same moment cannot both get the same row. A job
 * whose lease has run out is fair game again — that is how a run killed
 * mid-job by the host recovers.
 *
 * @param {string} runnerId
 * @param {Date} [now]
 */
export async function claimNext(runnerId, now = new Date()) {
  await connectDB();
  return Job.findOneAndUpdate(
    {
      status: { $in: ["queued", "running"] },
      runAt: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    {
      $set: {
        status: "running",
        startedAt: now,
        lockedBy: runnerId,
        lockedUntil: new Date(now.getTime() + LEASE_SECONDS * 1000),
      },
      $inc: { attempts: 1 },
    },
    { sort: { runAt: 1 }, new: true },
  );
}

/**
 * How long to wait before trying again: a minute, then two, four, eight,
 * sixteen. Long enough for a flapping gateway to come back, short enough
 * that nothing sits until tomorrow.
 * @param {number} attempts
 */
export function backoffSeconds(attempts) {
  return Math.min(60 * 2 ** Math.max(0, attempts - 1), 2 * 60 * 60);
}

/** @param {any} job @param {any} result */
export async function finish(job, result) {
  await Job.updateOne(
    { _id: job._id },
    {
      $set: {
        status: "done",
        result: result ?? null,
        finishedAt: new Date(),
        lockedUntil: null,
        lockedBy: null,
        lastError: "",
      },
    },
  );
}

/**
 * Record a failure: queue it again with back-off, or give up after the last
 * attempt and leave it on the admin screen (spec section 14).
 * @param {any} job
 * @param {Error} error
 * @param {Date} [now]
 */
export async function fail(job, error, now = new Date()) {
  const attempts = job.attempts ?? 1;
  const spent = attempts >= (job.maxAttempts ?? 5);
  const message = String(error?.message ?? error).slice(0, 2000);

  await Job.updateOne(
    { _id: job._id },
    {
      $set: {
        status: spent ? "failed" : "queued",
        lastError: message,
        lockedUntil: null,
        lockedBy: null,
        finishedAt: spent ? now : null,
        runAt: spent
          ? job.runAt
          : new Date(now.getTime() + backoffSeconds(attempts) * 1000),
      },
    },
  );

  return { gaveUp: spent, retryIn: spent ? 0 : backoffSeconds(attempts) };
}

/**
 * Say the runner is alive. The admin screen warns when this is older than
 * half an hour (spec section 14).
 * @param {{ ran?: number, seconds?: number }} [summary]
 */
export async function heartbeat(summary = {}) {
  await connectDB();
  await Counter.findOneAndUpdate(
    { _id: HEARTBEAT_ID },
    {
      $inc: { seq: 1 },
      // the counter's own updatedAt is the time of the last run
      $set: { lastHash: JSON.stringify(summary).slice(0, 500) },
    },
    { upsert: true },
  );
}

/** What the admin screen shows. */
export async function queueHealth(now = new Date()) {
  await connectDB();
  const [counts, beat, failed] = await Promise.all([
    Job.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Counter.findById(HEARTBEAT_ID).lean(),
    Job.find({ status: "failed" }).sort({ updatedAt: -1 }).limit(25).lean(),
  ]);

  const lastRun = beat?.updatedAt ? new Date(beat.updatedAt) : null;
  const minutesSince = lastRun
    ? Math.floor((now.getTime() - lastRun.getTime()) / 60000)
    : null;

  return {
    byStatus: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    lastRun,
    minutesSince,
    // 30 minutes is six missed cron runs: something is wrong (spec 14)
    stale: minutesSince === null || minutesSince > 30,
    runs: beat?.seq ?? 0,
    lastSummary: beat?.lastHash ?? "",
    failed,
  };
}
