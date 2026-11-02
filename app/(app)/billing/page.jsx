import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import ClientGroup from "@/models/ClientGroup";
import Invoice from "@/models/Invoice";
import Engagement from "@/models/Engagement";
import Payment from "@/models/Payment";
import { clientIdsInGroup } from "@/lib/groups/summary";
import { outstandingSummary } from "@/lib/billing/allocation";
import { scopeOf } from "@/lib/engagements/scope";
import { startOfISTDay } from "@/lib/dates";
import PageHead from "@/components/ui/PageHead";
import StatTile from "@/components/ui/StatTile";
import Segmented from "@/components/ui/Segmented";
import Notice from "@/components/ui/Notice";
import InvoiceList from "./InvoiceList";
import ReadyToBill from "./ReadyToBill";
import Collections from "./Collections";
import TdsToMatch from "./TdsToMatch";

export const metadata = { title: "Billing · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Billing, in the four tabs the prototype's menu names (P3-22b).
 *
 * Each tab is a screen the firm already had — the invoice list from
 * `/invoices`, and the two halves of `/invoices/receivables` — moved here
 * rather than copied, with the old addresses left as redirects. One screen
 * per job: two copies of the ageing report would be two things to fix when
 * the ageing is wrong.
 *
 * The money a client owes and the work it has not been billed for are the
 * same question from two ends, which is why they sit under one heading.
 *
 * **The four figures are above the tabs, not inside them** (02-11-2026).
 * Until now the page opened on a list of invoices and said nothing: what
 * the firm is owed, how much of that is late, what is finished and
 * unbilled and what TDS is still missing were four tabs away from each
 * other, so nobody saw them together and the one that mattered that
 * morning was whichever tab you happened to open. They are one band now,
 * each figure a link to the tab it came from, and the tab it belongs to is
 * marked while you are on it.
 */

const TABS = [
  ["ready", "Ready to bill"],
  ["invoices", "Invoices"],
  ["collections", "Collections"],
  ["tds", "TDS credit"],
];

const KEYS = TABS.map(([key]) => key);

/** Invoices that are issued and not settled: what "owed" means here. */
const OPEN_STATUSES = ["Sent", "Partially paid", "Disputed"];

export default async function BillingPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "invoices")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const tab = KEYS.includes(params.tab) ? params.tab : "invoices";

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

  const now = new Date();

  /**
   * The band's four figures, each asking the same question its tab asks —
   * the rule `lib/nav/counts.js` is built on, for the same reason: a
   * headline that disagrees with the list under it is worse than no
   * headline.
   */
  const [open, finished, tds] = await Promise.all([
    Invoice.find({
      ...scope,
      status: { $in: OPEN_STATUSES },
      type: { $ne: "Credit note" },
    })
      .select("totalPaise paidPaise tdsCreditedPaise dueDate")
      .limit(5000)
      .lean(),
    Engagement.find({
      ...scope,
      billingStatus: "Unbilled",
      status: { $in: ["Filed / delivered", "Completed"] },
    })
      .select("feePaise scope")
      .limit(2000)
      .lean(),
    Payment.find({ ...scope, tdsPaise: { $gt: 0 }, tdsSeenIn26AS: false })
      .select("tdsPaise")
      .limit(2000)
      .lean(),
  ]);

  const owed = outstandingSummary(open, startOfISTDay(now));
  const overdueCount = open.filter(
    (invoice) =>
      invoice.dueDate && new Date(invoice.dueDate) < startOfISTDay(now),
  ).length;

  /**
   * Retainer and waived work is finished and unbilled and is **not** money
   * the firm is owed (P3-4), so the figure counts only chargeable work. The
   * rows stay on the tab with their reason; the tile says how many.
   */
  const chargeable = finished.filter((row) => scopeOf(row) === "billable");
  const readyPaise = chargeable.reduce(
    (sum, row) => sum + (row.feePaise ?? 0),
    0,
  );
  const tdsPaise = tds.reduce((sum, row) => sum + (row.tdsPaise ?? 0), 0);

  const query = (key) =>
    new URLSearchParams([
      ["tab", key],
      ...(group ? [["group", String(group._id)]] : []),
    ]).toString();

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <PageHead
        title="Billing"
        sub="What the firm is owed, what is finished and still to bill, and the TDS credit yet to appear in 26AS."
      >
        {/* anybody who may read the money may take it away in a spreadsheet;
            only somebody who may bill can raise one */}
        <a
          href="/invoices/export"
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          Export to Excel
        </a>
        {can(actor, "edit", "invoices") && (
          <Link
            href="/invoices/new"
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 leading-9 font-medium"
          >
            New invoice
          </Link>
        )}
      </PageHead>

      {group && (
        <Notice tone="info" title={`The ${group.name} group only`}>
          <p>
            Every figure and every row below is this group&rsquo;s.{" "}
            <Link
              href={`/billing?tab=${tab}`}
              className="underline underline-offset-4"
            >
              Show the whole firm
            </Link>
            .
          </p>
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={owed.totalPaise}
          paise
          href={`/billing?${query("collections")}`}
          tone="info"
          selected={tab === "collections"}
          note={`${open.length} ${open.length === 1 ? "invoice" : "invoices"} issued and not settled`}
        />
        <StatTile
          label="Overdue"
          value={owed.overduePaise}
          paise
          href={`/billing?${query("collections")}`}
          tone="late"
          note={
            overdueCount === 0
              ? "Nothing is past its date"
              : `${overdueCount} ${overdueCount === 1 ? "invoice" : "invoices"} past the date`
          }
        />
        <StatTile
          label="Ready to bill"
          value={readyPaise}
          paise
          href={`/billing?${query("ready")}`}
          tone="soon"
          selected={tab === "ready"}
          note={
            chargeable.length === 0
              ? "Everything finished has been billed"
              : `${chargeable.length} ${chargeable.length === 1 ? "job" : "jobs"} finished, before tax`
          }
        />
        <StatTile
          label="TDS to match"
          value={tdsPaise}
          paise
          href={`/billing?${query("tds")}`}
          tone="soon"
          selected={tab === "tds"}
          note={
            tds.length === 0
              ? "Every deduction is accounted for"
              : `${tds.length} ${tds.length === 1 ? "receipt" : "receipts"} not yet in 26AS`
          }
        />
      </div>

      <Segmented
        label="Billing"
        value={tab}
        items={TABS.map(([key, label]) => ({
          key,
          label,
          href: `/billing?${query(key)}`,
          /* only the tabs with something waiting carry a number: a badge
             on every tab is a badge nobody reads (see CountBadge) */
          badge:
            key === "ready" && finished.length > 0
              ? { value: finished.length }
              : key === "collections" && overdueCount > 0
                ? { value: overdueCount, tone: "late" }
                : key === "tds" && tds.length > 0
                  ? { value: tds.length, tone: "soon" }
                  : undefined,
        }))}
      />

      {tab === "ready" && <ReadyToBill actor={actor} scope={scope} />}
      {tab === "invoices" && (
        <InvoiceList actor={actor} params={params} scope={scope} />
      )}
      {tab === "collections" && <Collections actor={actor} scope={scope} />}
      {tab === "tds" && (
        <TdsToMatch
          actor={actor}
          scope={scope}
          showMatched={params.matched === "yes"}
        />
      )}
    </div>
  );
}
