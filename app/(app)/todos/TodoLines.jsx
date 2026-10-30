"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { tickTodo, setTodoDate, setTodoOwner, removeTodo } from "./actions";

/**
 * The lines themselves, with the tick (P3-22c).
 *
 * Its own component because two screens show them: the list at `/todos`
 * and the panel on My tasks. Ticking a to-do from the screen you are
 * already on is the whole reason the panel is there, and a read-only copy
 * of the list would have been a second thing to keep in step.
 *
 * The tick is a **checkbox, not a button**: it is a state, a keyboard
 * reaches it with Space, and a screen reader says "checked".
 */
export default function TodoLines({ rows, people = [], showOwner = false }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(null);

  function run(id, action) {
    setBusy(id);
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      setBusy(null);
      if (result?.ok) router.refresh();
    });
  }

  /**
   * Nothing to show and nothing to say. The order matters: ticking off the
   * last to-do in a bucket empties the list, and returning early here would
   * take the confirmation with it — so the message outlives the rows.
   */
  if (rows.length === 0 && !message) return null;

  return (
    <>
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}

      <ul className="rounded-ledger border-rule bg-surface flex flex-col border empty:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="border-rule hover:bg-carbon-wash flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-3 py-2 last:border-0"
          >
            <label className="flex items-baseline gap-2">
              <input
                type="checkbox"
                checked={row.done}
                disabled={!row.mayChange || (pending && busy === row.id)}
                /*
                  The new state is worked out from the row, **not read off
                  the checkbox**. The action runs inside a transition, by
                  which time React has already reset a controlled box to the
                  value in `row.done` — so reading `event.target.checked`
                  there sent the opposite of what was clicked, and a
                  to-do ticked off came back saved as unfinished. Asking for
                  a state rather than a toggle also makes a second event
                  harmless: it asks for the same thing twice.
                */
                onChange={() => run(row.id, () => tickTodo(row.id, !row.done))}
                className="accent-carbon size-4 translate-y-0.5"
                aria-label={
                  row.done ? `Put back: ${row.title}` : `Done: ${row.title}`
                }
              />
              <span
                className={`text-14 ${
                  row.done ? "text-ink-muted line-through" : ""
                }`}
              >
                {row.title}
              </span>
            </label>

            {row.client && (
              <Link
                href={`/clients/${row.clientId}`}
                className="text-13 text-ink-muted underline underline-offset-4"
              >
                {row.client}
              </Link>
            )}

            {row.note && (
              <span className="text-13 text-ink-muted">{row.note}</span>
            )}

            <span className="ml-auto flex flex-wrap items-baseline gap-2">
              {row.done ? (
                <span className="text-12 text-ink-muted num">
                  {row.doneByName ? `${row.doneByName}, ` : ""}
                  {row.doneAt}
                </span>
              ) : (
                <>
                  {showOwner &&
                    (row.mayChange && people.length > 0 ? (
                      <label className="text-12 text-ink-muted flex items-baseline gap-1">
                        <select
                          aria-label={`Whose: ${row.title}`}
                          value={row.ownerId}
                          disabled={pending && busy === row.id}
                          onChange={(event) =>
                            run(row.id, () =>
                              setTodoOwner(row.id, event.target.value),
                            )
                          }
                          className="rounded-control border-rule bg-paper text-12 h-7 border px-1"
                        >
                          {people.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="text-12 text-ink-muted">
                        {row.ownerName}
                      </span>
                    ))}

                  {row.mayChange ? (
                    <label className="flex items-baseline gap-1">
                      {/*
                        The name goes in `aria-label`, not in an `sr-only`
                        span: a second copy of the title in the row's text
                        makes "the to-do called X" ambiguous to anything
                        reading the page, tests included.
                      */}
                      <input
                        type="date"
                        aria-label={`When: ${row.title}`}
                        defaultValue={row.dueInput}
                        disabled={pending && busy === row.id}
                        onChange={(event) =>
                          run(row.id, () =>
                            setTodoDate(row.id, event.target.value),
                          )
                        }
                        className={`rounded-control border-rule bg-paper num text-12 h-7 border px-1 ${
                          row.late ? "text-redpen" : ""
                        }`}
                      />
                    </label>
                  ) : (
                    <span
                      className={`num text-12 ${
                        row.late ? "text-redpen" : "text-ink-muted"
                      }`}
                    >
                      {row.due || "no date"}
                    </span>
                  )}

                  {row.mayChange && (
                    <button
                      type="button"
                      disabled={pending && busy === row.id}
                      onClick={() => run(row.id, () => removeTodo(row.id))}
                      className="text-12 text-ink-muted hover:text-redpen underline underline-offset-4"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
