"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/money";
import FeeScope from "@/components/billing/FeeScope";

/**
 * Finished work nobody has billed, and the one place the firm decides what
 * each job is worth (P3-4).
 *
 * Retainer and waived work stays on this list with its reason rather than
 * dropping off it. A list that shrinks when a fee is waived cannot be
 * reconciled against the work that was done — and the waiver is precisely
 * what a peer reviewer asks to see.
 *
 * The rows a partner has to decide about sort to the top and the count says
 * so, but the buttons stay on the row. One action in one place: the same
 * screen offering Approve twice is the thing P3-8 exists to stop.
 */
export default function UnbilledWork({
  rows,
  canPrice,
  isPartner,
  whyNoPricing = null,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);

  function onResult(result) {
    setMessage(result);
    if (result?.ok) router.refresh();
  }

  const waiting = rows.filter((r) => r.waiver).length;
  const chargeable = rows.filter((r) => r.scope === "billable");
  const billableTotal = chargeable.reduce((sum, r) => sum + r.feePaise, 0);
  const settled = rows.length - chargeable.length;

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex flex-col gap-1">
        <p className="text-14">
          <strong>{rows.length}</strong>{" "}
          {rows.length === 1 ? "job is" : "jobs are"} finished and not billed.{" "}
          <strong className="num">{formatPaise(billableTotal)}</strong> of that
          is chargeable before tax
          {settled > 0 && (
            <>
              ; {settled} {settled === 1 ? "job is" : "jobs are"} settled
              another way and {settled === 1 ? "stays" : "stay"} here with the
              reason
            </>
          )}
          .
        </p>
        {waiting > 0 && (
          <p className="text-13 text-waiting">
            {waiting === 1
              ? "One fee waiver is waiting for a partner"
              : `${waiting} fee waivers are waiting for a partner`}
            {isPartner ? " — they are at the top of the list." : "."}
          </p>
        )}
      </div>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule bg-sunk text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Work</th>
              <th className="px-3 py-2 font-medium">Finished</th>
              <th className="px-3 py-2 text-right font-medium">Fee</th>
              <th className="min-w-[18rem] px-3 py-2 font-medium">
                How it is paid for
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2 align-top">{r.client}</td>
                <td className="text-13 px-3 py-2 align-top">
                  <Link
                    href={`/engagements/${r.id}`}
                    className="underline underline-offset-4"
                  >
                    {r.work}
                  </Link>{" "}
                  · {r.period}
                </td>
                <td className="num text-13 px-3 py-2 align-top">
                  {r.finished || "—"}
                </td>
                <td className="num px-3 py-2 text-right align-top">
                  {r.feePaise > 0 ? formatPaise(r.feePaise) : "—"}
                </td>
                <td className="text-13 px-3 py-2 align-top">
                  <p className={r.blocked ? "text-redpen" : ""}>
                    {r.stateLabel}
                    {r.stateDetail && (
                      <span className="text-ink-muted"> — {r.stateDetail}</span>
                    )}
                  </p>
                  <FeeScope
                    money={r}
                    canPrice={canPrice}
                    isPartner={isPartner}
                    whyNoPricing={whyNoPricing}
                    onResult={onResult}
                  />
                  {!r.blocked && r.scope === "billable" && (
                    <Link
                      href={`/invoices/new?client=${r.clientId}`}
                      className="text-13 mt-1 inline-block underline underline-offset-4"
                    >
                      Bill it
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  Everything finished has been billed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
