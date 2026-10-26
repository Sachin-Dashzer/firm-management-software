import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import { formatPaise } from "@/lib/money";
import { formatISTDate } from "@/lib/dates";
import { ageReceivables, outstandingOf } from "@/lib/billing/allocation";
import { promiseHolds, promiseBroken } from "@/lib/billing/promise";
import { advances } from "@/lib/reports/figures";
import { clientIdsInGroup } from "@/lib/groups/summary";
import ClientGroup from "@/models/ClientGroup";

export const metadata = { title: "Receivables · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Two reports the firm loses money without (spec section 7): what is owed
 * and how old it is, and work that was finished but never billed.
 *
 * They sit on one screen because they answer the same question from two
 * ends — where has the money gone.
 */
export default async function ReceivablesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "invoices")) redirect("/today");

  const params = (await searchParams) ?? {};
  const tab = params.tab === "unbilled" ? "unbilled" : "ageing";

  await connectDB();
  const scope = branchFilter(actor, "invoices") ?? {};

  /**
   * One group's money, reached from the group page (P2-11). The group is
   * resolved to the businesses this person may see, so the filter narrows
   * the branch scope above and never widens it.
   */
  const group = params.group
    ? await ClientGroup.findById(params.group).select("name").lean()
    : null;
  if (group) {
    scope.clientId = { $in: await clientIdsInGroup(actor, params.group) };
  }

  if (tab === "unbilled") {
    const engagements = await Engagement.find({
      ...scope,
      billingStatus: "Unbilled",
      status: { $in: ["Filed / delivered", "Completed"] },
    })
      .sort({ completedAt: 1 })
      .limit(500)
      .lean();

    const clients = await Client.find({
      _id: { $in: engagements.map((e) => e.clientId) },
    })
      .select("legalName tradeName")
      .lean();
    const clientName = new Map(
      clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
    );

    const total = engagements.reduce((sum, e) => sum + (e.feePaise ?? 0), 0);

    return (
      <Shell tab={tab} group={group}>
        <p className="text-14">
          <strong>{engagements.length}</strong>{" "}
          {engagements.length === 1 ? "job is" : "jobs are"} finished and not
          billed, worth <strong className="num">{formatPaise(total)}</strong>{" "}
          before tax.
        </p>

        <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Work</th>
                <th className="px-3 py-2 font-medium">Finished</th>
                <th className="px-3 py-2 text-right font-medium">Fee</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => (
                <tr
                  key={String(e._id)}
                  className="border-rule border-b last:border-0"
                >
                  <td className="px-3 py-2">
                    {clientName.get(String(e.clientId)) ?? "Client"}
                  </td>
                  <td className="text-13 px-3 py-2">
                    <Link
                      href={`/engagements/${e._id}`}
                      className="underline underline-offset-4"
                    >
                      {e.templateSnapshot?.name ?? "Work"}
                    </Link>{" "}
                    · {e.periodLabel || e.period}
                  </td>
                  <td className="num text-13 px-3 py-2">
                    {e.completedAt ? formatISTDate(e.completedAt) : "—"}
                  </td>
                  <td className="num px-3 py-2 text-right">
                    {formatPaise(e.feePaise ?? 0)}
                  </td>
                  <td className="text-13 px-3 py-2">
                    <Link
                      href={`/invoices/new?client=${e.clientId}`}
                      className="underline underline-offset-4"
                    >
                      Bill it
                    </Link>
                  </td>
                </tr>
              ))}
              {engagements.length === 0 && (
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
      </Shell>
    );
  }

  // --- ageing -------------------------------------------------------------
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

  const BUCKETS = ["current", "0-30", "31-60", "61-90", "90+"];

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

  /**
   * Money received that is not against anything (P3-3). Shown here rather
   * than on a page of its own, because the person reading receivables is the
   * person who should be applying it.
   */
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
    <Shell tab={tab} group={group}>
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

      <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
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
    </Shell>
  );
}

function Shell({ tab, group = null, children }) {
  const query = (key) =>
    new URLSearchParams([
      ...(key === "ageing" ? [] : [["tab", key]]),
      ...(group ? [["group", String(group._id)]] : []),
    ]).toString();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link
          href="/invoices"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Billing
        </Link>
        <h1 className="font-display text-28 font-semibold">
          Where the money is
        </h1>
      </div>

      {group && (
        <p className="text-14 flex flex-wrap items-center gap-2">
          <span>
            The <strong>{group.name}</strong> group only.
          </span>
          <Link
            href="/invoices/receivables"
            className="text-13 text-ink-muted underline underline-offset-4"
          >
            Show the whole firm
          </Link>
        </p>
      )}

      <div className="flex gap-2">
        {[
          ["ageing", "Owed to us"],
          ["unbilled", "Done but not billed"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={
              query(key)
                ? `/invoices/receivables?${query(key)}`
                : "/invoices/receivables"
            }
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-ledger text-14 h-9 border px-3 leading-9 ${
              tab === key
                ? "border-carbon bg-carbon-wash text-carbon"
                : "border-rule hover:bg-carbon-wash"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
