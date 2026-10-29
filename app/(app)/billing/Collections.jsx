import Link from "next/link";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import { formatPaise } from "@/lib/money";
import { formatISTDate } from "@/lib/dates";
import { ageReceivables, outstandingOf } from "@/lib/billing/allocation";
import { promiseHolds, promiseBroken } from "@/lib/billing/promise";
import { advances } from "@/lib/reports/figures";

const BUCKETS = ["current", "0-30", "31-60", "61-90", "90+"];

/**
 * What is owed and how old it is — the Collections tab (P3-22b), which is
 * the ageing half of the old receivables screen.
 *
 * Promises and money on account sit above the ageing rather than on pages
 * of their own (P3-3): the person reading what is owed is the person who
 * should be applying a receipt or ringing about a broken promise.
 */
export default async function Collections({ scope, actor }) {
  const invoices = await Invoice.find({
    ...scope,
    status: { $in: ["Sent", "Partially paid", "Disputed"] },
    type: { $ne: "Credit note" },
  })
    .sort({ dueDate: 1 })
    .limit(2000)
    .lean();

  const clients = await Client.find({
    _id: { $in: invoices.map((i) => i.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  const withOutstanding = invoices.map((invoice) => ({
    ...invoice,
    outstandingPaise: outstandingOf(invoice),
  }));

  const firmTotal = ageReceivables(withOutstanding);

  // the same buckets per client, because that is who gets chased
  const byClient = new Map();
  for (const invoice of withOutstanding) {
    const key = String(invoice.clientId);
    byClient.set(key, [...(byClient.get(key) ?? []), invoice]);
  }

  const rows = [...byClient.entries()]
    .map(([clientId, list]) => ({
      clientId,
      name: clientName.get(clientId) ?? "Client",
      ...ageReceivables(list),
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b["90+"] - a["90+"] || b.total - a.total);

  /**
   * Promises, split (P3-3).
   *
   * `holding` is money the firm has deliberately stopped chasing, and it
   * belongs on screen — otherwise the ageing looks ignored. `broken` is the
   * actionable list: a date the client gave that has passed, which is a
   * better reason to ring somebody than "it is 47 days old".
   */
  const promised = withOutstanding.filter((i) => i.promise?.date);
  const holding = promised
    .filter((i) => promiseHolds(i))
    .sort((a, b) => new Date(a.promise.date) - new Date(b.promise.date));
  const broken = promised
    .filter((i) => promiseBroken(i))
    .sort((a, b) => new Date(a.promise.date) - new Date(b.promise.date));

  /** Money received that is not against anything (P3-3). */
  const credit = await advances(actor);
  const creditNames = await Client.find({
    _id: { $in: credit.map((c) => c.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const creditName = new Map(
    creditNames.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  return (
    <>
      {credit.length > 0 && (
        <section className="rounded-ledger border-carbon bg-carbon-wash flex flex-col gap-2 border p-4">
          <h2 className="font-display text-18">
            Credit on account ·{" "}
            <span className="num">
              {formatPaise(credit.reduce((s, c) => s + c.paise, 0))}
            </span>
          </h2>
          <p className="text-13 text-ink-muted">
            Received and not yet put against an invoice. Apply it when recording
            the next payment for that client, or from their ledger.
          </p>
          <ul className="flex flex-col gap-1">
            {credit.map((row) => (
              <li key={row.clientId} className="text-13">
                <Link
                  href={`/clients/${row.clientId}?tab=ledger`}
                  className="underline underline-offset-4"
                >
                  {creditName.get(row.clientId) ?? "Client"}
                </Link>{" "}
                · <span className="num">{formatPaise(row.paise)}</span>{" "}
                <span className="text-ink-muted">
                  from {row.payments.length}{" "}
                  {row.payments.length === 1 ? "receipt" : "receipts"}, oldest{" "}
                  {formatISTDate(row.payments[row.payments.length - 1].date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(broken.length > 0 || holding.length > 0) && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <h2 className="font-display text-18">Payment promises</h2>

          {broken.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-13 text-redpen font-medium">
                {broken.length === 1
                  ? "One promise has passed without payment"
                  : `${broken.length} promises have passed without payment`}
              </p>
              <ul className="flex flex-col gap-1">
                {broken.map((invoice) => (
                  <li key={String(invoice._id)} className="text-13">
                    <Link
                      href={`/invoices/${invoice._id}`}
                      className="underline underline-offset-4"
                    >
                      {invoice.number}
                    </Link>{" "}
                    {clientName.get(String(invoice.clientId))} ·{" "}
                    <span className="num">
                      {formatPaise(invoice.outstandingPaise)}
                    </span>{" "}
                    <span className="text-ink-muted">
                      promised {formatISTDate(invoice.promise.date)}
                      {invoice.promise.note ? ` · ${invoice.promise.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {holding.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-13 text-ink-muted">
                Not being chased: {holding.length}{" "}
                {holding.length === 1 ? "invoice" : "invoices"} with a date
                still to come. Reminders restart on their own the day after.
              </p>
              <ul className="flex flex-col gap-1">
                {holding.map((invoice) => (
                  <li key={String(invoice._id)} className="text-13">
                    <Link
                      href={`/invoices/${invoice._id}`}
                      className="underline underline-offset-4"
                    >
                      {invoice.number}
                    </Link>{" "}
                    {clientName.get(String(invoice.clientId))} ·{" "}
                    <span className="num">
                      {formatPaise(invoice.outstandingPaise)}
                    </span>{" "}
                    <span className="text-ink-muted">
                      by {formatISTDate(invoice.promise.date)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-5">
        {BUCKETS.map((bucket) => (
          <div
            key={bucket}
            className={`rounded-ledger border p-3 ${
              bucket === "90+" && firmTotal[bucket] > 0
                ? "border-redpen bg-redpen-wash"
                : "border-rule bg-surface"
            }`}
          >
            <p className="num font-display text-20">
              {formatPaise(firmTotal[bucket])}
            </p>
            <p className="text-12 text-ink-muted">
              {bucket === "current" ? "Not yet due" : `${bucket} days`}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left font-normal">
              <th className="px-3 py-2 font-medium">Client</th>
              {BUCKETS.map((b) => (
                <th key={b} className="px-3 py-2 text-right font-medium">
                  {b === "current" ? "Not due" : b}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.clientId}
                className="border-rule border-b last:border-0"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/clients/${row.clientId}?tab=invoices`}
                    className="underline underline-offset-4"
                  >
                    {row.name}
                  </Link>
                </td>
                {BUCKETS.map((b) => (
                  <td
                    key={b}
                    className={`num px-3 py-2 text-right ${
                      b === "90+" && row[b] > 0 ? "text-redpen" : ""
                    }`}
                  >
                    {row[b] ? formatPaise(row[b]) : "—"}
                  </td>
                ))}
                <td className="num px-3 py-2 text-right font-medium">
                  {formatPaise(row.total)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  Nothing is outstanding.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
