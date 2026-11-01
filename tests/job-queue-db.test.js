import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";

/**
 * The queue against a real MongoDB (`lib/jobs/queue.js`).
 *
 * The rest of the job tests are pure functions — back-off arithmetic,
 * schedule keys — and they pass whether or not the queue actually works.
 * The three things that decide whether the runner is safe cannot be tested
 * that way, because they are all about what the database does when two
 * runners ask at the same moment:
 *
 *  - a job is claimed by one runner and not two,
 *  - a lease that has run out lets another runner take the job over,
 *  - a job that keeps failing eventually stops being retried.
 *
 * The audit that opened this work found 88 jobs queued and 0 ever
 * processed, so none of this had been exercised in practice either.
 *
 * Uses the same throwaway replica set as the browser suite. A real one:
 * `findOneAndUpdate` atomicity is a property of the server, and a fake
 * would be testing the fake.
 */

/** @type {{ stop: () => Promise<unknown> }} */
let replset;
/** @type {typeof import("../lib/jobs/queue.js")} */
let queue;
/** @type {any} */
let Job;

beforeAll(async () => {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  process.env.MONGODB_URI = replset.getUri("phmg-jobs");

  queue = await import("../lib/jobs/queue.js");
  Job = (await import("../models/Job.js")).default;

  await mongoose.connect(process.env.MONGODB_URI);
  // the unique uniqueKey index matters to enqueue's collision path
  await Job.syncIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

beforeEach(async () => {
  await Job.deleteMany({});
});

describe("claiming a job", () => {
  it("gives one job to exactly one of two runners asking at once", async () => {
    await queue.enqueue("sendMail", { to: "someone@phmgindia.test" });

    /*
     * The real race: two cron ticks overlapping, which shared hosting does
     * routinely. Both ask at the same moment and one must come back empty.
     * If both got the job, the firm sends the same email twice.
     */
    const [first, second] = await Promise.all([
      queue.claimNext("runner-a"),
      queue.claimNext("runner-b"),
    ]);

    const won = [first, second].filter(Boolean);
    expect(won).toHaveLength(1);
    expect(won[0].lockedBy).toMatch(/^runner-[ab]$/);
    expect(won[0].status).toBe("running");
  });

  it("gives one job each when there are two to go round", async () => {
    await queue.enqueue("sendMail", { n: 1 });
    await queue.enqueue("reminders", { n: 2 });

    const [a, b] = await Promise.all([
      queue.claimNext("runner-a"),
      queue.claimNext("runner-b"),
    ]);

    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(String(a._id)).not.toBe(String(b._id));
  });

  it("counts the attempt as it claims", async () => {
    await queue.enqueue("sendMail", {});
    const job = await queue.claimNext("runner-a");
    expect(job.attempts).toBe(1);
  });

  it("leaves a job alone until it is due", async () => {
    const later = new Date(Date.now() + 60 * 60 * 1000);
    await queue.enqueue("sendMail", {}, { runAt: later });

    expect(await queue.claimNext("runner-a")).toBeNull();
  });

  it("returns nothing when the queue is empty", async () => {
    expect(await queue.claimNext("runner-a")).toBeNull();
  });

  it("does not hand a held job to a second runner", async () => {
    await queue.enqueue("sendMail", {});
    await queue.claimNext("runner-a");

    expect(await queue.claimNext("runner-b")).toBeNull();
  });
});

describe("a lease that has run out", () => {
  it("lets another runner take the job over", async () => {
    await queue.enqueue("sendMail", {});
    const held = await queue.claimNext("runner-a");
    expect(held.lockedBy).toBe("runner-a");

    /*
     * What a run killed mid-job by the host leaves behind: status
     * "running", a lease nobody is honouring. Without recovery those 88
     * queued jobs would include some that could never be picked up again.
     */
    const afterLease = new Date(Date.now() + (queue.LEASE_SECONDS + 1) * 1000);
    const taken = await queue.claimNext("runner-b", afterLease);

    expect(taken).toBeTruthy();
    expect(String(taken._id)).toBe(String(held._id));
    expect(taken.lockedBy).toBe("runner-b");
    expect(taken.attempts).toBe(2);
  });

  it("still refuses it one second before the lease expires", async () => {
    await queue.enqueue("sendMail", {});
    await queue.claimNext("runner-a");

    const justBefore = new Date(Date.now() + (queue.LEASE_SECONDS - 1) * 1000);
    expect(await queue.claimNext("runner-b", justBefore)).toBeNull();
  });
});

describe("a job that fails", () => {
  it("goes back on the queue with back-off while it has attempts left", async () => {
    await queue.enqueue("sendMail", {}, { maxAttempts: 3 });
    const job = await queue.claimNext("runner-a");

    const now = new Date();
    const outcome = await queue.fail(job, new Error("smtp refused"), now);
    expect(outcome.gaveUp).toBe(false);
    expect(outcome.retryIn).toBe(60);

    const again = await Job.findById(job._id).lean();
    expect(again.status).toBe("queued");
    expect(again.lastError).toBe("smtp refused");
    expect(again.lockedBy).toBeNull();
    expect(again.runAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("is given up on after the last attempt, and kept for the admin screen", async () => {
    await queue.enqueue("sendMail", {}, { maxAttempts: 2 });

    // attempt 1 fails and is requeued
    let job = await queue.claimNext("runner-a");
    await queue.fail(job, new Error("first"), new Date());

    // attempt 2 is the last one: it must stick as failed, not loop forever
    job = await Job.findById(job._id);
    job = await queue.claimNext("runner-a", new Date(Date.now() + 120_000));
    const outcome = await queue.fail(job, new Error("second"), new Date());

    expect(outcome.gaveUp).toBe(true);
    const dead = await Job.findById(job._id).lean();
    expect(dead.status).toBe("failed");
    expect(dead.lastError).toBe("second");
    expect(dead.finishedAt).toBeTruthy();
  });

  it("truncates a huge error rather than storing it whole", async () => {
    await queue.enqueue("sendMail", {});
    const job = await queue.claimNext("runner-a");
    await queue.fail(job, new Error("x".repeat(5000)), new Date());

    const stored = await Job.findById(job._id).lean();
    expect(stored.lastError.length).toBeLessThanOrEqual(2000);
  });
});

describe("finishing a job", () => {
  it("marks it done and releases the lease", async () => {
    await queue.enqueue("sendMail", {});
    const job = await queue.claimNext("runner-a");
    await queue.finish(job, { sent: 1 });

    const done = await Job.findById(job._id).lean();
    expect(done.status).toBe("done");
    expect(done.result).toEqual({ sent: 1 });
    expect(done.lockedUntil).toBeNull();
    expect(await queue.claimNext("runner-b")).toBeNull();
  });
});

describe("enqueuing the same scheduled job twice", () => {
  it("is harmless, which is what makes offering every schedule safe", async () => {
    const first = await queue.enqueue("dailyDigest", {}, { uniqueKey: "digest:2026-11-01" });
    const second = await queue.enqueue("dailyDigest", {}, { uniqueKey: "digest:2026-11-01" });

    expect(first.added).toBe(true);
    expect(second.added).toBe(false);
    expect(await Job.countDocuments({ type: "dailyDigest" })).toBe(1);
  });

  it("does not collide when there is no unique key", async () => {
    await queue.enqueue("sendMail", {});
    await queue.enqueue("sendMail", {});
    expect(await Job.countDocuments({ type: "sendMail" })).toBe(2);
  });
});

describe("queue health", () => {
  it("reports a stale runner when no pass has ever been recorded", async () => {
    const Counter = (await import("../models/Counter.js")).default;
    await Counter.deleteOne({ _id: queue.HEARTBEAT_ID });

    const health = await queue.queueHealth();
    expect(health.stale).toBe(true);
    expect(health.lastRun).toBeNull();
  });

  it("is not stale just after a heartbeat, and counts what is queued", async () => {
    await queue.enqueue("sendMail", {});
    await queue.heartbeat({ ran: 1, seconds: 0.2 });

    const health = await queue.queueHealth();
    expect(health.stale).toBe(false);
    expect(health.byStatus.queued).toBe(1);
  });
});
