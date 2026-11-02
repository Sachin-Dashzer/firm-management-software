import Link from "next/link";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import { formatPaise } from "@/lib/money";
import { formatISTDate } from "@/lib/dates";
import { ageReceivables, outstandingOf } from "@/lib/billing/allocation";
import { promiseHolds, promiseBroken } from "@/lib/billing/promise";
import { advances } from "@/lib/reports/figures";
import Panel from "@/components/ui/Panel";
import Chip from "@/components/ui/Chip";
import Notice from "@/components/ui/Notice";
import {
  TableShell,
  Table,
  Head,
  Th,
  Tr,
  Td,
  Meta,
  Num,
  Foot,
  Empty,
} from "@/components/ui/Table";

const BUCKETS = ["current", "0-30", "31-60", "61-90", "90+"];

const BUCKET_LABELS = {
  current: "Not yet due",
  "0-30": "0–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "Over 90 days",
};

/**
 * What is owed and how old it is — the Collections tab (P3-22b), which is
 * the ageing half of the old receivables screen.
 *
 * Promises and money on account sit above the ageing rather than on pages
 * of their own (P3-3): the person reading what is owed is the person who
 * should be applying a receipt or ringing about a broken promise.
 *
 * Redrawn 02-11-2026. Two things were wrong with it as a screen. The
 * ageing was five identical bordered cards, which is the lazy container
 * the house style refuses — it is **one** figure cut five ways, so it is
 * one band now, divided by hairlines, reading left to right from money
 * that is fine to money that is not. And the per-client table was a wall
 * of numbers with no shape: the client's worst bucket now carries the
 * weight, the row says how much of its total is late, and the firm's own
 * totals sit under the column they total.
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
      count: list.length,
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

  const late = firmTotal["0-30"] + firmTotal["31-60"] + firmTotal["61-90"] + firmTotal["90+"];

  return (
    <>
      {/*
        The ageing: one figure, cut five ways. The hairlines carry the
        division and only the last cell is marked, because a band where
        every cell is tinted says nothing about which end to start at.
      */}
      <section
        aria-label="Ageing"
        className="rounded-ledger border-rule bg-surface divide-rule grid divide-y border sm:grid-cols-5 sm:divide-x sm:divide-y-0"
      >
        {BUCKETS.map((bucket) => {
          const bad = bucket === "90+" && firmTotal[bucket] > 0;
          return (
            <div
              key={bucket}
              className={`flex flex-col gap-1 px-4 py-3 ${
                bad ? "bg-redpen-wash" : ""
              }`}
            >
              <span className="text-11 text-ink-muted font-semibold tracking-wide uppercase">
                {BUCKET_LABELS[bucket]}
              </span>
              <span
                className={`num font-display text-20 leading-none font-semibold ${
                  bad ? "text-redpen" : firmTotal[bucket] ? "" : "text-faint"
                }`}
              >
                {formatPaise(firmTotal[bucket])}
              </span>
            </div>
          );
        })}
      </section>

      <p className="text-13 text-ink-muted">
        <span className="num text-ink font-medium">
          {formatPaise(firmTotal.total)}
        </span>{" "}
        outstanding across {rows.length}{" "}
        {rows.length === 1 ? "client" : "clients"}
        {late > 0 && (
          <>
            , of which{" "}
            <span className="num text-redpen">{formatPaise(late)}</span> is past
            its date
          </>
        )}
        . Worst ageing first.
      </p>

      {credit.length > 0 && (
        <Panel
          title="Credit on account"
          count={formatPaise(credit.reduce((s, c) => s + c.paise, 0))}
          hint="Apply it on the next receipt, or from the client’s ledger"
        >
          <ul className="divide-rule flex flex-col divide-y">
            {credit.map((row) => (
              <li
                key={row.clientId}
                className="text-13 flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 first:pt-0 last:pb-0"
              >
                <Link
                  href={`/clients/${row.clientId}?tab=ledger`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {creditName.get(row.clientId) ?? "Client"}
                </Link>
                <span className="text-ink-muted">
                  from {row.payments.length}{" "}
                  {row.payments.length === 1 ? "receipt" : "receipts"}, oldest{" "}
                  <span className="num">
                    {formatISTDate(row.payments[row.payments.length - 1].date)}
                  </span>
                </span>
                <span className="num ms-auto font-medium">
                  {formatPaise(row.paise)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {broken.length > 0 && (
        <Notice
          tone="bad"
          title={
            broken.length === 1
              ? "One promise has passed without payment"
              : `${broken.length} promises have passed without payment`
          }
        >
          <ul className="mt-1 flex flex-col gap-1">
            {broken.map((invoice) => (
              <li key={String(invoice._id)}>
                <Link
                  href={`/invoices/${invoice._id}`}
                  className="font-mono underline-offset-4 hover:underline"
                >
                  {invoice.number}
                </Link>{" "}
                {clientName.get(String(invoice.clientId))} ·{" "}
                <span className="num font-medium">
                  {formatPaise(invoice.outstandingPaise)}
                </span>{" "}
                <span className="text-ink-muted">
                  promised{" "}
                  <span className="num">
                    {formatISTDate(invoice.promise.date)}
                  </span>
                  {invoice.promise.note ? ` · ${invoice.promise.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {holding.length > 0 && (
        <Panel
          title="Promised, not being chased"
          count={String(holding.length)}
          hint="Reminders restart by themselves the day after each date"
        >
          <ul className="divide-rule flex flex-col divide-y">
            {holding.map((invoice) => (
              <li
                key={String(invoice._id)}
                className="text-13 flex flex-wrap items-baseline gap-x-3 py-1.5 first:pt-0 last:pb-0"
              >
                <Link
                  href={`/invoices/${invoice._id}`}
                  className="font-mono underline-offset-4 hover:underline"
                >
                  {invoice.number}
                </Link>
                <span>{clientName.get(String(invoice.clientId))}</span>
                <Chip tone="soon" mono>
                  by {formatISTDate(invoice.promise.date)}
                </Chip>
                <span className="num ms-auto font-medium">
                  {formatPaise(invoice.outstandingPaise)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <TableShell>
        <Table fixed caption="What each client owes, by age, worst first">
          <colgroup>
            <col />
            <col className="w-[8.5rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[9.5rem]" />
          </colgroup>
          <Head>
            <Th>Client</Th>
            {BUCKETS.map((b, index) => (
              <Th key={b} align="right" rule={index === 0}>
                {b === "current" ? "Not due" : b}
              </Th>
            ))}
            <Th align="right">Owed</Th>
          </Head>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.clientId}>
                <Td className="truncate">
                  <Link
                    href={`/clients/${row.clientId}?tab=invoices`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <Meta>
                    <span className="num">{row.count}</span>{" "}
                    {row.count === 1 ? "invoice" : "invoices"}
                  </Meta>
                </Td>
                {BUCKETS.map((b, index) => (
                  <Td key={b} align="right" rule={index === 0}>
                    <Num paise={row[b]} tone={b === "90+" ? "late" : undefined} />
                  </Td>
                ))}
                <Td align="right">
                  <Num paise={row.total} strong />
                </Td>
              </Tr>
            ))}
            {rows.length === 0 && (
              <Empty colSpan={7}>Nothing is outstanding.</Empty>
            )}
          </tbody>
          {rows.length > 0 && (
            <Foot>
              <Td className="text-ink-muted">The firm</Td>
              {BUCKETS.map((b, index) => (
                <Td key={b} align="right" rule={index === 0}>
                  <Num
                    paise={firmTotal[b]}
                    strong
                    tone={b === "90+" ? "late" : undefined}
                  />
                </Td>
              ))}
              <Td align="right">
                <Num paise={firmTotal.total} strong />
              </Td>
            </Foot>
          )}
        </Table>
      </TableShell>
    </>
  );
}
