"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { addTodo } from "./actions";

/**
 * One line at the top of the list (P3-22c).
 *
 * A title and nothing else is a valid to-do, so the date, the person and
 * the client sit beside it rather than behind a dialog — anything that
 * takes two screens to write down gets written on paper instead.
 *
 * The form clears itself and keeps the focus in the title box, because the
 * way anybody uses this is three in a row.
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

  return (
    <form
      ref={form}
      action={action}
      className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            What has to be done
          </span>
          <input
            ref={title}
            name="title"
            required
            maxLength={200}
            placeholder="Ring Jaspal about the GST notice"
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">By when</span>
          <input
            type="date"
            name="due"
            className="rounded-control border-rule bg-paper num text-14 h-9 border px-2"
          />
        </label>

        {people.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Give it to
            </span>
            <select
              name="ownerId"
              defaultValue={me}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
        >
          Add
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {clients.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              About a client (optional)
            </span>
            <select
              name="clientId"
              defaultValue=""
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              <option value="">— none —</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Anything else (optional)
          </span>
          <input
            name="note"
            maxLength={500}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>
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
