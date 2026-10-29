"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { applyWords, wordChanges, RENAMEABLE } from "@/lib/firm/words";
import { saveWords } from "./actions";

/**
 * The firm's own words, with the menu they produce beside them (P3-29).
 *
 * **The preview is the point.** A settings screen that takes eight words
 * and says nothing is a screen nobody trusts: the only honest way to show
 * what renaming "client" does is to render the real menu labels through
 * the real substitution, live, as the boxes are typed in. The same
 * function runs here and on the server, so what is shown is what will be
 * saved.
 */
export default function Words({ current, sample }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveWords, null);
  const [draft, setDraft] = useState(current);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const changes = wordChanges(draft);
  const changed = Object.keys(changes).length > 0;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {RENAMEABLE.map((row) => (
          <fieldset
            key={row.key}
            className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-3"
          >
            <legend className="text-13 text-ink-muted px-1 font-medium">
              Instead of &ldquo;{row.one}&rdquo;
            </legend>
            <p className="text-12 text-faint">{row.what}</p>
            <div className="flex gap-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-12 text-ink-muted">One of them</span>
                <input
                  name={row.key}
                  value={draft[row.key] ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, [row.key]: event.target.value })
                  }
                  maxLength={40}
                  placeholder={row.one}
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-12 text-ink-muted">More than one</span>
                <input
                  name={row.plural}
                  value={draft[row.plural] ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, [row.plural]: event.target.value })
                  }
                  maxLength={40}
                  placeholder={row.many}
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>

      {/*
        The real menu labels, through the real substitution. Not a mock-up:
        `sample` is handed down from the menu this person is actually
        looking at, so a label that will not change visibly says so by not
        changing here either.
      */}
      <div className="rounded-ledger border-rule bg-sunk border p-3">
        <h3 className="text-13 text-ink-muted mb-2 font-medium">
          What the menu will say
        </h3>
        <ul className="text-14 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {sample.map((label) => {
            const next = applyWords(label, changes);
            return (
              <li key={label} className="flex items-baseline gap-2">
                <span className={next === label ? "text-ink-muted" : ""}>
                  {next}
                </span>
                {next !== label && (
                  <span className="text-12 text-faint line-through">
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {!changed && (
          <p className="text-12 text-faint mt-2">
            Nothing is renamed, so the menu says what it always said.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-4 font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save these words"}
        </button>
        {changed && (
          <button
            type="button"
            onClick={() =>
              setDraft(
                Object.fromEntries(Object.keys(draft).map((key) => [key, ""])),
              )
            }
            className="rounded-control border-rule text-14 text-ink-muted h-9 border px-3"
          >
            Back to the usual words
          </button>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="text-13 text-redpen">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-13 text-filed">
          {state.ok}
        </p>
      )}
    </form>
  );
}
