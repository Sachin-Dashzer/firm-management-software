"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { decideHeldChange } from "../round-trip/actions";

/**
 * The partner's queue (P3-18a).
 *
 * Declining asks for a reason, and the reason is the useful half: whoever
 * sent the sheet gets the row back otherwise, with the same cell still
 * wrong in their copy.
 */
export default function HeldChanges({ rows, show, mayDecide }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [message, setMessage] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [pending, startTransition] = useTransition();

  function go(next) {
    const params = new URLSearchParams(search);
    if (next) params.set("show", next);
    else params.delete("show");
    router.replace(`${pathname}?${params}`);
  }

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result?.ok) {
        setDeclining(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Chip on={show === "pending"} onClick={() => go("")}>
          Waiting
        </Chip>
        <Chip on={show === "decided"} onClick={() => go("decided")}>
          Decided
        </Chip>
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

      {rows.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-6 text-center">
          {show === "pending"
            ? "Nothing is waiting."
            : "Nothing has been decided yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-ledger border-rule bg-surface flex flex-col gap-1 border px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-14 font-medium">
                  <Link
                    href={`/clients/${row.clientId}`}
                    className="underline underline-offset-4"
                  >
                    {row.client}
                  </Link>{" "}
                  · {row.label}
                </h2>
                <span className="text-12 text-ink-muted">
                  {row.source}, {row.askedByName} · {row.at}
                </span>
              </div>

              <p className="text-14">
                <span className="text-ink-muted">{row.from}</span> →{" "}
                <strong>{row.to}</strong>
              </p>

              {row.state !== "pending" && (
                <p className="text-12 text-ink-muted">
                  {row.state === "applied" ? "Approved" : "Declined"} by{" "}
                  {row.decidedByName} on {row.decidedAt}
                  {row.reason ? ` — ${row.reason}` : ""}
                </p>
              )}

              {row.state === "pending" &&
                (mayDecide ? (
                  declining === row.id ? (
                    <form
                      action={(formData) =>
                        run(() => decideHeldChange(row.id, "decline", formData))
                      }
                      className="flex flex-wrap items-end gap-2"
                    >
                      <label className="flex flex-1 flex-col gap-1">
                        <span className="text-13 font-medium">
                          Why are you leaving it as it is?
                        </span>
                        <input
                          name="reason"
                          required
                          minLength={3}
                          className="rounded-control border-rule bg-paper text-13 h-8 border px-2"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-control border-rule bg-surface text-13 h-8 border px-3 disabled:opacity-60"
                      >
                        Decline it
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeclining(null)}
                        className="rounded-control border-rule bg-surface text-13 h-8 border px-3"
                      >
                        Leave it open
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          run(() =>
                            decideHeldChange(row.id, "apply", new FormData()),
                          )
                        }
                        disabled={pending}
                        className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                      >
                        Make the change
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeclining(row.id)}
                        disabled={pending}
                        className="rounded-control border-rule bg-surface text-13 h-8 border px-3 disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  )
                ) : (
                  <p className="text-12 text-ink-muted">
                    A partner decides this one.
                  </p>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-chip text-13 border px-3 py-0.5 ${
        on
          ? "border-carbon bg-carbon text-on-carbon"
          : "border-rule bg-surface text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}
