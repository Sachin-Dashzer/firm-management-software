import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import AuditLog from "@/models/AuditLog";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";
import { describeEntry } from "@/lib/audit/describe";
import { formatISTDateTime } from "@/lib/dates";

/**
 * Download the filtered audit log (spec section 11).
 *
 * ponytail: CSV with a BOM, which Excel opens natively — a real .xlsx needs a
 * library and buys nothing here. Swap to the shared Excel writer in Step 10
 * if the firm wants formatting and frozen headers.
 *
 * The export is itself audited, because spec section 11 logs "exports of
 * reports or bulk data".
 */

const MAX_ROWS = 20000;

/** RFC 4180: quotes doubled, the whole field quoted when it needs to be. */
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request) {
  const actor = await requireUser();
  if (!can(actor, "view", "auditLog")) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const url = new URL(request.url);
  const query = {};
  if (branchFilter(actor, "auditLog")) {
    query.branchId = { $in: actor.branchIds };
  }
  for (const [param, field] of [
    ["user", "userId"],
    ["action", "action"],
    ["entityType", "entityType"],
  ]) {
    const value = url.searchParams.get(param);
    if (value) query[field] = value;
  }
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from || to) {
    query.ts = {};
    if (from) query.ts.$gte = new Date(`${from}T00:00:00+05:30`);
    if (to) query.ts.$lte = new Date(`${to}T23:59:59+05:30`);
  }

  const entries = await AuditLog.find(query)
    .sort({ seq: -1 })
    .limit(MAX_ROWS)
    .lean();

  const rows = [
    [
      "Entry",
      "When (IST)",
      "Who",
      "Role",
      "Action",
      "Record type",
      "Record",
      "What happened",
      "Changed fields",
      "IP address",
    ],
    ...entries.map((entry) => {
      const { headline, changes } = describeEntry(entry);
      return [
        entry.seq,
        formatISTDateTime(new Date(entry.ts)),
        entry.userName,
        entry.role,
        entry.action,
        entry.entityType,
        entry.entityId,
        headline,
        changes.join("; "),
        entry.ip,
      ];
    }),
  ];

  // ﻿ so Excel reads it as UTF-8 and Indian names survive
  const csv = `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}`;

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit(async (session) => {
        await recordAudit(
          {
            action: ACTIONS.export,
            entityType: "AuditLog",
            entityId: "export",
            note: `${entries.length} entries, filters: ${url.search || "none"}`,
          },
          session,
        );
      });
    },
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="phmg-audit-log-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
