import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The guard on `/api/jobs/run` (`app/api/jobs/run/route.js`).
 *
 * This route is the whole of the firm's scheduling when the hosting has no
 * Node.js, and its only lock is a shared secret. Two things had to be
 * tested rather than assumed: that it never runs unauthenticated, and that
 * a missing secret is reported as a deployment fault instead of a 404 —
 * because a silent 404 is how a cron job appears to work for weeks while
 * running nothing, which is exactly what happened here.
 */

const SECRET = "a-long-enough-jobs-secret-for-the-route";

/** The runner itself is mocked: this is about the lock, not the work. */
const runOnce = vi.fn(async () => ({
  scheduled: 0,
  done: 0,
  failed: 0,
  seconds: 0,
  stoppedEarly: false,
  details: { done: [], failed: [] },
}));

vi.mock("@/lib/jobs/run", () => ({ runOnce }));

/** @type {typeof import("../app/api/jobs/run/route.js")} */
let route;

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.JOBS_SECRET = SECRET;
  delete process.env.CRON_SECRET;
  route = await import("../app/api/jobs/run/route.js");
});

afterEach(() => {
  delete process.env.JOBS_SECRET;
  delete process.env.CRON_SECRET;
});

/** @param {Record<string, string>} headers */
function request(headers = {}) {
  return new Request("https://phmg.example/api/jobs/run", {
    method: "POST",
    headers,
  });
}

describe("without a valid secret", () => {
  it("refuses a request carrying nothing, and does not run", async () => {
    const response = await route.POST(request());
    expect(response.status).toBe(404);
    expect(runOnce).not.toHaveBeenCalled();
  });

  it("refuses a wrong secret, and does not run", async () => {
    const response = await route.POST(request({ "x-jobs-secret": "wrong" }));
    expect(response.status).toBe(404);
    expect(runOnce).not.toHaveBeenCalled();
  });

  it("refuses a wrong bearer token, and does not run", async () => {
    const response = await route.POST(
      request({ authorization: "Bearer not-the-secret" }),
    );
    expect(response.status).toBe(404);
    expect(runOnce).not.toHaveBeenCalled();
  });

  it("says nothing about whether the route exists", async () => {
    const response = await route.POST(request({ "x-jobs-secret": "wrong" }));
    expect(await response.text()).toBe("Not found");
  });
});

describe("when JOBS_SECRET is not configured", () => {
  /*
   * 500 and a log line, not 404. Fails closed either way — the point is
   * that a deployment fault should look like one.
   */
  it("fails closed with a 500 and never runs unauthenticated", async () => {
    delete process.env.JOBS_SECRET;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await route.POST(request({ "x-jobs-secret": "anything" }));

    expect(response.status).toBe(500);
    expect(runOnce).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("JOBS_SECRET"));
    spy.mockRestore();
  });

  it("treats a too-short secret as not configured", async () => {
    process.env.JOBS_SECRET = "short";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await route.POST(request({ "x-jobs-secret": "short" }));

    expect(response.status).toBe(500);
    expect(runOnce).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("with the right secret", () => {
  it("runs one pass when cPanel cron sends the header", async () => {
    const response = await route.POST(request({ "x-jobs-secret": SECRET }));
    expect(response.status).toBe(200);
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("runs one pass when Vercel Cron sends a bearer token", async () => {
    const response = await route.POST(
      request({ authorization: `Bearer ${SECRET}` }),
    );
    expect(response.status).toBe(200);
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("accepts Vercel's own CRON_SECRET when the firm uses that name", async () => {
    process.env.CRON_SECRET = "a-different-long-secret-from-vercel-cron";
    const response = await route.POST(
      request({ authorization: `Bearer ${process.env.CRON_SECRET}` }),
    );
    expect(response.status).toBe(200);
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("answers a GET too, which is what curl sends by default", async () => {
    const response = await route.GET(request({ "x-jobs-secret": SECRET }));
    expect(response.status).toBe(200);
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("reports the summary the runner returned", async () => {
    const response = await route.POST(request({ "x-jobs-secret": SECRET }));
    expect(await response.json()).toMatchObject({ done: 0, failed: 0 });
  });

  it("turns a thrown handler into a 500 rather than a crash", async () => {
    runOnce.mockRejectedValueOnce(new Error("atlas unreachable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await route.POST(request({ "x-jobs-secret": SECRET }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "atlas unreachable" });
    spy.mockRestore();
  });
});
