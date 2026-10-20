import { headers } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import GeneratedDoc from "@/models/GeneratedDoc";
import DocTemplate from "@/models/DocTemplate";
import { TemplatePdf } from "@/lib/docs/templatePdf";
import { buildDocument, loadEngagementForDoc } from "@/lib/docs/build";
import { firmProfile } from "@/lib/firm/settings";
import { formatISTDate } from "@/lib/dates";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * A generated document as a PDF (P2-8b, owner decision D9).
 *
 * A final prints the words stored when it was issued — never re-resolved,
 * so a letter signed last year does not quietly change because an address
 * was corrected since. A draft is resolved live and watermarked.
 *
 * Downloads are audited like every other document (spec section 11).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request, { params }) {
  const actor = await requireUser();
  const { id } = await params;

  await connectDB();
  const doc = await GeneratedDoc.findById(id).lean();
  if (!doc) return new Response("No such document", { status: 404 });

  const engagement = doc.engagementId
    ? await loadEngagementForDoc(String(doc.engagementId))
    : null;

  if (
    !can(actor, "view", "docGenerate", {
      branchId: String(doc.branchId),
      assigneeId: String(engagement?.assigneeId ?? ""),
      reviewerId: String(engagement?.reviewerId ?? ""),
    })
  ) {
    return new Response("Not allowed", { status: 403 });
  }

  let body = doc.bodyText;
  let title = doc.title;
  let gaps = [];

  if (doc.state !== "final") {
    const template = await DocTemplate.findById(doc.templateId).lean();
    if (!template) return new Response("No such template", { status: 404 });
    const built = await buildDocument({ template, engagement, actor });
    body = built.text;
    title = built.title;
    gaps = built.gaps;
  }

  const firm = await firmProfile();
  const buffer = await renderToBuffer(
    <TemplatePdf
      doc={{
        title,
        body,
        state: doc.state,
        firm,
        gaps,
        reference: [
          doc.templateCode,
          doc.state === "final" && doc.issuedAt
            ? `issued ${formatISTDate(doc.issuedAt)}`
            : "",
          doc.udin ? `UDIN ${doc.udin}` : "",
        ]
          .filter(Boolean)
          .join("  ·  "),
      }}
    />,
  );

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.documentDownload,
            entityType: "GeneratedDoc",
            entityId: String(doc._id),
            note: `${doc.templateName} (${doc.state})`,
          },
          session,
        ),
      );
    },
  );

  const name = `${doc.templateCode || "document"}-${doc.state}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="phmg-${name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
