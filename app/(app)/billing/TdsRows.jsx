"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/money";
import Action from "@/components/ui/Action";
import Notice, { Result } from "@/components/ui/Notice";
import { Table, Head, Th, Tr, Td, Num } from "@/components/ui/Table";
import { setTds26AS } from "../invoices/payments";

/**
 * The TDS list, one quarter at a time, with the tick (P3-22b).
 *
 * The tick is a claim about a government record, so it is audited like any
 * other change (the action writes the entry) and it is reversible from the
 * matched list — ticking the wrong receipt is the likeliest mistake on this
 * screen, and there has to be a way back.
 *
 * A quarter is a panel with its own subtotal, because 26AS is read a
 * quarter at a time and the figure somebody is reconciling against is the
 * quarter's, not the year's. The year's total is said once, above them.
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
      <Result message={message} />

      {rows.length === 0 ? (
        <Notice tone="flat">
          {matched
            ? "Nothing has been ticked off yet."
            : "No TDS is waiting to be matched. Every receipt with TDS on it has been found in 26AS."}
        </Notice>
      ) : (
        <>
          <p className="text-14">
            <strong className="num">{formatPaise(total)}</strong> across{" "}
            <strong className="num">{rows.length}</strong>{" "}
            {rows.length === 1 ? "receipt" : "receipts"}
            {matched ? " ticked off" : " still to find in 26AS"}, in{" "}
            {quarters.length} {quarters.length === 1 ? "quarter" : "quarters"}.
          </p>

          {quarters.map((quarter) => (
            <section
              key={quarter.label}
              className="rounded-table border-rule bg-surface overflow-hidden border"
            >
              <div className="border-rule flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-4 py-2.5">
                <h3 className="font-display text-15 font-semibold">
                  {quarter.label}
                  <span className="num text-ink-muted ml-1.5 font-normal">
                    ·{" "}
                    {formatPaise(
                      quarter.rows.reduce((sum, row) => sum + row.tdsPaise, 0),
                    )}
                  </span>
                </h3>
                <span className="text-12 text-ink-muted">
                  {quarter.rows.length}{" "}
                  {quarter.rows.length === 1 ? "receipt" : "receipts"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table fixed caption={`TDS deducted in ${quarter.label}`}>
                  <colgroup>
                    <col className="w-[8rem]" />
                    <col />
                    <col className="w-[13rem]" />
                    <col className="w-[12rem]" />
                    <col className="w-[9.5rem]" />
                    <col className="w-[11rem]" />
                  </colgroup>
                  <Head>
                    <Th>Received</Th>
                    <Th>Client</Th>
                    <Th>Against</Th>
                    <Th>Reference</Th>
                    <Th align="right" rule>
                      TDS
                    </Th>
                    <Th align="right">
                      <span className="sr-only">In 26AS</span>
                    </Th>
                  </Head>
                  <tbody>
                    {quarter.rows.map((row) => (
                      <Tr key={row.id}>
                        <Td className="num text-13 text-ink-muted">
                          {row.date}
                        </Td>
                        <Td className="truncate">
                          <Link
                            href={`/clients/${row.clientId}?tab=ledger`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {row.client}
                          </Link>
                        </Td>
                        <Td className="num text-13">
                          {row.against.length === 0 ? (
                            <span className="text-ink-muted font-sans">
                              on account
                            </span>
                          ) : (
                            row.against.map((invoice, index) => (
                              <span key={invoice.id}>
                                {index > 0 && ", "}
                                <Link
                                  href={`/invoices/${invoice.id}`}
                                  className="underline-offset-4 hover:underline"
                                >
                                  {invoice.number}
                                </Link>
                              </span>
                            ))
                          )}
                        </Td>
                        <Td className="text-13 text-ink-muted truncate">
                          {row.reference || "—"}
                        </Td>
                        <Td align="right" rule>
                          <Num paise={row.tdsPaise} strong />
                        </Td>
                        <Td align="right">
                          <Action
                            id={`tds-${row.id}`}
                            tone="plain"
                            why={canTick ? null : whyNot}
                            pending={pending && busy === row.id}
                            onClick={() => tick(row.id)}
                          >
                            {matched ? "Not in 26AS" : "Seen in 26AS"}
                          </Action>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
