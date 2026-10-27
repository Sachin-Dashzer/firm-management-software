import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import FirmSettings from "@/models/FirmSettings";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import { gstTemplateSheets } from "@/lib/gst/template";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * The workbook the firm sends the client for one month (P3-12).
 *
 * Generated per engagement rather than kept as one file somewhere, so it is
 * headed with the client's name and the period and cannot be sent for the
 * wrong month — which is the mistake a shared blank template invites.
 */

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const actor = await requireUser();
  const { id } = await params;

  await connectDB();
  const engagement = await Engagement.findById(id)
    .select("clientId branchId assigneeId reviewerId periodLabel period")
    .lean();
  if (!engagement) return new Response("Not found", { status: 404 });

  if (
    !can(actor, "view", "engagementsWork", {
      branchId: String(engagement.branchId),
      assigneeId: String(engagement.assigneeId ?? ""),
      reviewerId: String(engagement.reviewerId ?? ""),
    })
  ) {
    return new Response("Not allowed", { status: 403 });
  }

  const [client, firm] = await Promise.all([
    Client.findById(engagement.clientId).select("legalName tradeName").lean(),
    FirmSettings.findOne({ key: "firm" }).select("name").lean(),
  ]);

  const period = engagement.periodLabel || engagement.period || "the period";
  const clientName = client?.tradeName || client?.legalName || "Client";

  const buffer = await buildWorkbook(
    gstTemplateSheets({ clientName, period, firm: firm?.name }),
  );

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: "Engagement",
            entityId: engagement._id,
            clientId: engagement.clientId,
            note: `generated the GST data workbook for ${period}`,
          },
          session,
        ),
      );
    },
  );

  return xlsxResponse(
    buffer,
    `gst-data-${clientName.replace(/\W+/g, "-").toLowerCase()}-${period.replace(/\W+/g, "-").toLowerCase()}`,
  );
}
