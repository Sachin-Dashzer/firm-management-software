"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllRead, markRead } from "./actions";

/** The list, with unread ones marked in the margin rather than shouted. */
export default function NotificationList({ rows }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const unread = rows.filter((r) => !r.read).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-13 text-ink-muted">
          {unread > 0 ? `${unread} unread` : "All read"}
        </p>
        {unread > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setMessage(await markAllRead());
                router.refresh();
              })
            }
            className="text-13 underline underline-offset-4 disabled:opacity-60"
          >
            Mark everything read
          </button>
        )}
      </div>

      {message?.ok && (
        <p role="status" className="text-13 text-filed">
          {message.ok}
        </p>
      )}

      <ul className="rounded-ledger border-rule bg-surface flex flex-col border">
        {rows.map((row) => (
          <li
            key={row.id}
            className="border-rule flex gap-3 border-b px-4 py-3 last:border-0"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                row.read ? "bg-transparent" : "bg-carbon"
              }`}
            />
            <div className="min-w-0 flex-1">
              {row.href ? (
                <Link
                  href={row.href}
                  onClick={() => markRead(row.id)}
                  className="text-14 font-medium underline underline-offset-4"
                >
                  {row.title}
                </Link>
              ) : (
                <p className="text-14 font-medium">{row.title}</p>
              )}
              {row.body && <p className="text-13 text-ink-muted">{row.body}</p>}
              <p className="text-12 text-ink-muted num">
                {row.at}
                {!row.read && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          await markRead(row.id);
                          router.refresh();
                        })
                      }
                      className="underline underline-offset-4"
                    >
                      mark read
                    </button>
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-14 text-ink-muted px-4 py-8 text-center">
            Nothing yet.
          </li>
        )}
      </ul>
    </div>
  );
}
