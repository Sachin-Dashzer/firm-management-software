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
  if (!onNode || !process.env.SENTRY_DSN) return;
  const { initSentry } = await import("./lib/observability/sentry.js");
  initSentry({ dsn: process.env.SENTRY_DSN });
}

/** @param {...any} args */
export async function onRequestError(...args) {
  if (!onNode || !process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  return Sentry.captureRequestError(...args);
}
