import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import AuditLog from "@/models/AuditLog";
import ActivityFeed from "@/components/audit/ActivityFeed";
import { formatPaise } from "@/lib/money";
import { formatISTDate } from "@/lib/dates";
import { GST_STATES } from "@/lib/validators";
import { reasonsNotIssuable, amountInWords } from "@/lib/billing/gst";
import InvoiceEditor from "./InvoiceEditor";

export const dynamic = "force-dynamic";

/** An invoice number names a branch, a financial year and a sequence. Checked. */
export async function generateMetadata({ params }) {
  const generic = { title: "Invoice · PHMG" };
  const actor = await currentUser();
  if (!actor) return generic;

  const { id } = await params;
  await connectDB();
  const invoice = await Invoice.findById(id).select("number branchId").lean();
  if (!invoice) return generic;
  if (!can(actor, "view", "invoices", { branchId: String(invoice.branchId) })) {
    return generic;
  }

  return { title: `${invoice.number ?? "Draft invoice"} · PHMG` };
}

export default async function InvoicePage({ params }) {
  const actor = await requireUser();
  const { id } = await params;

  await connectDB();
  const invoice = await Invoice.findById(id).lean();
  if (!invoice) notFound();

  if (!can(actor, "view", "invoices", { branchId: String(invoice.branchId) })) {
    redirect("/invoices");
  }

  const [client, branch, audit, creditNotes] = await Promise.all([
    Client.findById(invoice.clientId)
      .select("legalName tradeName code creditDays")
      .lean(),
    Branch.findById(invoice.branchId).lean(),
    AuditLog.find({ entityType: "Invoice", entityId: invoice._id })
      .sort({ ts: -1 })
      .limit(50)
      .lean(),
    Invoice.find({ creditNoteFor: invoice._id }).select("number date").lean(),
  ]);

  const outstanding = Math.max(
    0,
    (invoice.totalPaise ?? 0) -
      (invoice.paidPaise ?? 0) -
      (invoice.tdsCreditedPaise ?? 0),
  );

  const view = {
    id: String(invoice._id),
    number: invoice.number,
    type: invoice.type,
    status: invoice.status,
    isDraft: invoice.status === "Draft",
    date: formatISTDate(invoice.date),
    dueDate: invoice.dueDate ? formatISTDate(invoice.dueDate) : null,
    dueDateInput: invoice.dueDate
      ? new Date(invoice.dueDate).toISOString().slice(0, 10)
      : "",
    client: client?.tradeName || client?.legalName || "Client",
    clientId: String(invoice.clientId),
    billingGstin: invoice.billingGstin,
    supplierGstin: invoice.supplierGstin || branch?.gstin || "",
    placeOfSupply: invoice.placeOfSupply,
    placeOfSupplyName: invoice.placeOfSupplyName,
    branchCode: branch?.code ?? "",
    interState:
      Boolean(invoice.igstPaise) ||
      (invoice.placeOfSupply &&
        branch?.gstin &&
        invoice.placeOfSupply !== String(branch.gstin).slice(0, 2)),
    lines: (invoice.lines ?? []).map((line) => ({
      id: String(line._id),
      engagementId: line.engagementId ? String(line.engagementId) : null,
      description: line.description,
      sac: line.sac,
      amount: String((line.amountPaise ?? 0) / 100),
      amountText: formatPaise(line.amountPaise ?? 0),
      gstRate: line.gstRate,
      taxText: formatPaise(
        (line.cgstPaise ?? 0) + (line.sgstPaise ?? 0) + (line.igstPaise ?? 0),
      ),
      totalText: formatPaise(line.totalPaise ?? 0),
    })),
    reimbursements: (invoice.reimbursements ?? []).map((item) => ({
      id: String(item._id),
      description: item.description,
      amount: String((item.amountPaise ?? 0) / 100),
      amountText: formatPaise(item.amountPaise ?? 0),
    })),
    discountPercent: invoice.discountPercent ?? 0,
    subtotal: formatPaise(invoice.subtotalPaise ?? 0),
    cgst: formatPaise(invoice.cgstPaise ?? 0),
    sgst: formatPaise(invoice.sgstPaise ?? 0),
    igst: formatPaise(invoice.igstPaise ?? 0),
    reimbursementTotal: formatPaise(invoice.reimbursementTotalPaise ?? 0),
    hasReimbursements: (invoice.reimbursements ?? []).length > 0,
    total: formatPaise(invoice.totalPaise ?? 0),
    totalInWords: amountInWords(invoice.totalPaise ?? 0),
    tdsExpected: formatPaise(invoice.tdsExpectedPaise ?? 0),
    expectedReceipt: formatPaise(
      (invoice.totalPaise ?? 0) - (invoice.tdsExpectedPaise ?? 0),
    ),
    paid: formatPaise(invoice.paidPaise ?? 0),
    outstanding: formatPaise(outstanding),
    notes: invoice.notes ?? "",
    creditNoteFor: invoice.creditNoteFor ? String(invoice.creditNoteFor) : null,
    cancelled: Boolean(invoice.cancelledBy),
    creditNotes: creditNotes.map((n) => ({
      id: String(n._id),
      number: n.number,
      date: formatISTDate(n.date),
    })),
  };

  const blockers =
    invoice.status === "Draft" ? reasonsNotIssuable(invoice, branch) : [];

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          href="/invoices"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Billing
        </Link>
        <h1 className="font-display text-28 font-semibold">
          {view.number ?? "Draft invoice"}
        </h1>
        <p className="text-13 text-ink-muted">
          <Link
            href={`/clients/${view.clientId}`}
            className="underline underline-offset-4"
          >
            {view.client}
          </Link>{" "}
          · {view.date}
          {view.branchCode && ` · ${view.branchCode}`}
        </p>
      </div>

      <InvoiceEditor
        invoice={view}
        blockers={blockers}
        mayEdit={can(actor, "edit", "invoices", {
          branchId: String(invoice.branchId),
        })}
        mayWriteOff={can(actor, "approve", "feeWriteOff")}
        states={Object.entries(GST_STATES).map(([code, name]) => [code, name])}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20">Activity</h2>
        <div className="rounded-ledger border-rule bg-surface border px-4">
          <ActivityFeed
            entries={audit.map((e) => ({ ...e, _id: String(e._id) }))}
            emptyMessage="Nothing has happened to this invoice yet."
          />
        </div>
      </section>
    </div>
  );
}
