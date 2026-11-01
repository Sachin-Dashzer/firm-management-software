import { describe, it, expect, afterEach, vi } from "vitest";
import { skip2fa, twoFactorConfig } from "../lib/twoFactor.js";

/**
 * The second factor cannot be switched off in production
 * (`lib/twoFactor.js`).
 *
 * The go-live audit opened on this: `AUTH_SKIP_2FA=true` was in the firm's
 * `.env`, and the flag was trusted everywhere, so the password alone signed
 * anybody in. It is a reasonable thing to want on a laptop and an open door
 * on the real deployment, so it is now ignored there — and the fact that it
 * was set is still reported, because somebody who set it deliberately
 * should learn it did nothing.
 */

const saved = { ...process.env };

afterEach(() => {
  for (const key of ["AUTH_SKIP_2FA", "VERCEL_ENV", "NODE_ENV"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe("skip2fa", () => {
  it("skips on a developer's machine, which is the point of the flag", () => {
    process.env.AUTH_SKIP_2FA = "true";
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    expect(skip2fa()).toBe(true);
  });

  it("refuses to skip on a Vercel production deployment", () => {
    process.env.AUTH_SKIP_2FA = "true";
    process.env.VERCEL_ENV = "production";
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(skip2fa()).toBe(false);
  });

  it("still skips on a local production build, which is npm start", () => {
    /*
     * A production *build* is not a production *deployment*. This used to
     * expect false, from a second copy of inProduction() in twoFactor.js
     * that counted NODE_ENV — so the owner running the built app locally
     * would have been asked for a code while being told the hatch was on,
     * and the storage guard would have refused to boot at all.
     */
    process.env.AUTH_SKIP_2FA = "true";
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "production";
    expect(skip2fa()).toBe(true);
  });

  it("still skips on a preview deployment, which is not the firm's data", () => {
    process.env.AUTH_SKIP_2FA = "true";
    process.env.VERCEL_ENV = "preview";
    expect(skip2fa()).toBe(true);
  });

  it("is off unless asked for, in every environment", () => {
    delete process.env.AUTH_SKIP_2FA;
    process.env.VERCEL_ENV = "preview";
    expect(skip2fa()).toBe(false);

    process.env.AUTH_SKIP_2FA = "false";
    expect(skip2fa()).toBe(false);
  });

  // "1", "yes" and "TRUE" are not the flag: one spelling, so one meaning
  it("takes only the exact string true", () => {
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    for (const value of ["1", "yes", "TRUE", "True", " true"]) {
      process.env.AUTH_SKIP_2FA = value;
      expect(skip2fa()).toBe(false);
    }
  });
});

describe("twoFactorConfig, which is what doctor reports", () => {
  it("passes when the flag is absent", () => {
    delete process.env.AUTH_SKIP_2FA;
    expect(twoFactorConfig()).toMatchObject({ ok: true, skipping: false });
  });

  it("fails and says the password alone is enough, in development", () => {
    process.env.AUTH_SKIP_2FA = "true";
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";

    const report = twoFactorConfig();
    expect(report.ok).toBe(false);
    expect(report.skipping).toBe(true);
    expect(report.reason).toMatch(/password alone/);
  });

  it("fails but says sign-in is still safe, in production", () => {
    process.env.AUTH_SKIP_2FA = "true";
    process.env.VERCEL_ENV = "production";

    const report = twoFactorConfig();
    expect(report.ok).toBe(false);
    expect(report.ignored).toBe(true);
    expect(report.skipping).toBe(false);
    expect(report.reason).toMatch(/being ignored/);
  });
});
