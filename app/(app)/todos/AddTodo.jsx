"use client";

import { useActionState, useEffect, useRef } from "react";
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
 */
export default function AddTodo({ people, clients, me }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addTodo, null);
  const form = useRef(null);
  const title = useRef(null);

  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      title.current?.focus();
      router.refresh();
    }
  }, [state, router]);

  const field =
    "rounded-control border-rule bg-paper text-13 h-8 border px-2 min-w-0";

  return (
    <form
      ref={form}
      action={action}
      className="rounded-ledger border-rule bg-surface flex flex-wrap items-center gap-2 border p-2"
    >
      <label className="flex min-w-[14rem] flex-[3] items-center">
        <span className="sr-only">What has to be done</span>
        <input
          ref={title}
          name="title"
          required
          maxLength={200}
          placeholder="What has to be done? Ring Jaspal about the GST notice"
          className={`${field} placeholder:text-faint w-full`}
        />
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

      {clients.length > 0 && (
        <label className="flex min-w-[9rem] flex-1 items-center">
          <span className="sr-only">About a client (optional)</span>
          <select name="clientId" defaultValue="" className={`${field} w-full`}>
            <option value="">— about a client —</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
      )}

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
