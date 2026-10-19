import { headers } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { REPORTS, runReport, describeFilters } from "@/lib/reports/standard";
import { displayRows, displayTotals } from "@/lib/reports/format";
import { ReportPdf } from "@/lib/reports/reportPdf";
import { firmProfile } from "@/lib/firm/settings";
import { formatISTDateTime } from "@/lib/dates";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * A report as a printable page (spec section 10).
 *
 * Only the reports people actually print are offered as PDF — the status
 * and overdue lists a partner takes into a Monday meeting, and the
 * pending-documents list that gets read out to a client. The rest are
 * worked on in a spreadsheet, where a PDF would only be a worse copy.
 *
 * The rows are formatted by the same helper the screen uses, so the
 * printed sheet cannot quietly disagree with it.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request, { params }) {
  const actor = await requireUser();
  const { report: key } = await params;

  const definition = REPORTS[key];
  if (!definition) return new Response("No such report", { status: 404 });
  if (!definition.pdf) {
    return new Response("That report is spreadsheet only", { status: 404 });
  }
  if (!can(actor, "view", definition.area)) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const report = await runReport(key, actor, query);

  const buffer = await renderToBuffer(
    <ReportPdf
      title={report.title}
      columns={report.columns}
      rows={displayRows(report)}
      note={describeFilters(query)}
      totals={displayTotals(report.totals)}
      by={actor.name}
      at={formatISTDateTime(new Date())}
      firm={await firmProfile()}
    />,
  );

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: "Report",
            entityId: "pdf",
            note: `${report.title} as PDF: ${report.rows.length} rows, filters: ${url.search || "none"}`,
          },
          session,
        ),
      );
    },
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="phmg-${key}-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
