import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { renderDocx, DOCX_TYPE } from "@/lib/docs/templateDocx";
import { prepareRender, auditDocDownload } from "@/lib/docs/render";

/**
 * A generated document as a Word file (P2-8c).
 *
 * The reason this exists and the PDF does not cover it: a letter is often
 * edited before it is sent — a paragraph for this client, a figure typed
 * into a certificate's blank. The same words as the PDF, from the same
 * `prepareRender()`, so the two can never disagree.
 *
 * Downloading an **issued** document as Word hands somebody an editable
 * copy of a signed letter. That is what the firm asked for, and it is why
 * the file says what it is: a final carries its issue date and UDIN in the
 * footer, and anything edited afterwards is a new document, not this one.
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

  const buffer = await renderDocx({
    title: prepared.title,
    body: prepared.body,
    state: prepared.doc.state,
    firm: prepared.firm,
    gaps: prepared.gaps,
    reference: prepared.reference,
  });

  await auditDocDownload(actor, prepared.doc, await headers(), "Word");

  return new Response(buffer, {
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": `attachment; filename="${prepared.filename}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
