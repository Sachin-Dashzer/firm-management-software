import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import SendBatch from "@/models/SendBatch";
import { TEMPLATES } from "@/lib/mailer/templates";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * The run log as a spreadsheet (P3-10).
 *
 * One row per recipient rather than per batch, because the question this
 * answers is "what did you send to *this* client, and when" — a peer
 * reviewer asks about a client, not about a batch. The batch's own decision
 * travels on every one of its rows so a filtered copy still makes sense.
 */

export const dynamic = "force-dynamic";

export async function GET(request) {
  const actor = await requireUser();
  if (!can(actor, "view", "usersSettings")) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const batches = await SendBatch.find({})
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean();

  const rows = batches.flatMap((batch) =>
    (batch.items ?? []).map((item) => ({
      at: batch.createdAt,
      rule: TEMPLATES[batch.rule]?.what ?? batch.rule,
      status: batch.status,
      why: batch.why ?? "",
      client: item.clientName || "",
      to: item.to,
      outcome: item.outcome || "not decided",
      outcomeWhy: item.outcomeWhy || "",
      decidedBy: batch.decidedByName ?? "",
      decidedAt: batch.decidedAt ?? null,
      declineReason: batch.declineReason ?? "",
    })),
  );

  const buffer = await buildWorkbook([
    {
      name: "Run log",
      title: "PHMG & Associates — automatic messages to clients",
      columns: [
        { header: "Worked out", key: "at", width: 20, kind: "date" },
        { header: "Rule", key: "rule", width: 40 },
        { header: "Batch", key: "status", width: 14 },
        { header: "Why", key: "why", width: 48 },
        { header: "Client", key: "client", width: 30 },
        { header: "To", key: "to", width: 30 },
        { header: "What happened", key: "outcome", width: 16 },
        { header: "Why that", key: "outcomeWhy", width: 48 },
        { header: "Decided by", key: "decidedBy", width: 24 },
        { header: "Decided", key: "decidedAt", width: 20, kind: "date" },
        { header: "If declined", key: "declineReason", width: 40 },
      ],
      rows,
    },
  ]);

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: "SendBatch",
            entityId: actor.id,
            note: `exported the automatic-message run log: ${rows.length} messages`,
          },
          session,
        ),
      );
    },
  );

  return xlsxResponse(buffer, "phmg-automatic-messages");
}
