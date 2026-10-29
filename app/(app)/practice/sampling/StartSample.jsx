"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startSample } from "./actions";

/** A working paper, started on an audit that already has a file (P3-30). */
export default function StartSample({ engagements }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(startSample, null);

  useEffect(() => {
    if (state?.id) router.push(`/practice/sampling/${state.id}`);
  }, [state, router]);

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
            What is being sampled
          </span>
          <input
            name="name"
            required
            maxLength={200}
            placeholder="Purchases"
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Paper ref</span>
          <input
            name="ref"
            maxLength={40}
            placeholder="H-4"
            className="rounded-control border-rule bg-paper num text-14 h-9 w-24 border px-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Area</span>
          <input
            name="area"
            maxLength={8}
            placeholder="H"
            className="rounded-control border-rule bg-paper num text-14 h-9 w-16 border px-2"
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
