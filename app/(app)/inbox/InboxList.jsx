"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { markAllRead, markRead, snoozeNotification, wake } from "./actions";
import { SNOOZE_CHOICES } from "@/lib/inbox";

/**
 * The inbox list (P3-17a).
 *
 * Unread is marked in the margin rather than shouted, as it was before.
 * What is new is that every row can be put off: the snooze buttons are on
 * the row rather than behind a menu, because the decision is made while
 * reading it and a menu is one click too many for a thing people do twenty
 * times a morning.
 */
export default function InboxList({
  rows,
  kinds,
  kind,
  show,
  counts,
  asleep,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [message, setMessage] = useState(null);
  const [open, setOpen] = useState(null);
  const [pending, startTransition] = useTransition();

  const unread = rows.filter((row) => !row.read).length;

  function go(next) {
    const params = new URLSearchParams(search);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params}`);
  }

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      setOpen(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip on={!kind} onClick={() => go({ kind: "" })}>
          Everything
        </Chip>
        {kinds.map((name) => (
          <Chip
            key={name}
            on={kind === name}
            onClick={() => go({ kind: name })}
          >
            {name}
            {counts[name] ? ` · ${counts[name]}` : ""}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-13 text-ink-muted">
          {unread > 0 ? `${unread} unread` : "All read"}
          {asleep > 0 && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() =>
                  go({ show: show === "snoozed" ? "" : "snoozed" })
                }
                className="underline underline-offset-4"
              >
                {show === "snoozed"
                  ? "back to the list"
                  : `${asleep} snoozed`}
              </button>
            </>
          )}
        </p>
        {unread > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(markAllRead)}
            className="text-13 underline underline-offset-4 disabled:opacity-60"
          >
            Mark everything read
          </button>
        )}
      </div>

      {message?.ok && typeof message.ok === "string" && (
        <p role="status" className="text-13 text-filed">
          {message.ok}
        </p>
      )}

      <ul className="rounded-ledger border-rule bg-surface flex flex-col border">
        {rows.map((row) => (
          <li
            key={row.id}
            className="border-rule flex gap-3 border-b px-4 py-3 last:border-0"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                row.read ? "bg-transparent" : "bg-carbon"
              }`}
            />
            <div className="min-w-0 flex-1">
              {row.href ? (
                <Link
                  href={row.href}
                  onClick={() => markRead(row.id)}
                  className="text-14 font-medium underline underline-offset-4"
                >
                  {row.title}
                </Link>
              ) : (
                <p className="text-14 font-medium">{row.title}</p>
              )}
              {row.body && <p className="text-13 text-ink-muted">{row.body}</p>}
              <p className="text-12 text-ink-muted num flex flex-wrap gap-x-2">
                <span>
                  {row.kind} · {row.at}
                </span>
                {row.asleep ? (
                  <>
                    <span>snoozed until {row.snoozedLabel}</span>
                    <button
                      type="button"
                      onClick={() => run(() => wake(row.id))}
                      className="underline underline-offset-4"
                    >
                      bring it back
                    </button>
                  </>
                ) : open === row.id ? (
                  SNOOZE_CHOICES.map((choice) => (
                    <button
                      key={choice.key}
                      type="button"
                      onClick={() =>
                        run(() => snoozeNotification(row.id, choice.key))
                      }
                      className="underline underline-offset-4"
                    >
                      {choice.label}
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpen(row.id)}
                    className="underline underline-offset-4"
                  >
                    snooze
                  </button>
                )}
                {!row.read && (
                  <button
                    type="button"
                    onClick={() => run(() => markRead(row.id))}
                    className="underline underline-offset-4"
                  >
                    mark read
                  </button>
                )}
              </p>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-14 text-ink-muted px-4 py-8 text-center">
            {kind ? `Nothing under ${kind.toLowerCase()}.` : "Nothing yet."}
          </li>
        )}
      </ul>
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
