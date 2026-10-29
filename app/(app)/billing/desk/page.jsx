import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter, whyNot } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import { formatPaise } from "@/lib/money";
import { formatISTDate, istInputDate, startOfISTDay } from "@/lib/dates";
import { outstandingOf, suggestForReceipts } from "@/lib/billing/allocation";
import { promiseBroken } from "@/lib/billing/promise";
import { advances } from "@/lib/reports/figures";
import { pendingWaiver } from "@/lib/engagements/scope";
import TdsToMatch from "../TdsToMatch";
import { CreditRows, DraftRows, PromiseRows, WaiverRows } from "./DeskRows";

export const metadata = { title: "Accounts desk · PHMG" };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * The billing desk's own day (P3-22b, and P3-31 which made it act).
 *
 * Billing has four tabs of records; this is the one screen that says what
 * is waiting to be *done* today, which is a different question. The order
 * is the order the work runs in: money that has arrived and has not been
 * put anywhere, dates clients gave that have come round, bills written and
 * not sent, fees somebody is waiting on a partner for, and TDS to find in
 * 26AS.
 *
 * **It performs those decisions now** (P3-31, reversing D74). What D74 got
 * right is kept: nothing is reimplemented here. Every button calls the
 * same server action the record's own screen calls, so the permission
 * check, the refusal, the audit entry and the arithmetic live in one place
 * and cannot drift between two screens. What changed is only where the
 * click happens — and for an accounts person working a list of eleven
 * things, that is the whole difference between a screen and a report.
 *
 * Two things the prototype's desk does that this still does not, with the
 * reason said on the screen: billing a finished job and setting its fee
 * stay on `/billing?tab=ready`, where the fee, the scope and the waiver
 * are decided together; and there is no "remind now", because reminders
 * are planned by rule and deduplicated by a unique index, so a manual send
 * would be a second, unrecorded cadence.
 */
export default async function AccountsDeskPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "invoices")) redirect("/issues");

  const now = new Date();
  await connectDB();

  const scope = branchFilter(actor, "invoices") ?? {};
  const endOfToday = new Date(startOfISTDay(now).getTime() + DAY);

  const mayBill = whyNot(actor, "edit", "invoices");
  const mayDecide = whyNot(actor, "approve", "feeWriteOff");
  const isPartner = can(actor, "approve", "feeWriteOff");

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

  /**
   * The open invoices of every client with money sitting unapplied, so the
   * suggestion can be worked out here rather than on a click.
   *
   * It is the firm's own `suggestAllocation` — oldest invoice first, TDS
   * against the invoice it was withheld from — and the button applies
   * exactly what this produces. Computing it on the server also means the
   * person sees where the money will go *before* pressing anything.
   */
  const creditClients = credit.map((row) => row.clientId);
  const openForCredit = creditClients.length
    ? await Invoice.find({
        clientId: { $in: creditClients },
        status: { $in: ["Sent", "Partially paid", "Disputed"] },
        type: { $ne: "Credit note" },
      })
        .sort({ date: 1 })
        .limit(1000)
        .lean()
    : [];

  const openByClient = new Map();
  for (const invoice of openForCredit) {
    const key = String(invoice.clientId);
    const list = openByClient.get(key) ?? [];
    list.push({
      id: String(invoice._id),
      number: invoice.number ?? "draft",
      totalPaise: invoice.totalPaise ?? 0,
      paidPaise: invoice.paidPaise ?? 0,
      tdsCreditedPaise: invoice.tdsCreditedPaise ?? 0,
      outstandingPaise: outstandingOf(invoice),
    });
    openByClient.set(key, list);
  }

  const names = await Client.find({
    _id: {
      $in: [
        ...creditClients,
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

  /**
   * Each unapplied receipt with where it would go.
   *
   * The allocations sent back to `reallocatePayment` include what the
   * receipt is **already** on: that action replaces every allocation on
   * the payment, so leaving the old ones out would quietly take credit off
   * the invoices they are sitting on.
   */
  const creditRows = credit.map((row) => {
    const open = openByClient.get(String(row.clientId)) ?? [];
    const numberOf = new Map(
      open.map((invoice) => [invoice.id, invoice.number]),
    );

    return {
      clientId: String(row.clientId),
      client: named(row.clientId),
      total: formatPaise(row.paise),
      oldest: formatISTDate(
        row.payments[row.payments.length - 1]?.date ?? new Date(),
      ),
      payments: suggestForReceipts(row.payments, open).map((receipt) => ({
        id: receipt.id,
        date: formatISTDate(receipt.date),
        left: formatPaise(receipt.paise),
        reference: receipt.reference,
        suggestion: receipt.suggested.map((line) => ({
          number: numberOf.get(line.invoiceId) ?? "invoice",
          amount: formatPaise(line.amountPaise + line.tdsPaise),
        })),
        leftOverAfter: receipt.unallocatedPaise
          ? formatPaise(receipt.unallocatedPaise)
          : "",
        allocations: receipt.allocations,
      })),
    };
  });

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
        <p className="text-13 text-ink-muted max-w-[74ch]">
          What is waiting to be done today, in the order it runs — and the doing
          of it. Every button here is the same action the record&rsquo;s own
          screen performs, so nothing can be allowed from one place and refused
          from the other.
        </p>
      </div>

      <Panel
        title="Money to apply"
        figure={credit.length > 0 ? formatPaise(creditTotal) : null}
        empty="Every receipt is against an invoice."
        count={credit.length}
      >
        <CreditRows rows={creditRows} why={mayBill} />
      </Panel>

      <Panel
        title="Promises that have come round"
        empty="No promise is due today."
        count={promised.length}
      >
        <PromiseRows
          why={mayBill}
          rows={promised.map((invoice) => ({
            id: String(invoice._id),
            number: invoice.number ?? "draft",
            client: named(invoice.clientId),
            outstanding: formatPaise(outstandingOf(invoice)),
            late: promiseBroken(invoice, now),
            date: formatISTDate(invoice.promise.date),
            dateInput: istInputDate(invoice.promise.date),
            note: invoice.promise.note ?? "",
          }))}
        />
      </Panel>

      <Panel
        title="Drafts not issued"
        figure={drafts.length > 0 ? formatPaise(draftTotal) : null}
        empty="No invoice is sitting in draft."
        count={drafts.length}
      >
        <DraftRows
          why={mayBill}
          rows={drafts.map((invoice) => ({
            id: String(invoice._id),
            client: named(invoice.clientId),
            total: formatPaise(invoice.totalPaise ?? 0),
            drafted: formatISTDate(invoice.createdAt ?? invoice.date),
          }))}
        />
      </Panel>

      <Panel
        title={
          isPartner
            ? "Fee waivers for you to decide"
            : "Fee waivers waiting on a partner"
        }
        empty="No fee is waiting on a decision."
        count={waivers.length}
      >
        <WaiverRows
          why={mayDecide}
          isPartner={isPartner}
          rows={waivers.map((engagement) => ({
            id: String(engagement._id),
            client: named(engagement.clientId),
            fee: engagement.feePaise ? formatPaise(engagement.feePaise) : "",
            what: `${engagement.templateSnapshot?.name ?? "Work"} · ${
              engagement.periodLabel || engagement.period
            }`,
            by: engagement.waiver?.requestedByName || "Staff",
            reason: engagement.waiver?.reason ?? "",
          }))}
        />
      </Panel>

      <Panel
        title="TDS to find in Form 26AS"
        empty="Every receipt of TDS has been matched."
        count={tdsWaiting}
        action={
          tdsWaiting > 10 ? (
            <Link
              href="/billing?tab=tds"
              className="text-13 underline underline-offset-4"
            >
              all {tdsWaiting}
            </Link>
          ) : null
        }
      >
        {/* the tab's own component and the tab's own tick, oldest ten */}
        <TdsToMatch
          actor={actor}
          scope={scope}
          showMatched={false}
          limit={10}
          intro={false}
        />
      </Panel>

      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
        <h2 className="font-display text-15 font-semibold">
          Two things this desk still does not do
        </h2>
        <p className="text-13 text-ink-muted max-w-[76ch]">
          <strong>Billing a finished job and setting its fee</strong> stay on{" "}
          <Link
            href="/billing?tab=ready"
            className="underline underline-offset-4"
          >
            Ready to bill
          </Link>
          . The fee, whether the work is chargeable at all, and any waiver on it
          are one decision taken together, and splitting that across two screens
          is how a job gets billed at a fee nobody agreed.
        </p>
        <p className="text-13 text-ink-muted max-w-[76ch]">
          <strong>There is no &ldquo;remind now&rdquo;.</strong> Reminders are
          planned by rule and deduplicated by a unique index, so pressing a
          button would either be refused as a duplicate or become a second,
          unrecorded cadence running beside the firm&rsquo;s own. Recording a
          promise above is the control that exists:{" "}
          <Link
            href="/settings/messages"
            className="underline underline-offset-4"
          >
            the reminder rules
          </Link>{" "}
          are where the cadence is changed.
        </p>
      </section>
    </div>
  );
}

/** One section, which says what it holds even when it holds nothing. */
function Panel({
  title,
  count,
  figure = null,
  empty,
  action = null,
  children,
}) {
  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-18">
          {title}
          {count > 0 && <span className="num text-ink-muted"> · {count}</span>}
          {figure && <span className="num"> · {figure}</span>}
        </h2>
        {action}
      </div>
      {count === 0 ? (
        <p className="text-13 text-ink-muted">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}
