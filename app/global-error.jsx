"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * The last resort: something broke outside any page's own error boundary, so
 * the layout itself is gone and this replaces the whole document.
 *
 * It reports the crash and then shows the reference, because the first thing
 * anybody will be asked is "what did it say?". The report is sent through
 * whichever Sentry client is already running; if error tracking is switched
 * off, the page still works and nothing is loaded to send it.
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en-IN">
      <body className="bg-paper text-ink">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4">
          <h1 className="text-24 font-display">Something broke.</h1>
          <p className="text-14">
            Nothing you were working on has been lost — the change was either
            saved completely or not at all. Try again, and if it happens twice,
            quote the reference below.
          </p>
          {error?.digest && (
            <p className="text-13 text-ink-muted">
              Reference <span className="font-mono">{error.digest}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-ledger border-brass text-14 border px-3 py-1.5"
            >
              Try again
            </button>
            <a
              href="/issues"
              className="rounded-ledger border-rule text-14 border px-3 py-1.5"
            >
              Back to Issues
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
