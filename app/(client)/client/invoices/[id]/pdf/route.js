import { headers } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import { InvoicePdf } from "@/lib/billing/invoicePdf";
import { invoiceView } from "@/lib/billing/invoiceView";
import {
  belongsToClient,
  CLIENT_VISIBLE_INVOICE_STATUSES,
} from "@/lib/access/clientScope";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * A client downloading their own invoice (P2-9b).
 *
 * The same PDF the firm downloads, through the same `invoiceView()` — two
 * renderers would be two chances for the client's copy to disagree with
 * the firm's, and the client's copy is the one that ends up in somebody
 * else's accounts.
 *
 * The id in the URL is a guess until proved otherwise: it has to be their
 * invoice **and** one that was actually issued.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request, { params }) {
  const person = await requireClientUser();
  const { id } = await params;

  await connectDB();
  const invoice = await Invoice.findById(id).lean();

  if (
    !invoice ||
    !belongsToClient(person, invoice) ||
    !CLIENT_VISIBLE_INVOICE_STATUSES.includes(invoice.status)
  ) {
    return new Response("Not found", { status: 404 });
  }

  const pdf = await renderToBuffer(
    <InvoicePdf invoice={await invoiceView(invoice)} />,
  );

  await withAuditContext(
    contextFromRequest(
      { id: person.id, name: person.name, role: "client", kind: "client" },
      await headers(),
    ),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.documentDownload,
            entityType: "Invoice",
            entityId: invoice._id,
            clientId: invoice.clientId,
            note: `${invoice.number} downloaded by the client`,
          },
          session,
        ),
      );
    },
  );

  const name = (invoice.number ?? "invoice").replace(/\//g, "-");
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
