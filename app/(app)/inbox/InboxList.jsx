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
 *
 * ## What changed on 10-11-2026
 *
 * **One filter row, not two.** Unread and Snoozed were stat tiles above
 * this list, over chips that already did the same job. They are chips now:
 * `All · Unread · <the groups> · Snoozed`, left to right, one control per
 * cut and one count per control.
 *
 * **The row reads in two lines, not three.** Its group and its time were a
 * third line under the body while 900px of the canvas sat empty to the
 * right; they are a right-aligned column now, so the eye scans times down
 * one edge instead of hunting for them at the end of a sentence.
 *
 * **The controls stopped hiding.** Drawing them on hover kept the list
 * quiet and made it look inert — and a list of things to act on that shows
 * nothing to press is a list people stop pressing. They are text actions
 * in one fixed trailing column, at the same pitch on every row, legible
 * before they are pointed at.
 */
export default function InboxList({
  rows,
  kinds,
  kind,
  show,
  counts,
  asleep,
  unread: unreadTotal = 0,
}) {
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
          <FilterChip
            on={!kind && show === "open"}
            onClick={() => go({ kind: "", show: "" })}
            count={total}
          >
            All
          </FilterChip>
          {/* the two cuts that were tiles: they sit with the groups now */}
          <FilterChip
            on={show === "unread"}
            onClick={() => go({ show: show === "unread" ? "" : "unread" })}
            count={unreadTotal}
          >
            Unread
          </FilterChip>
          {kinds
            .filter((name) => counts[name])
            .map((name) => (
              <FilterChip
                key={name}
                on={kind === name}
                onClick={() => go({ kind: kind === name ? "" : name })}
                count={counts[name]}
              >
                {name}
              </FilterChip>
            ))}
          <FilterChip
            on={show === "snoozed"}
            onClick={() => go({ show: show === "snoozed" ? "" : "snoozed" })}
            count={asleep}
          >
            Snoozed
          </FilterChip>
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
              className="group border-rule hover:bg-carbon-wash/60 focus-within:bg-carbon-wash/60 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-2.5 transition-colors duration-100 last:border-0"
            >
              <span
                aria-hidden="true"
                className={`relative top-[-1px] size-2 shrink-0 rounded-full ${
                  row.read ? "bg-transparent" : "bg-carbon"
                }`}
              />

              <div className="min-w-0 flex-1 basis-[16rem]">
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
                  <p className="text-13 text-ink-muted line-clamp-2">
                    {row.body}
                  </p>
                )}
              </div>

              {/*
                The group and the time, down one right edge. They were a
                third line under the body, which is where a date is hardest
                to find: the eye has to read to the end of a sentence that
                is a different length on every row. On a phone there is no
                width to spare, so they fall back under the title.
              */}
              <div className="text-12 text-faint order-last w-full shrink-0 sm:order-none sm:w-44 sm:text-right">
                {/* the time first and on its own line: it is what the eye
                    runs down this edge looking for, and "10-11-2026, 9:00
                    am" after a group name as long as "Announcements" broke
                    across two lines and left the "am" on its own */}
                <span className="num block whitespace-nowrap">{row.at}</span>
                <span className="block">{row.kind}</span>
                {row.asleep && (
                  <span className="num block">back {row.snoozedLabel}</span>
                )}
              </div>

              {/*
                One fixed trailing column: Snooze starts on the same line
                on every row, whether or not the row also offers Mark read,
                so the column reads as a column and not as text that moves.
              */}
              <span className="flex w-[8.5rem] shrink-0 items-center gap-3">
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
                    triggerClassName="text-12 text-ink hover:underline underline-offset-2 whitespace-nowrap"
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

/**
 * One of a row's own controls: the same shape for every one of them.
 *
 * A text action in the full ink, not an outlined button and not grey.
 * Three hundred rows carrying six hundred bordered buttons was the reason
 * these were hidden on hover in the first place; the answer was never to
 * hide them but to stop drawing a button for something that is one word.
 */
function Control({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-12 text-ink whitespace-nowrap underline-offset-2 hover:underline disabled:opacity-60"
    >
      {children}
    </button>
  );
}
