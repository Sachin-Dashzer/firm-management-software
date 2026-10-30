"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMissingJobs } from "./actions";

/**
 * The periods with nothing in them, and the one button that fixes them
 * (P3-34 phase 4).
 *
 * This is the figure the screen exists for. A job list can show work that
 * is late; it cannot show a period **nobody opened a job for**, because
 * there is nothing in it to list. The sentence under the count says so,
 * because a number a reader cannot account for is a number they learn to
 * ignore.
 *
 * The confirm step is not ceremony. The button writes up to fifty
 * engagements, each assigned to somebody and each with a due date, and a
 * partner should see what it is about to do before it does it — including
 * the one thing it will *not* touch, which is a period somebody has
 * already marked as not the firm's miss.
 */
export default function NeverOpened({ count, fy, serviceId = "" }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setResult(null);
    startTransition(async () => {
      const outcome = await createMissingJobs({ fy, serviceId });
      setResult(outcome);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <section
      id="never-opened"
      className="rounded-ledger border-redpen/30 bg-redpen-wash flex flex-col gap-3 border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="num border-redpen text-redpen grid size-10 shrink-0 place-items-center rounded-full border border-dashed font-semibold"
          >
            {count}
          </span>
          <div>
            <p className="text-15 font-semibold">
              {count} closed {count === 1 ? "period has" : "periods have"} no
              job at all
            </p>
            <p className="text-13 text-ink-muted max-w-[72ch]">
              Worked out from each client&rsquo;s signed-up services — a normal
              job list can&rsquo;t show these, because there is nothing in them
              to list.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href="/compliance/monthly"
            className="rounded-control border-redpen/40 text-redpen hover:bg-redpen-soft text-13 h-9 border px-3 leading-9 font-medium"
          >
            See which
          </a>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming((was) => !was)}
            aria-expanded={confirming}
            className="rounded-control bg-redpen text-on-carbon text-13 h-9 px-3 font-medium disabled:opacity-60"
          >
            {pending ? "Opening…" : `Create all ${count} jobs`}
          </button>
        </div>
      </div>

      {confirming && (
        <div className="anim-pop rounded-control border-rule bg-surface flex flex-col gap-3 border p-3">
          <p className="text-13 max-w-[72ch]">
            This opens up to <span className="num font-semibold">50</span> jobs
            at a time, each with the service&rsquo;s usual assignee and reviewer
            and the due date from the confirmed rule. Periods you have marked{" "}
            <strong>not our miss</strong> are skipped, and so is any client
            whose branch you may not create work in.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={create}
              className="rounded-control bg-redpen text-on-carbon text-13 h-9 px-3 font-medium disabled:opacity-60"
            >
              Yes, open them
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-13 text-ink-muted underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          role="status"
          className="rounded-control border-rule bg-surface flex flex-col gap-1 border p-3"
        >
          {result.error ? (
            <p className="text-13 text-redpen">{result.error}</p>
          ) : (
            <p className="text-13">
              {result.created > 0
                ? `Opened ${result.created} ${result.created === 1 ? "job" : "jobs"}.`
                : (result.ok ?? "Nothing was opened.")}
              {result.remaining > 0 &&
                ` ${result.remaining} left — press it again.`}
            </p>
          )}

          {result.skipped?.length > 0 && (
            <>
              <p className="text-12 text-ink-muted">
                {result.skipped.length} skipped:
              </p>
              <ul className="text-12 text-ink-muted flex flex-col gap-0.5">
                {result.skipped.slice(0, 8).map((row, index) => (
                  <li key={index}>
                    {row.client} · {row.period} — {row.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
