import Link from "next/link";

/**
 * A page that is not there (QA 09-11-2026, #32).
 *
 * Without this file Next draws its own black-and-white 404, which is the
 * one screen in the application that does not look like the application —
 * and it offers no way back, so a mistyped URL was a dead end.
 *
 * It serves two different visitors and says something useful to both: the
 * record that was deleted or never existed (every `[id]` route lands here
 * when the id is not one, since Phase 3 of these fixes), and the address
 * somebody typed wrong. No "404" in the heading: the number means nothing
 * to the people who use this.
 */
export const metadata = { title: "Not found · PHMG" };

export default function NotFound() {
  return (
    <main className="bg-paper text-ink mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="font-display text-24 font-bold tracking-tight">
        There is nothing here.
      </h1>
      <p className="text-14 max-w-[60ch]">
        Either the address is wrong, or the record it points at has been
        removed. Nothing has gone wrong with the system, and nothing you were
        working on has been lost.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/dashboard"
          className="rounded-ledger border-brass text-14 border px-3 py-1.5"
        >
          Firm dashboard
        </Link>
        <Link
          href="/clients"
          className="rounded-ledger border-rule text-14 border px-3 py-1.5"
        >
          Clients
        </Link>
        <Link
          href="/engagements"
          className="rounded-ledger border-rule text-14 border px-3 py-1.5"
        >
          Jobs
        </Link>
      </div>
    </main>
  );
}
