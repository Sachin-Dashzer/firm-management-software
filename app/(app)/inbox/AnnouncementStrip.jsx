"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledge } from "./announcements/actions";

/**
 * What the firm has said, at the top of everybody's inbox (P3-17b).
 *
 * Above the list rather than in it, because an announcement is not a nudge
 * about one record — it is up until it comes down, and a row that scrolls
 * away with yesterday's notifications is one nobody reads.
 *
 * Acknowledging never gates anything. It is a line saying somebody has read
 * it, for the partner who asked.
 */
export default function AnnouncementStrip({ rows }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) return null;

  function read(id) {
    startTransition(async () => {
      const result = await acknowledge(id);
      setMessage(result);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-15 font-bold">From the firm</h2>

      {message?.ok && (
        <p role="status" className="text-13 text-filed">
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p role="alert" className="text-13 text-redpen">
          {message.error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-ledger border-carbon-soft bg-sunk flex flex-col gap-1 border px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-14 font-medium">{row.title}</h3>
              <span className="text-12 text-ink-muted">
                {row.postedByName} · {row.from}
                {row.until ? ` – ${row.until}` : ""}
              </span>
            </div>
            <p className="text-14 whitespace-pre-line">{row.body}</p>

            {row.needsAck &&
              (row.acked ? (
                <p className="text-12 text-filed">
                  You said you had read this on {row.ackedAt}.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => read(row.id)}
                    disabled={pending}
                    className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                  >
                    I have read this
                  </button>
                  <span className="text-12 text-ink-muted">
                    Nothing is held up either way — it tells{" "}
                    {row.postedByName.split(" ")[0]} who has seen it.
                  </span>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
