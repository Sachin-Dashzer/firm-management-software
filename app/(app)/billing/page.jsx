import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import ClientGroup from "@/models/ClientGroup";
import { clientIdsInGroup } from "@/lib/groups/summary";
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
 */

const TABS = [
  ["ready", "Ready to bill"],
  ["invoices", "Invoices"],
  ["collections", "Collections"],
  ["tds", "TDS credit"],
];

const KEYS = TABS.map(([key]) => key);

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

  const query = (key) =>
    new URLSearchParams([
      ["tab", key],
      ...(group ? [["group", String(group._id)]] : []),
    ]).toString();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-24 font-bold tracking-tight">
          Billing
        </h1>
        {can(actor, "edit", "invoices") && (
          <Link
            href="/invoices/new"
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 leading-9 font-medium"
          >
            New invoice
          </Link>
        )}
      </div>

      {group && (
        <p className="text-14 flex flex-wrap items-center gap-2">
          <span>
            The <strong>{group.name}</strong> group only.
          </span>
          <Link
            href={`/billing?tab=${tab}`}
            className="text-13 text-ink-muted underline underline-offset-4"
          >
            Show the whole firm
          </Link>
        </p>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Billing">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/billing?${query(key)}`}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-control text-14 h-9 border px-3 leading-9 ${
              tab === key
                ? "border-carbon bg-carbon-wash text-carbon"
                : "border-rule hover:bg-carbon-wash"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

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
