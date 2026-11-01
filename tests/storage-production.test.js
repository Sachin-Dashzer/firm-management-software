import { describe, it, expect, afterEach } from "vitest";
import { checkProductionStorage, inProduction } from "../lib/storage/index.js";

/**
 * The guard that stops a production deployment storing documents on a disk
 * it is about to throw away (`lib/storage/index.js`).
 *
 * The firm's `.env` says `STORAGE_DRIVER="local"`, which is right for a
 * laptop and would be data loss on Vercel: the local driver writes to the
 * lambda's own filesystem, which is discarded on the next deploy. Nothing
 * in the app treats a missing file as an error, so the loss would be
 * silent — the reason this fails at boot rather than warning.
 */

const saved = { ...process.env };

afterEach(() => {
  for (const key of [
    "VERCEL_ENV",
    "NODE_ENV",
    "STORAGE_DRIVER",
    "STORAGE_GATEWAY_URL",
    "PHMG_ENV",
  ]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("what counts as production", () => {
  it("is Vercel's production environment", () => {
    process.env.VERCEL_ENV = "production";
    expect(inProduction()).toBe(true);
  });

  it("is not a Vercel preview, even on a production build", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.NODE_ENV = "production";
    expect(inProduction()).toBe(false);
  });

  it("is NOT a production build with no Vercel around it", () => {
    // `next start` on a laptop is a production build, not a deployment
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "production";
    expect(inProduction()).toBe(false);
  });

  it("is not a laptop", () => {
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    expect(inProduction()).toBe(false);
  });
});

describe("checkProductionStorage", () => {
  it("refuses the local driver in production, and says what to do", () => {
    process.env.VERCEL_ENV = "production";
    process.env.STORAGE_DRIVER = "local";

    const result = checkProductionStorage();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/STORAGE_DRIVER/);
    expect(result.reason).toMatch(/GATEWAY_DEPLOY/);
  });

  it("refuses the gateway driver with nowhere to send a file", () => {
    process.env.VERCEL_ENV = "production";
    process.env.STORAGE_DRIVER = "bigrock";
    delete process.env.STORAGE_GATEWAY_URL;

    const result = checkProductionStorage();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/STORAGE_GATEWAY_URL/);
  });

  it("passes a properly configured production deployment", () => {
    process.env.VERCEL_ENV = "production";
    process.env.STORAGE_DRIVER = "bigrock";
    process.env.STORAGE_GATEWAY_URL = "https://files.phmgindia.com";

    expect(checkProductionStorage()).toEqual({ ok: true });
  });

  // a laptop is allowed to use its own disk: that is the point of the driver
  it("leaves development alone, local driver and all", () => {
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    process.env.STORAGE_DRIVER = "local";

    expect(checkProductionStorage()).toEqual({ ok: true });
  });
});

describe("what NODE_ENV on its own must not do", () => {
  /*
   * The regression that cost a red e2e run and a broken `npm start`.
   *
   * A production *build* is not a production *deployment*. `next start`
   * sets NODE_ENV=production on a laptop, and both the browser suite and
   * the owner rely on serving the built app locally with the local file
   * driver — so a guard that read NODE_ENV refused to boot either one.
   */
  it("does not make a local `npm start` look like the firm's deployment", () => {
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "production";
    process.env.STORAGE_DRIVER = "local";

    expect(inProduction()).toBe(false);
    expect(checkProductionStorage()).toEqual({ ok: true });
  });

  it("still catches the real deployment, which is the whole point", () => {
    process.env.VERCEL_ENV = "production";
    process.env.STORAGE_DRIVER = "local";

    expect(inProduction()).toBe(true);
    expect(checkProductionStorage().ok).toBe(false);
  });
});
