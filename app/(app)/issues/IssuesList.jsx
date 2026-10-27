"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SEVERITY_LABELS } from "@/lib/issues/shape";
import {
  approveWork,
  acceptChecklistItem,
  decideFeeWaiver,
} from "../engagements/actions";

/**
 * The Issues list (P3-6).
 *
 * Rows a reader can act on from here carry the real action; everything else
 * carries a link to the exact place that fixes it. The prototype does the
 * same, and for the same reason: a row whose fix needs a reason typed into
 * it stops being a row and becomes a form, and then this page is a second
 * place where the rules live.
 */

const TONE = {
  3: "border-redpen bg-redpen-wash text-redpen",
  2: "border-waiting bg-waiting-wash text-waiting",
  1: "border-rule text-ink-muted",
};

export default function IssuesList({ rows, who, kind, total, counts, kinds }) {
  const router = useRouter();
  const search = useSearchParams();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  /** Rows the reader has just fixed, hidden until the server catches up. */
  const [done, setDone] = useState(() => new Set());

  function go(next) {
    const params = new URLSearchParams(search);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`/issues?${params}`);
  }

  function run(row, action) {
    startTransition(async () => {
      const result = await perform(action);
      setMessage(result);
      if (result?.ok) {
        // gone from the screen at once; gone from the records already
        setDone((old) => new Set(old).add(row.key));
        router.refresh();
      }
    });
  }

  const visible = rows.filter((row) => !done.has(row.key));

  return (
    <div className="flex flex-col gap-4">
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

      <div
        role="group"
        aria-label="Whose issues"
        className="rounded-ledger border-rule flex w-fit border p-0.5"
      >
        {[
          ["mine", "Mine"],
          ["all", "Everyone"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={who === key}
            onClick={() => go({ who: key })}
            className={`rounded-ledger text-13 px-3 py-1 ${
              who === key
                ? "bg-carbon text-on-carbon font-medium"
                : "text-ink-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip on={!kind} onClick={() => go({ kind: "" })}>
          Everything · {total}
        </Chip>
        {kinds
          .filter((k) => counts[k])
          .map((k) => (
            <Chip key={k} on={kind === k} onClick={() => go({ kind: k })}>
              {k} · {counts[k]}
            </Chip>
          ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 border px-3 py-6 text-center">
          {total === 0
            ? who === "mine"
              ? "Nothing needs you right now."
              : "Nothing needs anybody right now."
            : "Nothing in this group."}
        </p>
      ) : (
        <ul className="rounded-ledger border-rule bg-surface flex flex-col border">
          {visible.map((row) => (
            <li
              key={row.key}
              className="border-rule flex flex-wrap items-start justify-between gap-3 border-b p-3 last:border-0"
            >
              <div className="flex min-w-[20rem] flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-chip text-12 border px-2 py-0.5 ${TONE[row.severity]}`}
                  >
                    {SEVERITY_LABELS[row.severity]}
                  </span>
                  <span className="text-12 text-ink-muted">{row.kind}</span>
                </div>
                <p className="text-14">{row.text}</p>
                <p className="text-12 text-ink-muted">
                  {row.clientName && (
                    <>
                      <Link
                        href={`/clients/${row.clientId}`}
                        className="underline underline-offset-4"
                      >
                        {row.clientName}
                      </Link>{" "}
                      ·{" "}
                    </>
                  )}
                  {row.ownerName}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {row.actions.map((action) => (
                  <button
                    key={action.act}
                    type="button"
                    disabled={pending}
                    onClick={() => run(row, action)}
                    className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                  >
                    {action.label}
                  </button>
                ))}
                <Link
                  href={row.href}
                  className="text-13 underline underline-offset-4"
                >
                  Open
                </Link>
              </div>
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
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-control text-13 border px-2 py-1 ${
        on
          ? "border-carbon bg-carbon-wash text-carbon font-medium"
          : "border-rule text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The three actions a row can perform from here: each is one click on one
 * record, with no reason to type. Anything that needs words — declining a
 * waiver, asking for a replacement — is a link to the screen that owns it.
 */
function perform(action) {
  switch (action.act) {
    case "approve-work":
      return approveWork(action.id);
    case "accept-upload":
      return acceptChecklistItem(action.id, action.itemId);
    case "approve-waiver":
      return decideFeeWaiver(action.id, true);
    default:
      return Promise.resolve({ error: "That action is not available here." });
  }
}
