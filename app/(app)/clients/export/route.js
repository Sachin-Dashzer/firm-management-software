import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can, branchFilter, scopeOf } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import { toCSV } from "@/lib/csv";
import { formatISTDate } from "@/lib/dates";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * The client list as a spreadsheet (spec section 14: export on every list).
 * PAN is included only for people who may see it, and Aadhaar never is.
 * The export itself is audited (spec section 11).
 */
export async function GET(request) {
  const actor = await requireUser();
  if (!can(actor, "view", "clients")) {
    return new Response("Not allowed", { status: 403 });
  }
  if (scopeOf(actor, "clients") === "assigned") {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const url = new URL(request.url);

  /** @type {Record<string, any>} */
  const query = {};
  if (branchFilter(actor, "clients")) {
    query.branchId = { $in: actor.branchIds };
  }
  for (const [param, field] of [
    ["status", "status"],
    ["entityType", "entityType"],
    ["risk", "risk"],
  ]) {
    const value = url.searchParams.get(param);
    if (value) query[field] = value;
  }

  const [clients, branches] = await Promise.all([
    Client.find(query).sort({ legalName: 1 }).limit(20000).lean(),
    Branch.find({}).select("code").lean(),
  ]);
  const branchCode = new Map(branches.map((b) => [String(b._id), b.code]));

  const showPan = can(actor, "view", "clientSensitive");

  const rows = [
    [
      "Code",
      "Legal name",
      "Trade name",
      "Entity type",
      "Branch",
      ...(showPan ? ["PAN"] : []),
      "GSTINs",
      "Primary contact",
      "Mobile",
      "Email",
      "Status",
      "Risk",
      "Credit days",
      "Industry",
      "Turnover band",
      "Tags",
      "Onboarded",
    ],
    ...clients.map((c) => {
      const primary = c.contacts?.find((x) => x.primary) ?? c.contacts?.[0];
      return [
        c.code,
        c.legalName,
        c.tradeName,
        c.entityType,
        branchCode.get(String(c.branchId)) ?? "",
        ...(showPan ? [c.pan] : []),
        (c.gstins ?? []).map((g) => g.gstin).join(" "),
        primary?.name ?? "",
        primary?.mobile ?? "",
        primary?.email ?? "",
        c.status,
        c.risk,
        c.creditDays,
        c.industry,
        c.turnoverBand,
        (c.tags ?? []).join(", "),
        c.onboardedOn ? formatISTDate(new Date(c.onboardedOn)) : "",
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
            entityType: "Client",
            entityId: "export",
            note: `${clients.length} clients, filters: ${url.search || "none"}`,
          },
          session,
        ),
      );
    },
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(toCSV(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="phmg-clients-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
