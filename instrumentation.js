// @ts-check

/**
 * Next.js calls `register()` once per server runtime, before anything is
 * handled, and `onRequestError` for every error it catches while rendering
 * or running a server action.
 *
 * Sentry runs on the Node runtime only. Middleware errors are not reported:
 * it is fifty lines of auth redirect, and if it breaks every page fails and
 * the uptime monitor says so within five minutes (DEPLOY.md §8).
 *
 * ponytail: this file is bundled into the edge runtime too, and the edge
 * bundler cannot split code, so the SDK lands in the middleware bundle
 * whatever the guards say — 32 KB becomes 107 KB, against Vercel's 1 MB
 * limit. Measured, accepted, and the only way out is to stop reporting
 * server errors at all.
 */

const onNode = process.env.NEXT_RUNTIME === "nodejs";

export async function register() {
  if (!onNode) return;

  /**
   * **Refuse to start a production server that would lose documents.**
   *
   * With `STORAGE_DRIVER=local` every upload goes to the lambda's own disk,
   * which Vercel throws away on the next deploy. Nothing in the app treats
   * a missing file as an error, so the firm would find out months later,
   * when somebody opened a client's signed balance sheet and got nothing.
   *
   * Thrown here rather than warned about: a server that cannot keep a file
   * should not accept one.
   */
  const { checkProductionStorage } = await import("./lib/storage/production.js");
  const storage = checkProductionStorage();
  if (!storage.ok) {
    throw new Error(`Refusing to start: ${storage.reason}`);
  }

  if (!process.env.SENTRY_DSN) return;
  const { initSentry } = await import("./lib/observability/sentry.js");
  initSentry({ dsn: process.env.SENTRY_DSN });
}

/** @param {...any} args */
export async function onRequestError(...args) {
  if (!onNode || !process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  return Sentry.captureRequestError(...args);
}
