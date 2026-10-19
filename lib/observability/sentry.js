// @ts-check

import * as Sentry from "@sentry/nextjs";
import { scrubEvent, scrubBreadcrumb } from "./scrub.js";

/**
 * One Sentry configuration for all three runtimes (spec §14 monitoring).
 *
 * Errors only: no performance tracing, no session replay, no profiling.
 * The firm has four offices and wants to be told when something breaks, not
 * a chart of page timings — and every one of those features would send more
 * of what a staff member was doing than an error report needs to.
 *
 * Without a DSN this does nothing at all, which is the state until the firm
 * creates the project (`docs/DEPLOY.md` §8).
 *
 * @param {{ dsn?: string }} [options]
 */
export function initSentry({ dsn } = {}) {
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // 2,000 is Sentry's default; a shorter value truncates a stack frame's
    // own text, which is the part worth keeping
    maxValueLength: 2000,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  return true;
}
