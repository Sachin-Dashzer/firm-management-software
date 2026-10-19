import { headers } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import Branch from "@/models/Branch";
import { formatPaise } from "@/lib/money";
import { formatISTDate } from "@/lib/dates";
import { amountInWords } from "@/lib/billing/gst";
import { InvoicePdf } from "@/lib/billing/invoicePdf";
import { firmProfile } from "@/lib/firm/settings";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * The invoice as a PDF (spec section 7).
 *
 * Every figure is read from the stored invoice, never recomputed: the
 * document that goes to a client in 2029 must match the one issued in
 * 2026, whatever the code does in between.
 *
 * Downloading it is audited like any other document, because an invoice
 * leaving the building is worth a line in the log.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request, { params }) {
  const actor = await requireUser();
  const { id } = await params;

  await connectDB();
  const invoice = await Invoice.findById(id).lean();
  if (!invoice) return new Response("Not found", { status: 404 });

  if (!can(actor, "view", "invoices", { branchId: String(invoice.branchId) })) {
    return new Response("Not allowed", { status: 403 });
  }

  const branch = await Branch.findById(invoice.branchId).lean();

  const interState = Boolean(invoice.igstPaise);
  const view = {
    number: invoice.number,
    type: invoice.type,
    date: formatISTDate(invoice.date),
    dueDate: invoice.dueDate ? formatISTDate(invoice.dueDate) : null,
    supplierGstin: invoice.supplierGstin || branch?.gstin || "",
    branchAddress: branch?.address ?? "",
    billingName: invoice.billingName,
    billingAddress: invoice.billingAddress,
    billingGstin: invoice.billingGstin,
    placeOfSupply: invoice.placeOfSupply,
    placeOfSupplyName: invoice.placeOfSupplyName,
    interState,
    lines: (invoice.lines ?? []).map((line) => ({
      description: line.description,
      sac: line.sac,
      gstRate: line.gstRate,
      amount: formatPaise(line.netPaise || line.amountPaise || 0),
    })),
    reimbursements: (invoice.reimbursements ?? []).map((item) => ({
      description: item.description,
      amount: formatPaise(item.amountPaise ?? 0),
    })),
    subtotal: formatPaise(invoice.subtotalPaise ?? 0),
    cgst: formatPaise(invoice.cgstPaise ?? 0),
    sgst: formatPaise(invoice.sgstPaise ?? 0),
    igst: formatPaise(invoice.igstPaise ?? 0),
    reimbursementTotal: formatPaise(invoice.reimbursementTotalPaise ?? 0),
    total: formatPaise(invoice.totalPaise ?? 0),
    totalInWords: amountInWords(invoice.totalPaise ?? 0),
    tdsExpected: formatPaise(invoice.tdsExpectedPaise ?? 0),
    expectedReceipt: formatPaise(
      (invoice.totalPaise ?? 0) - (invoice.tdsExpectedPaise ?? 0),
    ),
    zero: formatPaise(0),
    notes: invoice.notes ?? "",
    bankDetails: process.env.FIRM_BANK_DETAILS ?? "",
    // the firm as it is now, not as it was hardcoded (P2-6)
    firm: await firmProfile(),
  };

  const pdf = await renderToBuffer(<InvoicePdf invoice={view} />);

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.documentDownload,
            entityType: "Invoice",
            entityId: invoice._id,
            clientId: invoice.clientId,
            note: `${invoice.number ?? "draft"} downloaded as PDF`,
          },
          session,
        ),
      );
    },
  );

  const name = (invoice.number ?? "draft-invoice").replace(/\//g, "-");
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
