"use client";

import { useActionState } from "react";
import { requestChange } from "./actions";

/**
 * The one thing a client can write anywhere in the system (P2-9b).
 *
 * It is a box and a button, and it says plainly that nothing changes until
 * a person has looked — because a client who believes they have updated
 * their own GSTIN and has not is worse off than one who knows they asked.
 */
export default function ChangeRequest() {
  const [state, action, pending] = useActionState(requestChange, null);

  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      <div>
        <h2 className="font-display text-20">Ask us to correct something</h2>
        <p className="text-13 text-ink-muted max-w-[65ch]">
          Tell us what is wrong and what it should be. Somebody who looks
          after your file will read it, check it, and make the change —
          nothing here changes your record by itself.
        </p>
      </div>

      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            What needs changing?
          </span>
          <textarea
            name="body"
            rows={4}
            required
            minLength={5}
            maxLength={2000}
            placeholder="Our registered address changed in August — the new one is…"
            className="rounded-ledger border-rule bg-paper text-14 border p-3"
          />
        </label>

        {state?.error && (
          <p
            role="alert"
            className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
          >
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p
            role="status"
            className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
          >
            {state.ok}
          </p>
        )}

        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send it to the firm"}
          </button>
        </div>
      </form>
    </section>
  );
}
