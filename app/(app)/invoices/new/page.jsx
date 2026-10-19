import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import NewInvoice from "./NewInvoice";

export const metadata = { title: "New invoice · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Start an invoice from work that has not been billed (spec section 7).
 *
 * The unbilled list is the point: it is how the firm stops finishing work
 * and forgetting to charge for it.
 */
export default async function NewInvoicePage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "edit", "invoices")) redirect("/invoices");

  const params = await searchParams;
  const clientId = params?.client ?? "";

  await connectDB();
  const scope = branchFilter(actor, "invoices") ?? {};

  const clients = await Client.find({ status: { $ne: "Closed" }, ...scope })
    .select("legalName tradeName code")
    .sort({ legalName: 1 })
    .limit(2000)
    .lean();

  const unbilled = clientId
    ? await Engagement.find({
        clientId,
        billingStatus: "Unbilled",
        status: { $in: ["Filed / delivered", "Completed"] },
      })
        .select("code templateSnapshot periodLabel period feePaise")
        .limit(100)
        .lean()
    : [];

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          href="/invoices"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Billing
        </Link>
        <h1 className="font-display text-28 font-semibold">New invoice</h1>
      </div>

      <NewInvoice
        clients={clients.map((c) => ({
          id: String(c._id),
          name: `${c.tradeName || c.legalName} (${c.code})`,
        }))}
        selectedClient={clientId}
        unbilled={unbilled.map((e) => ({
          id: String(e._id),
          code: e.code,
          label: `${e.templateSnapshot?.name ?? "Work"} — ${e.periodLabel || e.period}`,
          fee: (e.feePaise ?? 0) / 100,
        }))}
      />
    </div>
  );
}
