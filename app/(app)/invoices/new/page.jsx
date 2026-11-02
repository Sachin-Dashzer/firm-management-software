import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import { blocksInvoice, scopeOf } from "@/lib/engagements/scope";
import { formatISTDate } from "@/lib/dates";
import PageHead from "@/components/ui/PageHead";
import NewInvoice from "./NewInvoice";

export const metadata = { title: "New invoice · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Start an invoice from work that has not been billed (spec section 7).
 *
 * The unbilled list is the point: it is how the firm stops finishing work
 * and forgetting to charge for it.
 *
 * Which is why, since 02-11-2026, **the clients waiting to be billed are
 * the screen** rather than something you find after choosing from a
 * dropdown of two thousand names. The whole unbilled list is loaded once,
 * in one query, and grouped by client: the picker can then say who is
 * waiting and for how much, put those clients first, and the rows for the
 * one that is chosen come out of the same list with no second trip.
 */
export default async function NewInvoicePage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "edit", "invoices")) redirect("/invoices");

  const params = await searchParams;
  const clientId = params?.client ?? "";

  await connectDB();
  const scope = branchFilter(actor, "invoices") ?? {};

  const [clients, unbilled] = await Promise.all([
    Client.find({ status: { $ne: "Closed" }, ...scope })
      .select("legalName tradeName code creditDays")
      .sort({ legalName: 1 })
      .limit(2000)
      .lean(),
    Engagement.find({
      ...scope,
      billingStatus: "Unbilled",
      status: { $in: ["Filed / delivered", "Completed"] },
    })
      .select(
        "clientId code templateSnapshot.name periodLabel period feePaise scope scopeReason waiver completedAt",
      )
      .sort({ completedAt: 1 })
      .limit(2000)
      .lean(),
  ]);

  /** Per client: how many jobs are waiting, and what they come to. */
  const waiting = new Map();
  for (const engagement of unbilled) {
    const key = String(engagement.clientId);
    const row = waiting.get(key) ?? { count: 0, paise: 0, blocked: 0 };
    row.count += 1;
    if (blocksInvoice(engagement)) row.blocked += 1;
    else if (scopeOf(engagement) === "billable") {
      row.paise += engagement.feePaise ?? 0;
    }
    waiting.set(key, row);
  }

  const chosen = clientId
    ? clients.find((c) => String(c._id) === String(clientId))
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 p-4 md:p-6">
      <nav className="text-13 text-ink-muted">
        <Link
          href="/billing?tab=invoices"
          className="underline-offset-4 hover:underline"
        >
          Billing
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">New invoice</span>
      </nav>

      <PageHead
        title="New invoice"
        sub={
          unbilled.length === 0
            ? "Nothing in the firm is finished and waiting to be billed. You can still start an empty invoice."
            : `${unbilled.length} ${unbilled.length === 1 ? "job is" : "jobs are"} finished and not billed, across ${waiting.size} ${waiting.size === 1 ? "client" : "clients"}. Pick a client, tick the work, and you get a draft nothing is issued from yet.`
        }
      />

      <NewInvoice
        clients={clients.map((c) => ({
          id: String(c._id),
          name: c.tradeName || c.legalName,
          code: c.code ?? "",
          creditDays: Number(c.creditDays ?? 0),
          waiting: waiting.get(String(c._id)) ?? null,
        }))}
        /* a link can name a client this person may not bill — a closed one,
           or one outside their branches. The picker says so rather than
           quietly ignoring the link. */
        missed={Boolean(clientId) && !chosen}
        chosen={
          chosen
            ? {
                id: String(chosen._id),
                name: chosen.tradeName || chosen.legalName,
                code: chosen.code ?? "",
                creditDays: Number(chosen.creditDays ?? 0),
              }
            : null
        }
        rows={unbilled
          .filter((e) => String(e.clientId) === String(clientId))
          .map((e) => ({
            id: String(e._id),
            code: e.code,
            work: e.templateSnapshot?.name ?? "Work",
            period: e.periodLabel || e.period,
            finished: e.completedAt ? formatISTDate(e.completedAt) : "",
            feePaise: e.feePaise ?? 0,
            // waived, in a retainer or unpriced: shown with the reason
            // rather than hidden, so nobody wonders where the job went (P3-4)
            blocked: blocksInvoice(e),
          }))}
      />
    </div>
  );
}
