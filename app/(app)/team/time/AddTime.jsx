"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { addTime } from "./actions";

/**
 * A line typed in (P3-28).
 *
 * Most time is recorded this way and not by a timer: nobody starts a clock
 * before a phone call, and a timesheet filled in on Friday afternoon is
 * still a timesheet. So this is the plain path and the clock is the
 * convenience, not the other way round.
 *
 * The form keeps the date and clears the rest, because the way anybody
 * fills a week is four lines for the same day in a row.
 */
export default function AddTime({ jobs, people, me, defaultDate }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addTime, null);
  const form = useRef(null);
  const hours = useRef(null);

  useEffect(() => {
    if (!state?.ok) return;
    const on = form.current?.elements.on?.value;
    form.current?.reset();
    if (on && form.current?.elements.on) form.current.elements.on.value = on;
    hours.current?.focus();
    router.refresh();
  }, [state, router]);

  return (
    <form
      ref={form}
      action={action}
      className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Day</span>
          <input
            type="date"
            name="on"
            required
            defaultValue={defaultDate}
            className="rounded-control border-rule bg-paper num text-14 h-9 border px-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Hours</span>
          <input
            ref={hours}
            name="hours"
            required
            inputMode="decimal"
            placeholder="2.5"
            className="rounded-control border-rule bg-paper num text-14 h-9 w-24 border px-2"
          />
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            On which job
          </span>
          <select
            name="engagementId"
            defaultValue=""
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          >
            <option value="">— not a job —</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.client} · {job.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-3 font-medium disabled:opacity-60"
        >
          Add
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            If it was not a job, what was it
          </span>
          <input
            name="what"
            maxLength={200}
            placeholder="Training, admin, travel"
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>

        {people.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              On whose sheet
            </span>
            <select
              name="userId"
              defaultValue={me}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <p className="text-12 text-faint">
        Hours as 2.5 or 2:30. A line on a job is the firm&rsquo;s chargeable
        time; a line on anything else is not, and that is the whole of how
        utilisation is worked out.
      </p>

      {state?.error && (
        <p role="alert" className="text-13 text-redpen">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-13 text-filed">
          {state.ok}
        </p>
      )}
    </form>
  );
}
