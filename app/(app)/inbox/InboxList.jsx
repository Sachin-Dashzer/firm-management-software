"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import FilterChip from "@/components/ui/FilterChip";
import SearchBox, { matches } from "@/components/ui/SearchBox";
import { ScrollArea } from "@/components/ui/Screen";
import CellPopover from "@/components/ui/CellPopover";
import { markAllRead, markRead, snoozeNotification, wake } from "./actions";
import { SNOOZE_CHOICES } from "@/lib/inbox";

/**
 * The inbox list (P3-17a, laid out again in D104, and again 04-11-2026).
 *
 * Unread is marked in the margin rather than shouted, and the whole list
 * is in the browser already, so the search filters it without a request.
 * Nothing can be deleted: the nudge is about something real, and a list
 * people clear is a list people clear without reading.
 *
 * ## What changed on 04-11-2026
 *
 * **The row's controls wait to be asked.** D104 moved snooze and mark-read
 * out of the meta line into a trailing column, which was right, and then
 * drew them on all three hundred rows at once: six hundred bordered
 * buttons down a list whose content is the thing being read. They now
 * appear on the row under the pointer, or under the keyboard — and on a
 * touch screen, where there is no pointer to hover, they stay drawn.
 * Nothing became unreachable: `group-focus-within` means tabbing into a
 * row reveals its own controls, so the keyboard path is the same as it
 * was.
 *
 * **Snooze stopped moving the row.** Picking a time replaced the row's two
 * controls with four more, so the list reflowed under the cursor and the
 * row you were aiming at moved. The choices open over the button instead,
 * in `CellPopover` — which closes on Escape, returns focus to the button
 * and does not trap it.
 *
 * **The controls say the same kind of thing.** "Bring it back", "snooze",
 * "mark read" were three different capitalisations in one gutter.
 */
export default function InboxList({ rows, kinds, kind, show, counts, asleep }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [message, setMessage] = useState(null);
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
              className="rounded-control border-rule bg-paper text-13 hover:border-carbon h-8 shrink-0 border px-3 whitespace-nowrap transition-colors duration-150 disabled:opacity-60"
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
              className="group border-rule hover:bg-carbon-wash/60 focus-within:bg-carbon-wash/60 flex flex-wrap items-start gap-x-3 gap-y-2 border-b px-4 py-2.5 transition-colors duration-100 last:border-0"
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
                    className={`text-14 hover:text-carbon ${
                      row.read ? "font-medium" : "font-semibold"
                    }`}
                  >
                    {row.title}
                  </Link>
                ) : (
                  <p
                    className={`text-14 ${
                      row.read ? "font-medium" : "font-semibold"
                    }`}
                  >
                    {row.title}
                  </p>
                )}
                {row.body && (
                  <p className="text-13 text-ink-muted">{row.body}</p>
                )}
                <p className="text-12 text-faint num">
                  {row.kind} · {row.at}
                  {row.asleep && ` · snoozed until ${row.snoozedLabel}`}
                </p>
              </div>

              {/*
                Drawn on the row being pointed at or tabbed into. Always
                drawn where there is no pointer: `hover:` never matches on
                a touch screen, so a finger would find nothing.
              */}
              <span className="flex shrink-0 items-center gap-1.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                {row.asleep ? (
                  <Control
                    disabled={pending}
                    onClick={() => run(() => wake(row.id))}
                  >
                    Bring it back
                  </Control>
                ) : (
                  <CellPopover
                    title="Bring it back"
                    triggerLabel={`Snooze: ${row.title}`}
                    triggerClassName="rounded-control border-rule bg-paper text-12 text-ink-muted hover:text-ink hover:border-carbon h-7 border px-2 whitespace-nowrap transition-colors duration-150"
                    trigger="Snooze"
                  >
                    {(close) => (
                      <div className="flex flex-col items-start gap-1">
                        {SNOOZE_CHOICES.map((choice) => (
                          <button
                            key={choice.key}
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              close(false);
                              run(() => snoozeNotification(row.id, choice.key));
                            }}
                            className="rounded-control hover:bg-carbon-wash text-13 w-full px-2 py-1 text-left disabled:opacity-60"
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </CellPopover>
                )}
                {!row.read && (
                  <Control
                    disabled={pending}
                    onClick={() => run(() => markRead(row.id))}
                  >
                    Mark read
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
function Control({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-control border-rule bg-paper text-12 text-ink-muted hover:text-ink hover:border-carbon h-7 border px-2 whitespace-nowrap transition-colors duration-150 disabled:opacity-60"
    >
      {children}
    </button>
  );
}
