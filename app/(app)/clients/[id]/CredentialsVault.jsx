"use client";

import { useState, useTransition } from "react";
import { PORTALS } from "@/lib/validators";
import { revealCredential, saveCredential, deleteCredential } from "../actions";

/**
 * Portal logins (spec section 3). Passwords are stored encrypted and shown
 * only when somebody presses Reveal, which writes an audit entry naming them.
 * A revealed password clears itself after a minute, so it does not sit on
 * screen in an open office.
 */
export default function CredentialsVault({ clientId, credentials, mayEdit }) {
  const [revealed, setRevealed] = useState({});
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  function reveal(id) {
    startTransition(async () => {
      const result = await revealCredential(id);
      if (result.error) {
        setMessage(result);
        return;
      }
      setRevealed((r) => ({ ...r, [id]: result }));
      setTimeout(() => setRevealed((r) => ({ ...r, [id]: undefined })), 60000);
    });
  }

  return (
    <section className="rounded-ledger border-brass bg-surface border p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-20">Portal logins</h2>
        {mayEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3"
          >
            {adding ? "Cancel" : "Add a login"}
          </button>
        )}
      </div>
      <p className="text-13 text-ink-muted mb-3">
        Stored encrypted. Every reveal is recorded in the portal log with your
        name and the time.
      </p>

      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen mb-3 border px-3 py-2"
        >
          {message.error}
        </p>
      )}
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed mb-3 border px-3 py-2"
        >
          {message.ok}
        </p>
      )}

      {adding && (
        <form
          action={(formData) =>
            startTransition(async () => {
              const result = await saveCredential(clientId, formData);
              setMessage(result);
              if (result?.ok) setAdding(false);
            })
          }
          className="rounded-ledger border-rule bg-paper mb-4 grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">Portal</span>
            <select
              name="portal"
              className="rounded-ledger border-rule bg-surface text-14 h-9 border px-2"
            >
              {PORTALS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Which one (optional)"
            name="label"
            placeholder="Delhi GSTIN"
          />
          <Input label="Username" name="username" required autoComplete="off" />
          <Input
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
          />
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
            >
              Save
            </button>
          </div>
          <Input
            label="Notes (also encrypted)"
            name="notes"
            className="sm:col-span-2 lg:col-span-5"
          />
        </form>
      )}

      {credentials.length === 0 ? (
        <p className="text-14 text-ink-muted">No portal logins stored.</p>
      ) : (
        <ul className="divide-rule flex flex-col divide-y">
          {credentials.map((c) => {
            const open = revealed[c.id];
            return (
              <li
                key={c.id}
                className="text-14 flex flex-wrap items-center gap-x-4 gap-y-2 py-2"
              >
                <span className="w-28 font-medium">{c.portal}</span>
                {c.label && (
                  <span className="text-13 text-ink-muted">{c.label}</span>
                )}
                <span className="text-13 font-mono">{c.username}</span>

                {open ? (
                  <>
                    <span className="rounded-ledger border-brass bg-waiting-wash text-14 border px-2 py-0.5 font-mono select-all">
                      {open.password}
                    </span>
                    {open.notes && (
                      <span className="text-13 text-ink-muted">
                        {open.notes}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setRevealed((r) => ({ ...r, [c.id]: undefined }))
                      }
                      className="text-13 text-carbon hover:underline"
                    >
                      Hide
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => reveal(c.id)}
                    className="rounded-ledger border-rule text-13 hover:bg-carbon-wash border px-2 py-1 disabled:opacity-60"
                  >
                    Reveal
                  </button>
                )}

                <span className="text-12 text-ink-muted ml-auto">
                  {c.lastRevealedAt
                    ? `last revealed ${c.lastRevealedAt}`
                    : "never revealed"}
                </span>

                {mayEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () =>
                        setMessage(await deleteCredential(clientId, c.id)),
                      )
                    }
                    className="rounded-ledger border-rule text-13 hover:bg-redpen-wash hover:text-redpen border px-2 py-1"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Input({ label, className = "", ...rest }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        className="rounded-ledger border-rule bg-surface text-14 h-9 border px-2"
        {...rest}
      />
    </label>
  );
}
