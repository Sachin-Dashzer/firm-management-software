import { headers } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/auth";
import { TemplatePdf } from "@/lib/docs/templatePdf";
import { prepareRender, auditDocDownload } from "@/lib/docs/render";

/**
 * A generated document as a PDF (P2-8b, owner decision D9).
 *
 * The loading, the permission check and the words all come from
 * `prepareRender()`, which the Word route uses too — so the two formats
 * cannot answer the permission question differently or print different
 * text.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request, { params }) {
  const actor = await requireUser();
  const { id } = await params;

  const prepared = await prepareRender(actor, id);
  if ("error" in prepared) {
    return new Response(prepared.error, { status: prepared.status });
  }

  const buffer = await renderToBuffer(
    <TemplatePdf
      doc={{
        title: prepared.title,
        body: prepared.body,
        state: prepared.doc.state,
        firm: prepared.firm,
        gaps: prepared.gaps,
        reference: prepared.reference,
      }}
    />,
  );

  await auditDocDownload(actor, prepared.doc, await headers(), "PDF");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${prepared.filename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
