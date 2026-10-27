"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { explainPeriod } from "./actions";
import { PERIOD_REASON_LABELS } from "@/lib/compliance/reasons";

/**
 * Every period whose date has passed with no job, and the three answers
 * (P3-9).
 *
 * The line a partner reads is the one above the buttons: **only the first is
 * a firm miss.** Before this, all three looked identical on the grid — a
 * dot — so the figure "periods with nothing created" mixed the firm's
 * failures in with clients who were never its to file for, and a number
 * like that is one nobody acts on.
 *
 * "Our miss" has no button of its own here on purpose: the fix is to create
 * the job, which is the first button, and a note saying "we missed this"
 * would be a second list to maintain.
 */
export default function NeverCreated({ rows, service, fyStart }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(() => new Set());

  const visible = rows.filter((row) => !done.has(row.key));

  if (!rows.length) {
    return (
      <p className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2">
        Every past period on this service has either a job against it or a
        reason it has none.
      </p>
    );
  }

  function explain(row, reason) {
    const form = new FormData();
    form.set("clientId", row.clientId);
    form.set("serviceTemplateId", service.id);
    form.set("period", row.period);
    form.set("reason", reason);
    form.set("note", note);

    startTransition(async () => {
      const result = await explainPeriod(form);
      setMessage(result);
      if (result?.ok) {
        setDone((old) => new Set(old).add(row.key));
        setOpen(null);
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-3 border p-4">
      <div>
        <h2 className="font-display text-15 font-semibold">
          Periods nobody has an answer for · {visible.length}
        </h2>
        <p className="text-13 max-w-[70ch]">
          Each line is a period on <strong>{service.name}</strong> whose due
          date has passed with no job against it. Decide which it is —{" "}
          <strong>only the first is a firm miss.</strong>
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

      <ul className="flex flex-col gap-2">
        {visible.slice(0, 25).map((row) => (
          <li
            key={row.key}
            className="rounded-ledger border-rule bg-paper flex flex-col gap-2 border p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-14">
                <Link
                  href={`/clients/${row.clientId}`}
                  className="font-medium underline underline-offset-4"
                >
                  {row.clientName}
                </Link>{" "}
                <span className="text-ink-muted">· {row.periodLabel}</span>
              </p>

              {open === row.key ? (
                <p className="text-12 text-ink-muted">
                  Add a note if you know who did it, then choose.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {/* the only one that is a failure, and the only one whose
                      fix is a job rather than a note */}
                  <Link
                    href={`/engagements/new?client=${row.clientId}&service=${service.id}&period=${row.period}`}
                    className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 leading-8 font-medium"
                  >
                    Create the job (our miss)
                  </Link>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setOpen(row.key);
                      setNote("");
                      setMessage(null);
                    }}
                    className="rounded-control border-rule text-13 h-8 border px-3 disabled:opacity-60"
                  >
                    Not our miss…
                  </button>
                </div>
              )}
            </div>

            {open === row.key && (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    Who did it, or why they were not with us (optional)
                  </span>
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. filed by their earlier CA"
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => explain(row, "other-professional")}
                    className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                  >
                    {PERIOD_REASON_LABELS["other-professional"]}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => explain(row, "not-engaged")}
                    className="rounded-control border-rule text-13 h-8 border px-3 disabled:opacity-60"
                  >
                    {PERIOD_REASON_LABELS["not-engaged"]}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="text-13 text-ink-muted underline underline-offset-4"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {visible.length > 25 && (
        <p className="text-12 text-ink-muted">
          Showing 25 of {visible.length}. The rest appear as they are dealt with
          — or change the financial year above to {fyStart} to narrow it.
        </p>
      )}
    </section>
  );
}
