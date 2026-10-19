import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { REPORTS, runReport, describeFilters } from "@/lib/reports/standard";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * A report as a real spreadsheet (spec section 10).
 *
 * It runs the same report function the screen does, with the same filters
 * out of the same URL, so the download is the screen — not a second query
 * that might disagree with it. The download itself is audited, because a
 * report full of client fees leaving the building is worth a line in the
 * log (spec section 11).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request, { params }) {
  const actor = await requireUser();
  const { report: key } = await params;

  const definition = REPORTS[key];
  if (!definition) return new Response("No such report", { status: 404 });
  if (!can(actor, "view", definition.area)) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const report = await runReport(key, actor, query);

  const buffer = await buildWorkbook([
    {
      name: report.title,
      title: `${report.title} · ${describeFilters(query)}`,
      columns: report.columns,
      rows: report.rows,
    },
  ]);

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: "Report",
            entityId: "export",
            note: `${report.title}: ${report.rows.length} rows, filters: ${url.search || "none"}`,
          },
          session,
        ),
      );
    },
  );

  return xlsxResponse(buffer, `phmg-${key}`);
}
