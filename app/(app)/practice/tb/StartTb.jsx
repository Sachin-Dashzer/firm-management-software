"use client";

import { useActionState } from "react";
import { startTrialBalance } from "./actions";

/** A set of statements, started on an audit that has a file open (P3-32). */
export default function StartTb({ engagements }) {
  const [state, action, pending] = useActionState(startTrialBalance, null);

  return (
    <form
      action={action}
      className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            On which audit
          </span>
          <select
            name="engagementId"
            required
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          >
            {engagements.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Where the trial balance comes from
          </span>
          <input
            name="source"
            maxLength={200}
            placeholder="Tally, exported by the client"
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-3 font-medium disabled:opacity-60"
        >
          {pending ? "Starting…" : "Start"}
        </button>
      </div>

      {state?.error && (
        <p role="alert" className="text-13 text-redpen">
          {state.error}
        </p>
      )}
    </form>
  );
}
