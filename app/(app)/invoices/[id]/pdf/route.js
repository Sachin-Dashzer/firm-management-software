import { headers } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import { InvoicePdf } from "@/lib/billing/invoicePdf";
import { invoiceView } from "@/lib/billing/invoiceView";
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

  const view = await invoiceView(invoice);

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
