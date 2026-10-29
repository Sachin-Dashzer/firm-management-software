import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import { formatPaise } from "@/lib/money";
import { formatISTDate, startOfISTDay } from "@/lib/dates";
import { outstandingOf } from "@/lib/billing/allocation";
import { promiseBroken } from "@/lib/billing/promise";
import { advances } from "@/lib/reports/figures";
import { pendingWaiver } from "@/lib/engagements/scope";

export const metadata = { title: "Accounts desk · PHMG" };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * The billing desk's own day (P3-22b).
 *
 * Billing has four tabs of records; this is the one screen that says what
 * is waiting to be *done* today, which is a different question. Everything
 * on it is a list of things with a next action, and every row links to the
 * screen where that action already lives — nothing is performed from here,
 * so there is no second copy of a button to keep in step (P3-8).
 *
 * The order is the order the work runs in: money that has arrived and has
 * not been put anywhere, dates clients gave that have come round, bills
 * written and not sent, and fees somebody is waiting on a partner for.
 */
export default async function AccountsDeskPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "invoices")) redirect("/issues");

  const now = new Date();
  await connectDB();

  const scope = branchFilter(actor, "invoices") ?? {};
  const endOfToday = new Date(startOfISTDay(now).getTime() + DAY);

  const [credit, promised, drafts, waiverWork, tdsWaiting] = await Promise.all([
    advances(actor),

    /** A date the client gave that has arrived, or has gone by (P3-3). */
    Invoice.find({
      ...scope,
      status: { $in: ["Sent", "Partially paid", "Disputed"] },
      type: { $ne: "Credit note" },
      "promise.date": { $ne: null, $lt: endOfToday },
    })
      .sort({ "promise.date": 1 })
      .limit(200)
      .lean(),

    Invoice.find({ ...scope, status: "Draft" })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean(),

    Engagement.find({
      ...(branchFilter(actor, "invoices") ?? {}),
      "waiver.reason": { $nin: [null, ""] },
      "waiver.approvedAt": null,
      "waiver.declinedAt": null,
    })
      .sort({ "waiver.requestedAt": 1 })
      .limit(200)
      .lean(),

    Payment.countDocuments({
      ...scope,
      tdsPaise: { $gt: 0 },
      tdsSeenIn26AS: false,
    }),
  ]);

  const waivers = waiverWork.filter((e) => pendingWaiver(e));

  const names = await Client.find({
    _id: {
      $in: [
        ...credit.map((row) => row.clientId),
        ...promised.map((i) => i.clientId),
        ...drafts.map((i) => i.clientId),
        ...waivers.map((e) => e.clientId),
      ],
    },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    names.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const named = (id) => clientName.get(String(id)) ?? "Client";

  const creditTotal = credit.reduce((sum, row) => sum + row.paise, 0);
  const draftTotal = drafts.reduce(
    (sum, invoice) => sum + (invoice.totalPaise ?? 0),
    0,
  );

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link
          href="/billing?tab=collections"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Billing
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Accounts desk
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          What is waiting to be done today, in the order it runs.
        </p>
      </div>

      <Panel
        title="Money to apply"
        figure={credit.length > 0 ? formatPaise(creditTotal) : null}
        empty="Every receipt is against an invoice."
        count={credit.length}
      >
        <ul className="flex flex-col gap-1">
          {credit.map((row) => (
            <li key={row.clientId} className="text-13">
              <Link
                href={`/clients/${row.clientId}?tab=ledger`}
                className="underline underline-offset-4"
              >
                {named(row.clientId)}
              </Link>{" "}
              · <span className="num">{formatPaise(row.paise)}</span>{" "}
              <span className="text-ink-muted">
                oldest{" "}
                {formatISTDate(row.payments[row.payments.length - 1].date)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Promises that have come round"
        empty="No promise is due today."
        count={promised.length}
      >
        <ul className="flex flex-col gap-1">
          {promised.map((invoice) => {
            const late = promiseBroken(invoice, now);
            return (
              <li key={String(invoice._id)} className="text-13">
                <Link
                  href={`/invoices/${invoice._id}`}
                  className="font-mono underline underline-offset-4"
                >
                  {invoice.number ?? "draft"}
                </Link>{" "}
                {named(invoice.clientId)} ·{" "}
                <span className="num">
                  {formatPaise(outstandingOf(invoice))}
                </span>{" "}
                <span className={late ? "text-redpen" : "text-ink-muted"}>
                  {late ? "promised" : "due"}{" "}
                  {formatISTDate(invoice.promise.date)}
                  {invoice.promise.note ? ` · ${invoice.promise.note}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="Drafts not issued"
        figure={drafts.length > 0 ? formatPaise(draftTotal) : null}
        empty="No invoice is sitting in draft."
        count={drafts.length}
      >
        <ul className="flex flex-col gap-1">
          {drafts.map((invoice) => (
            <li key={String(invoice._id)} className="text-13">
              <Link
                href={`/invoices/${invoice._id}`}
                className="underline underline-offset-4"
              >
                {named(invoice.clientId)}
              </Link>{" "}
              ·{" "}
              <span className="num">
                {formatPaise(invoice.totalPaise ?? 0)}
              </span>{" "}
              <span className="text-ink-muted">
                drafted {formatISTDate(invoice.createdAt ?? invoice.date)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title={
          can(actor, "approve", "feeWriteOff")
            ? "Fee waivers for you to decide"
            : "Fee waivers waiting on a partner"
        }
        empty="No fee is waiting on a decision."
        count={waivers.length}
      >
        <ul className="flex flex-col gap-1">
          {waivers.map((engagement) => (
            <li key={String(engagement._id)} className="text-13">
              <Link
                href="/billing?tab=ready"
                className="underline underline-offset-4"
              >
                {named(engagement.clientId)}
              </Link>{" "}
              <span className="text-ink-muted">
                {engagement.templateSnapshot?.name ?? "Work"} ·{" "}
                {engagement.periodLabel || engagement.period} · asked by{" "}
                {engagement.waiver?.requestedByName || "Staff"}
                {engagement.waiver?.reason
                  ? ` · ${engagement.waiver.reason}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {tdsWaiting > 0 && (
        <p className="text-13 text-ink-muted">
          {tdsWaiting} {tdsWaiting === 1 ? "receipt" : "receipts"} of TDS still
          to find in Form 26AS ·{" "}
          <Link
            href="/billing?tab=tds"
            className="underline underline-offset-4"
          >
            open the list
          </Link>
        </p>
      )}
    </div>
  );
}

/** One section, which says what it holds even when it holds nothing. */
function Panel({ title, count, figure = null, empty, children }) {
  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
      <h2 className="font-display text-18">
        {title}
        {count > 0 && <span className="num text-ink-muted"> · {count}</span>}
        {figure && <span className="num"> · {figure}</span>}
      </h2>
      {count === 0 ? (
        <p className="text-13 text-ink-muted">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}
