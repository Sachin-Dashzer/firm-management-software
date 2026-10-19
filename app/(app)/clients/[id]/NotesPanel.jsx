"use client";

import { useState, useTransition } from "react";
import { CONTACT_CHANNELS } from "@/lib/validators";
import { addClientNote } from "../actions";

/**
 * Notes and the communication log in one place (spec section 3): a plain note,
 * or a record that somebody called, met, emailed or messaged the client.
 */
export default function NotesPanel({ clientId, notes, mayEdit }) {
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      {mayEdit && (
        <form
          action={(formData) =>
            startTransition(async () => {
              const result = await addClientNote(clientId, formData);
              setMessage(result);
              if (result?.ok) {
                const field = document.getElementById("note-body");
                if (field) field.value = "";
              }
            })
          }
          className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
        >
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">Kind</span>
              <select
                name="kind"
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              >
                <option value="Note">Note</option>
                {CONTACT_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">When</span>
              <input
                type="date"
                name="occurredAt"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              What happened
            </span>
            <textarea
              id="note-body"
              name="body"
              rows={3}
              required
              placeholder="Called about pending GST data for September; will send by Friday."
              className="rounded-ledger border-rule bg-paper text-14 border p-2"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add entry"}
            </button>
            {message?.ok && (
              <span role="status" className="text-13 text-filed">
                {message.ok}
              </span>
            )}
            {message?.error && (
              <span role="alert" className="text-13 text-redpen">
                {message.error}
              </span>
            )}
          </div>
        </form>
      )}

      <div className="rounded-ledger border-rule bg-surface border px-4">
        {notes.length === 0 ? (
          <p className="text-14 text-ink-muted py-4">
            Nothing logged for this client yet.
          </p>
        ) : (
          <ol className="flex flex-col">
            {notes.map((n) => (
              <li
                key={n.id}
                className="border-rule flex gap-3 border-b py-3 last:border-0"
              >
                <div className="w-28 shrink-0">
                  <p className="num text-13 text-ink-muted">{n.when}</p>
                  <p className="text-12 text-brass-ink">{n.kind}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-14 whitespace-pre-wrap">{n.body}</p>
                  <p className="text-12 text-ink-muted">{n.who}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
