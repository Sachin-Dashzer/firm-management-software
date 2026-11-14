import { describe, expect, it, vi } from "vitest";

/**
 * The kick exists so a queued letter does not wait for the next cron pass
 * (lib/jobs/kick.js). Two things must hold, and both have bitten:
 *
 *  - it runs *after* the response, never inline, or the transaction that
 *    wrote the message log may not have committed yet
 *  - outside a request it does nothing at all, or the cPanel runner and
 *    `npm run jobs:tick` would crash on `after()`
 */
describe("the post-response queue kick", () => {
  it("hands the drain to after(), and runs the same runOnce cron runs", async () => {
    const pending = [];
    vi.doMock("next/server.js", () => ({
      after: (fn) => pending.push(fn),
    }));
    const runOnce = vi.fn().mockResolvedValue({ done: 1 });
    vi.doMock("../lib/jobs/run.js", () => ({ runOnce }));

    const { kickQueue } = await import("../lib/jobs/kick.js?after");
    kickQueue();

    // nothing has run yet: the response has not gone out
    expect(runOnce).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);

    await pending[0]();
    expect(runOnce).toHaveBeenCalledOnce();

    vi.doUnmock("next/server.js");
    vi.doUnmock("../lib/jobs/run.js");
  });

  it("does nothing outside a request, so the cron runner still works", async () => {
    vi.doMock("next/server.js", () => ({
      after: () => {
        throw new Error("`after` was called outside a request scope.");
      },
    }));

    const { kickQueue } = await import("../lib/jobs/kick.js?no-request");
    expect(() => kickQueue()).not.toThrow();

    vi.doUnmock("next/server.js");
  });
});
