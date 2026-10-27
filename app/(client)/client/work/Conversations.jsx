"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyOnJob } from "./actions";

/**
 * The client's half of a job's conversation (P3-17b).
 *
 * Only threads the firm has started appear here, and only the messages
 * meant for them: the internal thread is not filtered out on screen, it is
 * **never read** — `threadScope` asks the database for `internal: false`,
 * so a page that forgets cannot leak the firm talking to itself.
 *
 * One box per job rather than a single inbox, because a client's question
 * is always about a particular return and a reply with no job attached is
 * the thing that gets lost at both ends.
 */
export default function Conversations({ threads }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  if (threads.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-15 font-semibold">Messages</h2>
        <p className="text-14 text-ink-muted max-w-[65ch]">
          Anything we have written to you about a particular job, and your
          replies. Everybody working on it is told when you reply.
        </p>
      </div>

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

      <ul className="flex flex-col gap-3">
        {threads.map((thread) => (
          <li
            key={thread.id}
            className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-14 font-medium">{thread.service}</h3>
              <span className="text-12 text-ink-muted">{thread.period}</span>
            </div>

            <ul className="flex flex-col">
              {thread.messages.map((row) => (
                <li
                  key={row.id}
                  className="border-rule flex flex-col gap-0.5 border-b py-2 last:border-0"
                >
                  <p className="text-14 whitespace-pre-wrap">{row.body}</p>
                  <p className="text-12 text-ink-muted">
                    {row.mine ? "You" : row.by} · {row.at}
                  </p>
                </li>
              ))}
            </ul>

            <form
              action={(formData) =>
                startTransition(async () => {
                  const result = await replyOnJob(thread.id, formData);
                  setMessage(result);
                  if (result?.ok) router.refresh();
                })
              }
              className="flex flex-col gap-2"
            >
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">Reply</span>
                <textarea
                  name="body"
                  rows={2}
                  required
                  maxLength={4000}
                  className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
                />
              </label>
              <div>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
