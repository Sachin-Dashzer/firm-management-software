"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordLeave, cancelLeave } from "../actions";

/**
 * Leave, and who holds the work while it lasts (P3-16).
 *
 * The cover is a required field rather than an optional one, and the
 * sentence under it says what naming somebody actually does — their Issues
 * and their reminders, not their access. People hand over work on the
 * assumption that "being covered" means more than it does, and the screen
 * is the only place to say otherwise.
 */
export default function LeavePanel({
  id,
  name,
  rows,
  colleagues,
  kinds,
  mayEdit,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [withdrawing, setWithdrawing] = useState(null);

  const first = name.split(" ")[0];

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result?.ok) {
        setWithdrawing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
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

      <section className="flex flex-col gap-2">
        <h2 className="text-15 font-bold">Away</h2>
        {rows.length === 0 ? (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-4">
            Nothing recorded for {first}.
          </p>
        ) : (
          <ul className="rounded-table border-rule bg-surface divide-rule divide-y border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-14">
                    {row.from} – {row.to}
                    {row.kind === "Exam leave" ? " · exam leave" : ""}
                    {row.now ? " · away now" : row.past ? " · past" : ""}
                  </span>
                  <span className="text-13 text-ink-muted">
                    covered by <strong>{row.cover}</strong>
                  </span>
                </div>
                {row.note && (
                  <p className="text-12 text-ink-muted">{row.note}</p>
                )}
                <p className="text-12 text-ink-muted">
                  Recorded by {row.approvedByName || "a partner"}
                  {row.approvedOn ? ` on ${row.approvedOn}` : ""}
                </p>
                {mayEdit && !row.past && (
                  <div>
                    {withdrawing === row.id ? (
                      <form
                        action={(formData) =>
                          run(() => cancelLeave(row.id, formData.get("reason")))
                        }
                        className="flex flex-wrap items-end gap-2"
                      >
                        <label className="flex flex-1 flex-col gap-1">
                          <span className="text-13 font-medium">
                            Why is it being withdrawn?
                          </span>
                          <input
                            name="reason"
                            required
                            minLength={3}
                            className="rounded-control border-rule bg-paper text-13 h-8 border px-2"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-control border-rule bg-surface text-13 h-8 border px-3 disabled:opacity-60"
                        >
                          Withdraw
                        </button>
                        <button
                          type="button"
                          onClick={() => setWithdrawing(null)}
                          className="rounded-control border-rule bg-surface text-13 h-8 border px-3"
                        >
                          Leave it
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setWithdrawing(row.id)}
                        className="rounded-control border-rule bg-surface text-13 h-8 border px-3"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {mayEdit ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-15 font-bold">Record leave</h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Naming a cover gives that person {first}&rsquo;s rows on Issues and
            a copy of the reminders addressed to {first}, for as long as the
            leave lasts. It does <strong>not</strong> give them access to a
            client they could not already open, and it does not move the work:
            the engagements stay {first}&rsquo;s on the record. To change who is
            responsible, use{" "}
            <Link
              href={`/team/${id}/takeover`}
              className="underline underline-offset-4"
            >
              take over
            </Link>
            .
          </p>

          <form
            action={(formData) => run(() => recordLeave(id, formData))}
            className="flex flex-col gap-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">First day away</span>
                <input
                  type="date"
                  name="from"
                  required
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">Last day away</span>
                <input
                  type="date"
                  name="to"
                  required
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
                <span className="text-12 text-ink-muted">
                  Both days count — this is the last day they are not here.
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">Kind</span>
                <select
                  name="kind"
                  defaultValue="Leave"
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                >
                  {kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">
                  Who holds their work
                </span>
                <select
                  name="coverId"
                  required
                  defaultValue=""
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                >
                  <option value="">— choose —</option>
                  {colleagues.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · {person.role}
                    </option>
                  ))}
                </select>
                <span className="text-12 text-ink-muted">
                  Somebody who is here: a cover who is away themselves is
                  refused.
                </span>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-13 font-medium">Note (optional)</span>
              <input
                name="note"
                maxLength={300}
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>

            <div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
              >
                Record it
              </button>
            </div>
          </form>
        </section>
      ) : (
        <p className="text-13 text-ink-muted">
          A partner records leave, and recording it is the approval.
        </p>
      )}
    </div>
  );
}
