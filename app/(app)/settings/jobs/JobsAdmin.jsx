"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelJob, retryJob, runNow } from "./actions";

/**
 * Whether the background work is happening, in one glance.
 *
 * The important line is the first one: if the runner has not checked in for
 * half an hour, cron has stopped and nothing is being generated, reminded
 * or purged — and nobody would otherwise notice until a deadline was missed.
 */
export default function JobsAdmin({ health, schedules }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(action) {
    startTransition(async () => {
      setMessage(await action());
      router.refresh();
    });
  }

  const queued = health.byStatus.queued ?? 0;
  const running = health.byStatus.running ?? 0;
  const failed = health.byStatus.failed ?? 0;

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Background jobs
          </h1>
          <p className="text-13 text-ink-muted">
            Work the system does on its own: generating recurring filings,
            reminders and clearing the recycle bin.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(runNow)}
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
        >
          {pending ? "Running…" : "Run now"}
        </button>
      </div>

      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      <section
        className={`rounded-ledger border p-4 ${
          health.stale
            ? "border-redpen bg-redpen-wash"
            : "border-filed bg-filed-wash"
        }`}
      >
        <p className="text-14 font-medium">
          {health.stale
            ? "The runner has not checked in."
            : "The runner is checking in normally."}
        </p>
        <p className="text-13 text-ink-muted">
          Last run {health.lastRunText}
          {health.minutesSince !== null &&
            ` · ${health.minutesSince} minutes ago`}{" "}
          · {health.runs} runs in total
        </p>
        {health.stale && (
          <p className="text-13 mt-2">
            Nothing is being generated or cleared while this is the case. Check
            the cron job in cPanel — the steps are in{" "}
            <span className="font-mono">docs/DEPLOY.md</span>.
          </p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Waiting" value={queued} />
        <Figure label="Running" value={running} />
        <Figure label="Given up" value={failed} tone={failed > 0} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-15 font-semibold">
          What runs, and when
        </h2>
        <div className="rounded-ledger border-rule bg-surface border">
          <table className="text-14 w-full">
            <tbody>
              {schedules.map((s) => (
                <tr key={s.key} className="border-rule border-b last:border-0">
                  <td className="num px-3 py-2">{s.at}</td>
                  <td className="px-3 py-2">{s.why || s.key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-12 text-ink-muted">
          Times are IST. The digest times can be changed under Messages; the
          rest run as listed.
        </p>
      </section>

      {health.failed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-15 font-semibold">
            Jobs that gave up
          </h2>
          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule bg-sunk text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">What happened</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {health.failed.map((job) => (
                  <tr
                    key={job.id}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2 font-mono">{job.type}</td>
                    <td className="num text-13 px-3 py-2">{job.when}</td>
                    <td className="text-13 px-3 py-2">
                      {job.lastError || "—"}
                      <span className="text-ink-muted">
                        {" "}
                        · {job.attempts} of {job.maxAttempts} tries
                      </span>
                    </td>
                    <td className="text-13 px-3 py-2">
                      <span className="flex gap-3">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => retryJob(job.id))}
                          className="underline underline-offset-4 disabled:opacity-60"
                        >
                          Try again
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => cancelJob(job.id))}
                          className="underline underline-offset-4 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Figure({ label, value, tone = false }) {
  return (
    <div
      className={`rounded-ledger border p-4 ${
        tone ? "border-redpen bg-redpen-wash" : "border-rule bg-surface"
      }`}
    >
      <p className="num font-display text-28">{value}</p>
      <p className="text-13 text-ink-muted">{label}</p>
    </div>
  );
}
