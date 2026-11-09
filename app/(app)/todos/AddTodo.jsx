"use client";

import { useFormAction } from "@/lib/forms/useFormAction";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addTodo } from "./actions";

/**
 * One line at the top of the list (P3-22c, tightened in D104).
 *
 * A title and nothing else is a valid to-do, so the date, the person and
 * the client sit beside it rather than behind a dialog — anything that
 * takes two screens to write down gets written on paper instead.
 *
 * **It is one row now, not two.** The screen is the height of the window
 * and the list is the part worth the height; a composer with six stacked
 * labels was 140px of chrome above six rows of work. The labels are still
 * there for anything reading the page — they are `sr-only`, and each
 * control says what it is in its own placeholder or in its first option,
 * which is how a composer differs from a form: you are writing a line,
 * not filling in a record.
 *
 * The form clears itself and keeps the focus in the title box, because
 * the way anybody uses this is three in a row.
 *
 * **It has no client picker** (owner, 03-11-2026): four controls, and the
 * client goes in the words like it always did.
 */
/** The length the record itself allows; `lib/todos/list.js` refuses more. */
const TITLE_LIMIT = 200;

export default function AddTodo({ people, me }) {
  const router = useRouter();
  const [state, submit, pending] = useFormAction(addTodo, null);
  const form = useRef(null);
  const title = useRef(null);
  /**
   * The title is the one controlled field, so the limit can be said out
   * loud (QA 09-11-2026, #27). A `maxLength` alone stops the typing and
   * explains nothing — paste a paragraph and the end of it simply was not
   * there, with no sign that anything had been dropped.
   */
  const [typed, setTyped] = useState("");
  const left = TITLE_LIMIT - typed.length;

  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      setTyped("");
      title.current?.focus();
      router.refresh();
    }
  }, [state, router]);

  const field =
    "rounded-control border-rule bg-paper text-13 h-8 border px-2 min-w-0";

  return (
    <form
      ref={form}
      onSubmit={submit}
      className="rounded-ledger border-rule bg-surface flex flex-wrap items-center gap-2 border p-2"
    >
      <label className="flex min-w-[14rem] flex-[3] items-center gap-1">
        <span className="sr-only">What has to be done (required)</span>
        <input
          ref={title}
          name="title"
          required
          maxLength={TITLE_LIMIT}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="What has to be done? Ring Jaspal about the GST notice"
          className={`${field} placeholder:text-faint w-full`}
        />
        {/* the other forms in the app mark a required field this way (#29) */}
        <span
          className="text-redpen text-13"
          aria-hidden="true"
          title="Required"
        >
          *
        </span>
      </label>

      <label className="flex items-center">
        <span className="sr-only">By when</span>
        <input type="date" name="due" className={`${field} num`} />
      </label>

      {people.length > 1 && (
        <label className="flex min-w-[9rem] flex-1 items-center">
          <span className="sr-only">Give it to</span>
          <select
            name="ownerId"
            defaultValue={me}
            className={`${field} w-full`}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/*
        The client picker is gone (owner request, 03-11-2026).

        It was a five-hundred-option `<select>` in a composer meant to be
        filled in in one pass, and it took a fifth of the row for something
        almost no line needed — the client is usually in the title anyway
        ("Ring Jaspal about the GST notice"). The field itself is untouched
        on the record: `addTodo` still reads `clientId`, and to-dos that
        already have one keep showing it in the list.
      */}

      <label className="flex min-w-[10rem] flex-[2] items-center">
        <span className="sr-only">Anything else (optional)</span>
        <input
          name="note"
          maxLength={500}
          placeholder="A note, if it needs one"
          className={`${field} placeholder:text-faint w-full`}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-control bg-carbon text-13 text-on-carbon h-8 shrink-0 px-3 font-medium disabled:opacity-60"
      >
        Add
      </button>

      {/*
        Only near the limit, and only loudly at it: a counter sitting under
        every empty composer is noise, and the person who needs it is the
        one whose sentence has stopped going in (#27).
      */}
      {left <= 40 && (
        <p
          role="status"
          className={`text-12 basis-full ${left <= 0 ? "text-redpen" : "text-ink-muted"}`}
        >
          {left > 0
            ? `${left} characters left of ${TITLE_LIMIT}.`
            : `That is the whole line — ${TITLE_LIMIT} characters. Put the rest in the note beside it.`}
        </p>
      )}

      {state?.error && (
        <p role="alert" className="text-13 text-redpen basis-full">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-13 text-filed basis-full">
          {state.ok}
        </p>
      )}
    </form>
  );
}
