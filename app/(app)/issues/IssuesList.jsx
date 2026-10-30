"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SEVERITY_LABELS } from "@/lib/issues/shape";
import Chip from "@/components/ui/Chip";
import FilterChip from "@/components/ui/FilterChip";
import SearchBox, { matches } from "@/components/ui/SearchBox";
import { ScrollArea } from "@/components/ui/Screen";
import {
  approveWork,
  acceptChecklistItem,
  decideFeeWaiver,
} from "../engagements/actions";

/**
 * The Issues list (P3-6, laid out again in D104).
 *
 * Rows a reader can act on from here carry the real action; everything
 * else carries a link to the exact place that fixes it. The prototype
 * does the same, and for the same reason: a row whose fix needs a reason
 * typed into it stops being a row and becomes a form, and then this page
 * is a second place where the rules live.
 *
 * **It is columns now, and still a list.** Thirty-one rows of free-form
 * text with a severity pill floating in them gave the eye nothing to run
 * down; four columns on one grid — how bad, what, whose client, whose
 * desk — can be read as a column each. It stays a `ul` rather than
 * becoming a `table` because these are not rows of one dataset, they are
 * thirty-one different kinds of problem that happen to line up, and a
 * screen reader is better served by "list, 31 items" than by a table
 * whose cells mean something different in every row.
 *
 * The grid template is written once, in `COLUMNS`, and used by the header
 * and by every row, so a column cannot drift between them.
 */

/** 3 is "today or it bites", 1 is "this week". */
const TONE = { 3: "late", 2: "soon", 1: "neutral" };

/**
 * **Every width here is fixed but one.** The header and each row are
 * separate grids — a `ul` cannot be one grid without giving up being a
 * list — so they line up only because they are told the same numbers. An
 * `auto` trailing column looked right until a row carried two buttons
 * instead of one: that row's last column grew, and its client and owner
 * slid left out of their columns while the rows above stayed put.
 */
const COLUMNS =
  "md:grid md:grid-cols-[6.5rem_minmax(0,1fr)_10rem_8rem_11rem] md:items-baseline md:gap-x-4";

export default function IssuesList({ rows, who, kind, total, counts, kinds }) {
  const router = useRouter();
  const search = useSearchParams();
  const [message, setMessage] = useState(null);
  const [query, setQuery] = useState("");
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

  const live = rows.filter((row) => !done.has(row.key));
  const visible = live.filter((row) =>
    matches([row.text, row.kind, row.clientName, row.ownerName], query),
  );

  return (
    <>
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
            label="Search these issues"
          />
          <span className="num text-12 text-ink-muted shrink-0">
            {visible.length === live.length
              ? `${live.length} shown`
              : `${visible.length} of ${live.length}`}
          </span>
        </div>
      </div>

      <ScrollArea className="rounded-ledger border-rule bg-surface border">
        <div
          aria-hidden="true"
          className={`border-rule bg-surface text-12 text-faint sticky top-0 z-10 hidden border-b px-4 py-2 ${COLUMNS}`}
        >
          <span>Priority</span>
          <span>Issue</span>
          <span>Client</span>
          <span>Owner</span>
          <span />
        </div>

        {visible.length === 0 ? (
          <p className="text-14 text-ink-muted px-4 py-10 text-center">
            {live.length === 0
              ? total === 0
                ? who === "mine"
                  ? "Nothing needs you right now."
                  : "Nothing needs anybody right now."
                : "Nothing in this group."
              : `Nothing here matches “${query.trim()}”.`}
          </p>
        ) : (
          <ul className="flex flex-col">
            {visible.map((row) => (
              <li
                key={row.key}
                className={`border-rule hover:bg-carbon-wash border-b px-4 py-2.5 last:border-0 ${COLUMNS}`}
              >
                <span className="flex md:block">
                  <Chip tone={TONE[row.severity]}>
                    {SEVERITY_LABELS[row.severity]}
                  </Chip>
                </span>

                <span className="mt-1 block min-w-0 md:mt-0">
                  <span className="text-14 block">{row.text}</span>
                  <span className="text-12 text-ink-muted block">
                    {row.kind}
                  </span>
                </span>

                <span className="text-13 mt-0.5 block min-w-0 truncate md:mt-0">
                  {row.clientName ? (
                    <Link
                      href={`/clients/${row.clientId}`}
                      className="hover:text-carbon"
                    >
                      {row.clientName}
                    </Link>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </span>

                <span className="text-13 text-ink-muted block truncate">
                  {row.ownerName}
                </span>

                <span className="mt-2 flex items-center justify-start gap-2 md:mt-0 md:justify-end">
                  {row.actions.map((action) => (
                    <button
                      key={action.act}
                      type="button"
                      disabled={pending}
                      onClick={() => run(row, action)}
                      className="rounded-control border-rule bg-paper text-13 h-7 shrink-0 border px-2.5 font-medium whitespace-nowrap disabled:opacity-60"
                    >
                      {action.label}
                    </button>
                  ))}
                  <Link
                    href={row.href}
                    className="rounded-control bg-carbon text-13 text-on-carbon h-7 shrink-0 px-2.5 leading-7 font-medium"
                  >
                    Open
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </>
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
