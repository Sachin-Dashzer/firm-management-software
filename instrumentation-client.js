// @ts-check

/**
 * The browser half. A crash in a client component never reaches the server,
 * so without this the staff member sees the error page and we hear nothing
 * unless they telephone.
 *
 * The SDK is ~60 KB, which is half as much again as this app's whole shared
 * bundle, so it is loaded only when there is somewhere to send events. With
 * no DSN the import below is never reached and nothing is downloaded.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import("./lib/observability/sentry.js").then(({ initSentry }) =>
    initSentry({ dsn }),
  );
}
