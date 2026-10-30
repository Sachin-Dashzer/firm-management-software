"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import FilterChip from "@/components/ui/FilterChip";
import SearchBox, { matches } from "@/components/ui/SearchBox";
import { ScrollArea } from "@/components/ui/Screen";
import { markAllRead, markRead, snoozeNotification, wake } from "./actions";
import { SNOOZE_CHOICES } from "@/lib/inbox";

/**
 * The inbox list (P3-17a, laid out again in D104).
 *
 * Unread is marked in the margin rather than shouted. What is new in
 * D104 is where the row's controls live: snooze and mark-read were
 * underlined words mixed into the meta line, so the line read
 * "Mentions · 25-10-2026 09:12 snooze mark read" and the two words that
 * did something looked exactly like the two that did not. They are now a
 * trailing column of controls at a fixed pitch, which is what the
 * app-screen study finds on every list whose rows need doing.
 *
 * Everything else is unchanged: nothing can be deleted, and the whole
 * list is in the browser already, so the search filters it without a
 * request.
 */
export default function InboxList({ rows, kinds, kind, show, counts, asleep }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [message, setMessage] = useState(null);
  const [open, setOpen] = useState(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const unread = rows.filter((row) => !row.read).length;
  const visible = rows.filter((row) =>
    matches([row.title, row.body, row.kind], query),
  );

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

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-x-visible">
          <FilterChip on={!kind} onClick={() => go({ kind: "" })} count={total}>
            All
          </FilterChip>
          {kinds
            .filter((name) => counts[name])
            .map((name) => (
              <FilterChip
                key={name}
                on={kind === name}
                onClick={() => go({ kind: name })}
                count={counts[name]}
              >
                {name}
              </FilterChip>
            ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search these messages"
          />
          {unread > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(markAllRead)}
              className="rounded-control border-rule bg-paper text-13 hover:border-carbon h-8 shrink-0 border px-3 whitespace-nowrap disabled:opacity-60"
            >
              Mark everything read
            </button>
          )}
          <span className="num text-12 text-ink-muted shrink-0">
            {visible.length === rows.length
              ? `${rows.length} shown`
              : `${visible.length} of ${rows.length}`}
          </span>
        </div>
      </div>

      {message?.ok && typeof message.ok === "string" && (
        <p role="status" className="text-13 text-filed">
          {message.ok}
        </p>
      )}

      <ScrollArea className="rounded-ledger border-rule bg-surface border">
        <ul className="flex flex-col">
          {visible.map((row) => (
            <li
              key={row.id}
              className="border-rule hover:bg-carbon-wash flex flex-wrap items-start gap-x-3 gap-y-2 border-b px-4 py-2.5 last:border-0"
            >
              <span
                aria-hidden="true"
                className={`mt-2 size-2 shrink-0 rounded-full ${
                  row.read ? "bg-transparent" : "bg-carbon"
                }`}
              />

              <div className="min-w-0 flex-1">
                {row.href ? (
                  <Link
                    href={row.href}
                    onClick={() => markRead(row.id)}
                    className="text-14 hover:text-carbon font-medium"
                  >
                    {row.title}
                  </Link>
                ) : (
                  <p className="text-14 font-medium">{row.title}</p>
                )}
                {row.body && (
                  <p className="text-13 text-ink-muted">{row.body}</p>
                )}
                <p className="text-12 text-faint num">
                  {row.kind} · {row.at}
                  {row.asleep && ` · snoozed until ${row.snoozedLabel}`}
                </p>
              </div>

              <span className="flex shrink-0 items-center gap-1.5">
                {row.asleep ? (
                  <Control onClick={() => run(() => wake(row.id))}>
                    Bring it back
                  </Control>
                ) : open === row.id ? (
                  SNOOZE_CHOICES.map((choice) => (
                    <Control
                      key={choice.key}
                      onClick={() =>
                        run(() => snoozeNotification(row.id, choice.key))
                      }
                    >
                      {choice.label}
                    </Control>
                  ))
                ) : (
                  <Control onClick={() => setOpen(row.id)}>snooze</Control>
                )}
                {!row.read && (
                  <Control onClick={() => run(() => markRead(row.id))}>
                    mark read
                  </Control>
                )}
              </span>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="text-14 text-ink-muted px-4 py-10 text-center">
              {rows.length > 0
                ? `Nothing here matches “${query.trim()}”.`
                : show === "snoozed"
                  ? `Nothing is snoozed${asleep ? "" : " right now"}.`
                  : kind
                    ? `Nothing under ${kind.toLowerCase()}.`
                    : "Nothing yet."}
            </li>
          )}
        </ul>
      </ScrollArea>
    </>
  );
}

/** One of a row's own controls: the same shape for every one of them. */
function Control({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-control border-rule bg-paper text-12 text-ink-muted hover:text-ink hover:border-carbon h-7 border px-2 whitespace-nowrap"
    >
      {children}
    </button>
  );
}
