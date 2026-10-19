import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import User from "@/models/User";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import { daysUntil } from "@/lib/dates";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";
import { engagementQuery } from "@/lib/engagements/filter";
import { tierOf } from "@/lib/services/catalog";

/**
 * The engagement list as a spreadsheet (spec section 14: export on every
 * list). It runs the same query builder as the screen, so what you see is
 * what you download — including the branch and own-work scoping. The export
 * itself is audited (spec section 11).
 */
export async function GET(request) {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const query = engagementQuery(actor, params);

  const engagements = await Engagement.find(query)
    .sort({ statutoryDue: 1, internalDue: 1 })
    .limit(20000)
    .lean();

  const [clients, branches, people] = await Promise.all([
    Client.find({ _id: { $in: engagements.map((e) => e.clientId) } })
      .select("legalName tradeName code")
      .lean(),
    Branch.find({}).select("code").lean(),
    User.find({}).select("name").lean(),
  ]);

  const clientById = new Map(clients.map((c) => [String(c._id), c]));
  const branchCode = new Map(branches.map((b) => [String(b._id), b.code]));
  const personName = new Map(people.map((u) => [String(u._id), u.name]));

  const rows = [
    [
      "Code",
      "Client",
      "Client code",
      "Branch",
      "Service",
      "Tier",
      "Period",
      "Status",
      "Priority",
      "Assignee",
      "Reviewer",
      "Statutory due",
      "Internal due",
      "Days left",
      "Started",
      "Completed",
      "Acknowledgement no.",
      "UDIN",
      "Sent back",
      "Fee",
      "Billing status",
    ],
    ...engagements.map((e) => {
      const client = clientById.get(String(e.clientId));
      const due = e.statutoryDue ?? e.internalDue;
      return [
        e.code,
        client ? client.tradeName || client.legalName : "",
        client?.code ?? "",
        branchCode.get(String(e.branchId)) ?? "",
        e.templateSnapshot?.name ?? "",
        tierOf(e.templateSnapshot?.level) ?? "",
        e.periodLabel || e.period,
        e.status,
        e.priority,
        personName.get(String(e.assigneeId)) ?? "",
        personName.get(String(e.reviewerId)) ?? "",
        // raw dates and raw paise: the spreadsheet writer formats both, so
        // Excel gets a date it can sort and a number it can sum
        e.statutoryDue ?? "",
        e.internalDue ?? "",
        due ? daysUntil(due) : "",
        e.startedAt ?? "",
        e.completedAt ?? "",
        e.ackNo ?? "",
        e.udin ?? "",
        e.reworkCount ?? 0,
        e.feePaise ?? 0,
        e.billingStatus,
      ];
    }),
  ];

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: "Engagement",
            entityId: "export",
            note: `${engagements.length} engagements, filters: ${url.search || "none"}`,
          },
          session,
        ),
      );
    },
  );

  const kinds = {
    "Statutory due": "date",
    "Internal due": "date",
    "Days left": "int",
    Started: "date",
    Completed: "date",
    "Sent back": "int",
    Fee: "money",
  };
  const columns = rows[0].map((header) => ({
    header,
    kind: kinds[header] ?? "text",
  }));

  const buffer = await buildWorkbook([
    { name: "Engagements", columns, rows: rows.slice(1) },
  ]);
  return xlsxResponse(buffer, "phmg-engagements");
}
