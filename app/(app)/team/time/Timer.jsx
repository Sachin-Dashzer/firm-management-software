"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Stop, X } from "@phosphor-icons/react";
import { startTimer, stopTimer, cancelTimer } from "./actions";

/**
 * The clock (P3-28).
 *
 * It sits on My day as well as on the timesheet, because the moment
 * somebody starts work is the only moment they will ever remember to start
 * a timer, and My day is where they already are.
 *
 * **The elapsed figure counts up in the browser; the minutes are counted
 * on the server.** What is on screen is read off `startedAt`, so a tab
 * left open overnight, a laptop that slept, or a clock nobody trusts
 * cannot put an hour on the sheet that nobody worked: the server subtracts
 * the two moments itself when the clock stops.
 *
 * There is no animation on it. A figure that changes every second is data,
 * and dressing a number in motion once a second is the kind of thing that
 * is charming for a day and irritating for a year.
 */
export default function Timer({ jobs, running }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(startTimer, null);
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  /* One interval, only while something is running. */
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  async function finish(what) {
    setBusy(true);
    const result = await (what === "stop" ? stopTimer() : cancelTimer());
    setBusy(false);
    setMessage(result);
    router.refresh();
  }

  if (running) {
    const seconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(running.startedAt).getTime()) / 1000),
    );
    const job = jobs.find((j) => j.id === running.engagementId);

    return (
      <section className="rounded-ledger border-carbon bg-carbon-soft flex flex-wrap items-center gap-x-4 gap-y-2 border px-4 py-3">
        <span className="flex flex-col">
          <span className="text-12 text-ink-muted">Running since</span>
          <span className="num font-display text-24 leading-none">
            {clock(seconds)}
          </span>
        </span>
        <span className="text-14 min-w-0 flex-1">
          {job ? `${job.client} · ${job.label}` : running.what || "Work"}
        </span>
        <button
          type="button"
          onClick={() => finish("stop")}
          disabled={busy}
          className="rounded-control bg-carbon text-on-carbon text-14 flex h-9 items-center gap-1.5 px-3 font-medium disabled:opacity-60"
        >
          <Stop size={16} /> Stop and record
        </button>
        <button
          type="button"
          onClick={() => finish("cancel")}
          disabled={busy}
          className="rounded-control border-rule text-14 text-ink-muted flex h-9 items-center gap-1.5 border px-3 disabled:opacity-60"
        >
          <X size={16} /> Discard
        </button>
        {message?.error && (
          <p role="alert" className="text-13 text-redpen w-full">
            {message.error}
          </p>
        )}
      </section>
    );
  }

  return (
    <form
      action={action}
      className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border px-4 py-3 sm:flex-row sm:items-end"
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">
          Start the clock on
        </span>
        <select
          name="engagementId"
          defaultValue=""
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        >
          <option value="">— something else —</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.client} · {job.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">
          Or say what it is
        </span>
        <input
          name="what"
          maxLength={200}
          placeholder="Training, admin, a day at the bank"
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-control bg-carbon text-on-carbon text-14 flex h-9 items-center gap-1.5 px-3 font-medium disabled:opacity-60"
      >
        <Play size={16} /> Start
      </button>

      {state?.error && (
        <p role="alert" className="text-13 text-redpen w-full">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** h:mm:ss, with the hours only once there are some. */
function clock(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
