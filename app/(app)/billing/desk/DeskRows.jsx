"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Action from "@/components/ui/Action";
import {
  issueInvoice,
  recordPromise,
  clearPromise,
} from "../../invoices/actions";
import { reallocatePayment } from "../../invoices/payments";
import { decideFeeWaiver } from "../../engagements/actions";

/**
 * The accounts desk performs its own decisions (P3-31, reversing D74).
 *
 * D74 made this screen four lists and nothing else, on the reasoning that
 * the desk shows what needs doing and the doing belongs on the record. The
 * owner asked for the prototype's behaviour instead, and the reasoning
 * that was load-bearing in D74 is kept: **no decision is reimplemented
 * here.** Every button below calls the same server action the record's own
 * screen calls — `issueInvoice`, `decideFeeWaiver`, `recordPromise`,
 * `reallocatePayment`, `setTds26AS` — so the permission check, the
 * refusal, the audit entry and the arithmetic are all in one place and
 * cannot drift between two screens.
 *
 * What changes is only where the click happens. The refusals still come
 * from `whyNot()` on the server and are shown rather than hidden (P3-8).
 */

/** One shared pattern: run, show what came back, re-read the page. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState(null);

  const run = (fn) =>
    start(async () => {
      try {
        setResult(await fn());
      } catch (error) {
        setResult({ error: error?.message ?? "That did not go through." });
      }
      router.refresh();
    });

  return { run, pending, result };
}

function Said({ result }) {
  if (!result?.error && !result?.ok) return null;
  return (
    <p
      role={result.error ? "alert" : "status"}
      className={`text-13 ${result.error ? "text-redpen" : "text-filed"}`}
    >
      {result.error ?? result.ok}
    </p>
  );
}

/* ---------------------------------------------------------------- drafts */

/**
 * Issue a draft from the desk.
 *
 * Nothing is batched. Issuing takes the next number in a gapless series
 * per branch (spec section 7), and a button that issues eleven invoices on
 * one click is a button that numbers eleven invoices before anybody has
 * read one of them.
 */
export function DraftRows({ rows, why }) {
  const { run, pending, result } = useRun();

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-rule flex flex-col divide-y">
        {rows.map((row) => (
          <li
            key={row.id}
            className="text-13 flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0"
          >
            <Link
              href={`/invoices/${row.id}`}
              className="min-w-0 flex-1 underline underline-offset-4"
            >
              {row.client}
            </Link>
            <span className="num">{row.total}</span>
            <span className="text-ink-muted">drafted {row.drafted}</span>
            <Action
              why={why}
              tone="plain"
              pending={pending}
              id={`issue-${row.id}`}
              onClick={() => run(() => issueInvoice(row.id))}
            >
              Issue
            </Action>
          </li>
        ))}
      </ul>
      <Said result={result} />
      <p className="text-12 text-faint">
        Issuing takes the next number in the branch&rsquo;s gapless series,
        which is why it is one invoice at a time and not a tick-box list.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- waivers */

/** Approve or decline a fee waiver, with the reason the decision needs. */
export function WaiverRows({ rows, why, isPartner }) {
  const { run, pending, result } = useRun();
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-rule flex flex-col divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 py-2 first:pt-0">
            <div className="text-13 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/engagements/${row.id}`}
                className="min-w-0 flex-1 underline underline-offset-4"
              >
                {row.client}
              </Link>
              {row.fee && <span className="num">{row.fee}</span>}
              {isPartner && (
                <>
                  <Action
                    why={why}
                    tone="plain"
                    pending={pending}
                    id={`waive-yes-${row.id}`}
                    onClick={() => run(() => decideFeeWaiver(row.id, true))}
                  >
                    Approve the waiver
                  </Action>
                  <Action
                    why={why}
                    tone="quiet"
                    pending={pending}
                    id={`waive-no-${row.id}`}
                    onClick={() => {
                      setOpen(open === row.id ? null : row.id);
                      setReason("");
                    }}
                  >
                    Decline
                  </Action>
                </>
              )}
            </div>
            <p className="text-12 text-ink-muted">
              {row.what} · asked by {row.by}
              {row.reason ? ` · ${row.reason}` : ""}
            </p>

            {open === row.id && (
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex flex-col gap-1">
                  <span className="text-13 text-ink-muted">
                    Why it is not being waived
                  </span>
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  />
                </label>
                <span className="text-12 text-faint max-w-[64ch]">
                  The person who asked reads this, so it is the answer to
                  &ldquo;why am I still billing them&rdquo; — it goes on the
                  engagement and into the log.
                </span>
                <div className="flex gap-2">
                  <Action
                    why={why}
                    tone="plain"
                    pending={pending || reason.trim().length < 3}
                    id={`waive-no-go-${row.id}`}
                    onClick={() =>
                      run(async () => {
                        const said = await decideFeeWaiver(
                          row.id,
                          false,
                          reason,
                        );
                        if (said?.ok) setOpen(null);
                        return said;
                      })
                    }
                  >
                    Decline the waiver
                  </Action>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="text-13 text-ink-muted underline underline-offset-4"
                  >
                    Leave it
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Said result={result} />
    </div>
  );
}

/* -------------------------------------------------------------- promises */

/** Move the date a client gave, or take the promise off. */
export function PromiseRows({ rows, why }) {
  const { run, pending, result } = useRun();
  const [open, setOpen] = useState(null);

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-rule flex flex-col divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 py-2 first:pt-0">
            <div className="text-13 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/invoices/${row.id}`}
                className="font-mono underline underline-offset-4"
              >
                {row.number}
              </Link>
              <span className="min-w-0 flex-1">{row.client}</span>
              <span className="num">{row.outstanding}</span>
              <span className={row.late ? "text-redpen" : "text-ink-muted"}>
                {row.late ? "promised" : "due"} {row.date}
              </span>
              <Action
                why={why}
                tone="quiet"
                pending={pending}
                id={`promise-${row.id}`}
                onClick={() => setOpen(open === row.id ? null : row.id)}
              >
                {row.late ? "They said again" : "Change"}
              </Action>
              <Action
                why={why}
                tone="quiet"
                pending={pending}
                id={`promise-off-${row.id}`}
                onClick={() => run(() => clearPromise(row.id))}
              >
                Take it off
              </Action>
            </div>
            {row.note && <p className="text-12 text-ink-muted">{row.note}</p>}

            {open === row.id && (
              <form
                action={(formData) =>
                  run(async () => {
                    const said = await recordPromise(row.id, formData);
                    if (said?.ok) setOpen(null);
                    return said;
                  })
                }
                className="flex flex-wrap items-end gap-3 pt-1"
              >
                <label className="flex flex-col gap-1">
                  <span className="text-13 text-ink-muted">
                    The new date they gave
                  </span>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={row.dateInput}
                    className="rounded-control border-rule bg-paper num text-14 h-9 border px-2"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-13 text-ink-muted">What they said</span>
                  <input
                    name="note"
                    maxLength={200}
                    defaultValue={row.note}
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  />
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-3 disabled:opacity-60"
                >
                  Record it
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <Said result={result} />
      <p className="text-12 text-faint max-w-[76ch]">
        Recording a promise pauses the automatic reminders until the day after
        it — which is the point of recording one, and the reason it is a date
        and a sentence rather than a tick.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- credit */

/**
 * Put unallocated money where it belongs.
 *
 * **The suggestion is computed on the server** by the same
 * `suggestAllocation` the ledger screen uses — oldest invoice first — and
 * this button applies exactly what is shown, nothing else. A one-click
 * apply that worked out its own order would be a second allocation policy
 * that nobody had agreed to.
 *
 * Anything the suggestion does not cover stays as credit on the client,
 * said in words, because a receipt larger than everything outstanding is
 * an ordinary thing and not an error.
 */
export function CreditRows({ rows, why }) {
  const { run, pending, result } = useRun();

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-rule flex flex-col divide-y">
        {rows.map((row) => (
          <li
            key={row.clientId}
            className="flex flex-col gap-2 py-2 first:pt-0"
          >
            <div className="text-13 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/clients/${row.clientId}?tab=ledger`}
                className="min-w-0 flex-1 underline underline-offset-4"
              >
                {row.client}
              </Link>
              <span className="num">{row.total}</span>
              <span className="text-ink-muted">oldest {row.oldest}</span>
            </div>

            {row.payments.map((payment) => (
              <div
                key={payment.id}
                className="border-rule-soft flex flex-col gap-1 border-l pl-3"
              >
                <span className="text-12 text-ink-muted">
                  {payment.date} · <span className="num">{payment.left}</span>{" "}
                  unapplied
                  {payment.reference ? ` · ${payment.reference}` : ""}
                </span>

                {payment.suggestion.length === 0 ? (
                  <span className="text-12 text-faint">
                    Nothing of this client&rsquo;s is outstanding, so this stays
                    as credit against their next invoice.
                  </span>
                ) : (
                  <>
                    <span className="text-12">
                      Would go on:{" "}
                      {payment.suggestion
                        .map((line) => `${line.number} ${line.amount}`)
                        .join(", ")}
                      {payment.leftOverAfter && (
                        <>
                          {" "}
                          · <span className="num">
                            {payment.leftOverAfter}
                          </span>{" "}
                          would stay as credit
                        </>
                      )}
                    </span>
                    <Action
                      why={why}
                      tone="plain"
                      pending={pending}
                      id={`apply-${payment.id}`}
                      onClick={() =>
                        run(() =>
                          reallocatePayment(payment.id, payment.allocations),
                        )
                      }
                      className="self-start"
                    >
                      Apply as shown
                    </Action>
                  </>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
      <Said result={result} />
      <p className="text-12 text-faint max-w-[76ch]">
        Oldest invoice first, which is the firm&rsquo;s own rule and the same
        one the client ledger offers. To split a receipt differently, open the
        ledger — this applies what is written above and nothing else.
      </p>
    </div>
  );
}
