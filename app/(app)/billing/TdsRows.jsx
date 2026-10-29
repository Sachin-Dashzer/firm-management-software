"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/money";
import Action from "@/components/ui/Action";
import { setTds26AS } from "../invoices/payments";

/**
 * The TDS list, one quarter at a time, with the tick (P3-22b).
 *
 * The tick is a claim about a government record, so it is audited like any
 * other change (the action writes the entry) and it is reversible from the
 * matched list — ticking the wrong receipt is the likeliest mistake on this
 * screen, and there has to be a way back.
 */
export default function TdsRows({ rows, matched, canTick, whyNot }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(null);

  function tick(id) {
    setBusy(id);
    startTransition(async () => {
      const result = await setTds26AS(id, !matched);
      setMessage(result);
      setBusy(null);
      if (result?.ok) router.refresh();
    });
  }

  const quarters = [];
  for (const row of rows) {
    const last = quarters[quarters.length - 1];
    if (last && last.label === row.quarter) last.rows.push(row);
    else quarters.push({ label: row.quarter, rows: [row] });
  }

  const total = rows.reduce((sum, row) => sum + row.tdsPaise, 0);

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

      {rows.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
          {matched
            ? "Nothing has been ticked off yet."
            : "No TDS is waiting to be matched. Every receipt with TDS on it has been found in 26AS."}
        </p>
      ) : (
        <>
          <p className="text-14">
            <strong className="num">{formatPaise(total)}</strong> across{" "}
            <strong>{rows.length}</strong>{" "}
            {rows.length === 1 ? "receipt" : "receipts"}
            {matched ? " ticked off." : " still to find in 26AS."}
          </p>

          {quarters.map((quarter) => (
            <section key={quarter.label} className="flex flex-col gap-2">
              <h2 className="text-13 text-ink-muted font-medium">
                {quarter.label}
                <span className="num">
                  {" · "}
                  {formatPaise(
                    quarter.rows.reduce((sum, row) => sum + row.tdsPaise, 0),
                  )}
                </span>
              </h2>

              <div className="rounded-table border-rule bg-surface overflow-x-auto border">
                <table className="text-14 w-full">
                  <thead>
                    <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                      <th className="px-3 py-2 font-medium">Received</th>
                      <th className="px-3 py-2 font-medium">Client</th>
                      <th className="px-3 py-2 font-medium">Against</th>
                      <th className="px-3 py-2 font-medium">Reference</th>
                      <th className="px-3 py-2 text-right font-medium">TDS</th>
                      <th className="px-3 py-2 font-medium">
                        <span className="sr-only">In 26AS</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {quarter.rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-rule border-b last:border-0"
                      >
                        <td className="num text-13 px-3 py-2">{row.date}</td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/clients/${row.clientId}?tab=ledger`}
                            className="underline underline-offset-4"
                          >
                            {row.client}
                          </Link>
                        </td>
                        <td className="text-13 px-3 py-2 font-mono">
                          {row.against.length === 0 ? (
                            <span className="text-ink-muted">on account</span>
                          ) : (
                            row.against.map((invoice, index) => (
                              <span key={invoice.id}>
                                {index > 0 && ", "}
                                <Link
                                  href={`/invoices/${invoice.id}`}
                                  className="underline underline-offset-4"
                                >
                                  {invoice.number}
                                </Link>
                              </span>
                            ))
                          )}
                        </td>
                        <td className="text-13 text-ink-muted px-3 py-2">
                          {row.reference || "—"}
                        </td>
                        <td className="num px-3 py-2 text-right">
                          {formatPaise(row.tdsPaise)}
                        </td>
                        <td className="px-3 py-2">
                          <Action
                            id={`tds-${row.id}`}
                            tone="plain"
                            why={canTick ? null : whyNot}
                            pending={pending && busy === row.id}
                            onClick={() => tick(row.id)}
                          >
                            {matched ? "Not in 26AS" : "Seen in 26AS"}
                          </Action>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
