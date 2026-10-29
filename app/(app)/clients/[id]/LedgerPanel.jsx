"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PAYMENT_MODES } from "@/lib/billing/allocation";
import { recordPayment, suggestFor } from "../../invoices/payments";

/**
 * A client's account (spec section 7): what they have been billed, what
 * they have paid, what TDS they have deducted, and what is left.
 *
 * Recording a receipt is the common job here, so it is one panel: amount,
 * TDS, and a suggested spread across the oldest open invoices that the
 * person can change before saving.
 */
export default function LedgerPanel({
  clientId,
  mayEdit,
  entries,
  closing,
  openInvoices,
  invoices,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [tds, setTds] = useState("");
  const [mode, setMode] = useState("Bank transfer");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [allocations, setAllocations] = useState({});
  const [pending, startTransition] = useTransition();

  /** Ask the server where this would go, then let the person change it. */
  function suggest() {
    startTransition(async () => {
      const result = await suggestFor(clientId, amount, tds);
      if (result?.error) {
        setMessage(result);
        return;
      }
      const next = {};
      for (const a of result.allocations) {
        next[a.invoiceId] = {
          amount: String(a.amountPaise / 100),
          tds: String((a.tdsPaise ?? 0) / 100),
        };
      }
      setAllocations(next);
      setMessage(
        result.unallocatedPaise > 0
          ? {
              ok: `₹${(result.unallocatedPaise / 100).toLocaleString("en-IN")} would be left as credit on the client.`,
            }
          : null,
      );
    });
  }

  function save() {
    startTransition(async () => {
      const result = await recordPayment({
        clientId,
        amount,
        tds,
        mode,
        reference,
        date,
        allocations: Object.entries(allocations).map(([invoiceId, a]) => ({
          invoiceId,
          amount: a.amount,
          tds: a.tds,
        })),
      });
      setMessage(result);
      if (result?.ok) {
        setAdding(false);
        setAmount("");
        setTds("");
        setReference("");
        setAllocations({});
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
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

      <section className="rounded-ledger border-rule bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
        <div>
          <p className="text-13 text-ink-muted">Owed to us</p>
          <p className="num font-display text-28">{closing}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mayEdit && (
            <>
              <Link
                href={`/invoices/new?client=${clientId}`}
                className="rounded-control border-rule text-14 h-9 border px-3 leading-9"
              >
                New invoice
              </Link>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium"
              >
                {adding ? "Cancel" : "Record a payment"}
              </button>
            </>
          )}
        </div>
      </section>

      {adding && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <h2 className="font-display text-15 font-semibold">Money received</h2>

          <div className="grid gap-3 sm:grid-cols-5">
            <Field
              label="Amount received"
              value={amount}
              onChange={setAmount}
              inputMode="decimal"
            />
            <Field
              label="TDS deducted"
              value={tds}
              onChange={setTds}
              inputMode="decimal"
            />
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Reference"
              value={reference}
              onChange={setReference}
            />
            <Field label="Date" value={date} onChange={setDate} type="date" />
          </div>

          <div>
            <button
              type="button"
              disabled={pending || !amount}
              onClick={suggest}
              className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
            >
              Spread it across the oldest invoices
            </button>
          </div>

          {openInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="text-14 w-full">
                <thead>
                  <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                    <th className="px-2 py-2 font-medium">Invoice</th>
                    <th className="px-2 py-2 text-right font-medium">Owed</th>
                    <th className="px-2 py-2 text-right font-medium">
                      Put against it
                    </th>
                    <th className="px-2 py-2 text-right font-medium">TDS</th>
                  </tr>
                </thead>
                <tbody>
                  {openInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-rule border-b">
                      <td className="px-2 py-1 font-mono">{invoice.number}</td>
                      <td className="num px-2 py-1 text-right">
                        {invoice.outstanding}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          aria-label={`Amount against ${invoice.number}`}
                          value={allocations[invoice.id]?.amount ?? ""}
                          inputMode="decimal"
                          onChange={(e) =>
                            setAllocations({
                              ...allocations,
                              [invoice.id]: {
                                ...allocations[invoice.id],
                                amount: e.target.value,
                              },
                            })
                          }
                          className="rounded-control border-rule bg-paper text-14 h-9 w-28 border px-2 text-right"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          aria-label={`TDS against ${invoice.number}`}
                          value={allocations[invoice.id]?.tds ?? ""}
                          inputMode="decimal"
                          onChange={(e) =>
                            setAllocations({
                              ...allocations,
                              [invoice.id]: {
                                ...allocations[invoice.id],
                                tds: e.target.value,
                              },
                            })
                          }
                          className="rounded-control border-rule bg-paper text-14 h-9 w-24 border px-2 text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-13 text-ink-muted">
              Nothing is outstanding. A payment recorded now sits as credit on
              the client until there is an invoice to put it against.
            </p>
          )}

          <div>
            <button
              type="button"
              disabled={pending || !amount}
              onClick={save}
              className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
            >
              {pending ? "Saving…" : "Record the payment"}
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-15 font-semibold">Ledger</h2>
        <div className="rounded-table border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 text-right font-medium">Billed</th>
                <th className="px-3 py-2 text-right font-medium">Received</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-rule border-b last:border-0"
                >
                  <td className="num text-13 px-3 py-2">{entry.date}</td>
                  <td className="px-3 py-2">{entry.kind}</td>
                  <td className="text-13 px-3 py-2 font-mono">
                    {entry.reference}
                  </td>
                  <td className="num px-3 py-2 text-right">{entry.debit}</td>
                  <td className="num px-3 py-2 text-right">{entry.credit}</td>
                  <td className="num px-3 py-2 text-right">{entry.balance}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-ink-muted px-3 py-6 text-center"
                  >
                    Nothing has been billed to this client yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-15 font-semibold">Invoices</h2>
        <div className="rounded-ledger border-rule bg-surface border">
          <table className="text-14 w-full">
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-rule border-b last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="font-mono underline underline-offset-4"
                    >
                      {invoice.number ?? "draft"}
                    </Link>
                  </td>
                  <td className="num text-13 px-3 py-2">{invoice.date}</td>
                  <td className="text-13 px-3 py-2">{invoice.status}</td>
                  <td className="num px-3 py-2 text-right">{invoice.total}</td>
                  <td className="num px-3 py-2 text-right">
                    {invoice.outstanding}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td className="text-ink-muted px-3 py-6 text-center">
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        {...rest}
      />
    </label>
  );
}
