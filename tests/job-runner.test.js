import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The runner loop itself, with the queue and the handlers stubbed.
 *
 * What matters here is behaviour under the two conditions shared hosting
 * actually produces: a queue longer than one run can finish, and a job that
 * throws. Neither needs a database to test, and both are the reason the
 * runner exists in this shape.
 */

vi.mock("../lib/jobs/queue.js", () => ({
  LEASE_SECONDS: 300,
  enqueue: vi.fn(async () => ({ added: true })),
  claimNext: vi.fn(),
  finish: vi.fn(async () => {}),
  fail: vi.fn(async () => ({ gaveUp: false, retryIn: 60 })),
  heartbeat: vi.fn(async () => {}),
}));

vi.mock("../jobs/purgeRecycleBin.js", () => ({
  purgeRecycleBin: vi.fn(async () => ({ purged: 0 })),
}));

// the runner reads the notification rules to find the firm's digest time;
// here the defaults will do, and they are tested on their own
vi.mock("../lib/mailer/rules.js", async () => {
  const actual = await import("../lib/mailer/rules.js?actual");
  return { ...actual, loadRules: vi.fn(async () => actual.RULE_DEFAULTS) };
});

const queue = await import("../lib/jobs/queue.js");
const { runOnce, HANDLERS } = await import("../lib/jobs/run.js");

beforeEach(() => {
  vi.clearAllMocks();
  queue.enqueue.mockResolvedValue({ added: true });
  queue.fail.mockResolvedValue({ gaveUp: false, retryIn: 60 });
});

/** A job row as the queue would hand one back. */
const job = (overrides = {}) => ({
  _id: Math.random().toString(36).slice(2),
  type: "purgeRecycleBin",
  payload: {},
  attempts: 1,
  maxAttempts: 5,
  ...overrides,
});

describe("one pass of the runner", () => {
  it("offers the schedules, then works until the queue is empty", async () => {
    queue.claimNext
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job())
      .mockResolvedValue(null);

    const summary = await runOnce();

    expect(queue.enqueue).toHaveBeenCalled();
    expect(summary.done).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.stoppedEarly).toBe(false);
    expect(queue.finish).toHaveBeenCalledTimes(2);
    expect(queue.heartbeat).toHaveBeenCalledTimes(1);
  });

  it("stops starting jobs once its time is up, leaving the rest queued", async () => {
    // always another job, each one slow enough to burn the budget
    queue.claimNext.mockImplementation(async () => job());
    HANDLERS.slowTest = async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return {};
    };
    queue.claimNext.mockImplementation(async () => job({ type: "slowTest" }));

    const summary = await runOnce({ budgetSeconds: 0.2 });

    expect(summary.stoppedEarly).toBe(true);
    // it finished the job in hand rather than abandoning it mid-way
    expect(queue.finish).toHaveBeenCalledTimes(summary.done);
    expect(summary.done).toBeLessThan(25);
    delete HANDLERS.slowTest;
  });

  it("never runs more than its batch, however long the queue", async () => {
    queue.claimNext.mockImplementation(async () => job());
    const summary = await runOnce({ maxJobs: 3 });
    expect(summary.done).toBe(3);
  });

  it("records a failure and carries on with the next job", async () => {
    HANDLERS.explodingTest = async () => {
      throw new Error("the gateway said no");
    };
    queue.claimNext
      .mockResolvedValueOnce(job({ type: "explodingTest" }))
      .mockResolvedValueOnce(job())
      .mockResolvedValue(null);

    const summary = await runOnce();

    expect(summary.failed).toBe(1);
    expect(summary.done).toBe(1);
    expect(queue.fail).toHaveBeenCalledTimes(1);
    expect(queue.fail.mock.calls[0][1].message).toBe("the gateway said no");
    delete HANDLERS.explodingTest;
  });

  it("fails a job whose type nobody handles, rather than looping on it", async () => {
    queue.claimNext
      .mockResolvedValueOnce(job({ type: "somethingRemoved" }))
      .mockResolvedValue(null);

    const summary = await runOnce();

    expect(summary.failed).toBe(1);
    expect(queue.fail.mock.calls[0][1].message).toMatch(/No handler/);
  });

  it("still writes a heartbeat when there was nothing to do", async () => {
    queue.claimNext.mockResolvedValue(null);
    const summary = await runOnce();
    expect(summary.done).toBe(0);
    expect(queue.heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ done: 0, failed: 0 }),
    );
  });

  it("counts only the schedules it actually added", async () => {
    // a second run the same night: every schedule collides, nothing added
    queue.enqueue.mockResolvedValue({ added: false });
    queue.claimNext.mockResolvedValue(null);

    const summary = await runOnce();
    expect(summary.scheduled).toBe(0);
  });
});
