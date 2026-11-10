"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Panel from "@/components/ui/Panel";
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
/**
 * How many notices stand above the list before it stops being a strip.
 * Past this they are capped and counted, the way every other overview
 * list on this screen caps and links out, rather than scrolled inside a
 * box of their own.
 */
const SHOWN = 2;

export default function AnnouncementStrip({ rows }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) return null;

  /** Anything needing an answer stands above anything that does not. */
  const ordered = [...rows].sort(
    (a, b) => Number(b.needsAck && !b.acked) - Number(a.needsAck && !a.acked),
  );
  const visible = ordered.slice(0, SHOWN);
  const rest = ordered.length - visible.length;

  function read(id) {
    startTransition(async () => {
      const result = await acknowledge(id);
      setMessage(result);
      router.refresh();
    });
  }

  return (
    /*
     * **No height cap, as of 10-11-2026.** There were two before this, and
     * both cut the panel through its contents: `max-h-44`, which sliced
     * the acknowledge button across the middle, and then `max-h-60` with a
     * fade, which on a phone fades out the sentence under that same button
     * mid-word. A notice the firm has asked people to read is the one
     * thing on this screen that must not arrive half drawn.
     *
     * So the panel is as tall as the notices in it, and the *count* is
     * capped instead: two stand here, the rest are counted with a way
     * through to them. That is what every other overview list on this
     * screen does, and it cannot clip anything.
     */
    <Panel
      title="From the firm"
      count={rows.length > 1 ? `${rows.length} up` : undefined}
      className="shrink-0"
    >
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

      <ul className="ledger-rule flex flex-col">
        {visible.map((row) => (
          <li
            key={row.id}
            className="border-rule flex flex-col gap-1 border-b pb-2 last:border-0 last:pb-0"
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
                /*
                 * The button alone. It used to carry a sentence beside it
                 * saying that nothing was held up either way — the line
                 * the phone's fade cut in half — and a control that needs
                 * a sentence explaining what pressing it does is a control
                 * with the wrong words on it. These are the right words.
                 */
                <button
                  type="button"
                  onClick={() => read(row.id)}
                  disabled={pending}
                  className="rounded-control bg-carbon text-13 text-on-carbon h-8 w-fit px-3 font-medium disabled:opacity-60"
                >
                  I have read this
                </button>
              ))}
          </li>
        ))}
      </ul>

      {rest > 0 && (
        <Link
          href="/inbox?kind=Announcements"
          className="text-13 text-ink-muted hover:text-carbon underline-offset-2 hover:underline"
        >
          {rest} more {rest === 1 ? "notice" : "notices"} from the firm
        </Link>
      )}
    </Panel>
  );
}
