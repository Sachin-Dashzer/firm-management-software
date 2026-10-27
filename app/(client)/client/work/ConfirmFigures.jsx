"use client";

import { useState, useTransition } from "react";
import { confirmFigures } from "../actions";

/**
 * The client's own gate (P3-5, P3-6).
 *
 * The firm has checked the work and is asking the client to agree the
 * figures before the return goes in — because the client, not the firm, owes
 * the tax. Confirming here is the record: it carries their name, the time,
 * and the version of the work they agreed to.
 *
 * Shown to everybody on the account, but only the people the firm has given
 * the right can press it. The others are told who to ask rather than finding
 * a button that fails — and rather than not knowing their return is waiting.
 */
export default function ConfirmFigures({ rows, mayConfirm }) {
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(() => new Set());

  const waiting = rows.filter(
    (row) => row.awaitingYourConfirmation && !confirmed.has(row.id),
  );
  if (!waiting.length) return null;

  return (
    <section className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-3 border p-4">
      <div>
        <h2 className="font-display text-15 font-semibold">
          {waiting.length === 1
            ? "One return is waiting for you"
            : `${waiting.length} returns are waiting for you`}
        </h2>
        <p className="text-14 max-w-[65ch]">
          We have prepared and checked these, and we need you to agree the
          figures before we file. Nothing goes to the department until you do.
        </p>
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

      <ul className="flex flex-col gap-2">
        {waiting.map((row) => (
          <li
            key={row.id}
            className="rounded-ledger border-rule bg-paper flex flex-wrap items-center justify-between gap-3 border p-3"
          >
            <div>
              <p className="text-14 font-medium">
                {row.service} · {row.period}
              </p>
              <p className="text-12 text-ink-muted">
                Version {row.version} of the figures
                {row.due ? ` · due ${row.dueLabel}` : ""}
              </p>
            </div>
            {mayConfirm ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await confirmFigures(row.id);
                    setMessage(result);
                    if (result?.ok) {
                      setConfirmed((old) => new Set(old).add(row.id));
                    }
                  })
                }
                className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
              >
                I confirm these figures
              </button>
            ) : (
              <p className="text-13 text-ink-muted max-w-[36ch]">
                Your login cannot confirm figures. Ask whoever at your office
                signs these off, or ask us to let you do it.
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="text-12 text-ink-muted max-w-[65ch]">
        If something looks wrong, tell us before confirming — once a return is
        filed, correcting it means a revised return.
      </p>
    </section>
  );
}
