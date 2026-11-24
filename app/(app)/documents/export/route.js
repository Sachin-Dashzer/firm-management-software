import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { scopedByClient } from "@/lib/access/clientAccess";
import { clientIdsInGroup } from "@/lib/groups/summary";
import { documentQuery, locationOf } from "@/lib/documents/filter";
import { formatISTDate } from "@/lib/dates";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import {
  withAudit,
  withAuditContext,
  contextFromRequest,
  recordAudit,
  ACTIONS,
} from "@/lib/audit";
import Document from "@/models/Document";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import User from "@/models/User";

/**
 * The file register as a spreadsheet (spec section 14: export on every
 * list).
 *
 * It runs the same `documentQuery` the screen runs, so what you see is what
 * you download, scoping included — and **metadata only**. No file leaves
 * through this route: a spreadsheet of names, clients, sizes and dates is a
 * register, and the files themselves go one at a time through a signed link
 * that is audited each time (CLAUDE.md rule 11).
 *
 * The export itself is audited, because a list of every paper the firm
 * holds for a client is worth knowing somebody took.
 */
export async function GET(request) {
  const actor = await requireUser();
  if (!can(actor, "view", "documents")) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const params = Object.fromEntries(new URL(request.url).searchParams);

  const scope = await scopedByClient(actor, "clientId");
  const clientIds = params.group
    ? await clientIdsInGroup(actor, params.group)
    : null;

  const { query } = documentQuery(actor, params, {
    scope,
    ...(clientIds ? { clientIds } : {}),
  });

  const documents = await Document.find(query)
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const [clients, engagements, people] = await Promise.all([
    Client.find({ _id: { $in: documents.map((d) => d.clientId) } })
      .select("legalName tradeName code")
      .lean(),
    Engagement.find({
      _id: { $in: documents.map((d) => d.engagementId).filter(Boolean) },
    })
      .select("code templateSnapshot periodLabel period")
      .lean(),
    User.find({}).select("name").lean(),
  ]);

  const clientOf = new Map(clients.map((c) => [String(c._id), c]));
  const jobOf = new Map(engagements.map((e) => [String(e._id), e]));
  const nameOf = new Map(people.map((u) => [String(u._id), u.name]));

  const rows = documents.map((d) => {
    const client = clientOf.get(String(d.clientId));
    const job = jobOf.get(String(d.engagementId));
    return [
      d.name,
      d.kind ?? "",
      client ? client.tradeName || client.legalName : "",
      client?.code ?? "",
      locationOf(d, job),
      job?.code ?? "",
      d.fy ?? "",
      d.origin === "firm" ? "Issued by us" : "From the client",
      d.sharedWithClient ? "Yes" : "No",
      (d.versions ?? []).length,
      Math.round((d.size ?? 0) / 1024),
      d.uploadedByName || nameOf.get(String(d.uploadedBy)) || "",
      formatISTDate(d.createdAt),
    ];
  });

  const workbook = await buildWorkbook([
    {
      name: "Files",
      title: "The firm's file register",
      columns: [
        { header: "File", width: 42 },
        { header: "What it is", width: 18 },
        { header: "Client", width: 30 },
        { header: "Client code", width: 16 },
        { header: "Where it sits", width: 26 },
        { header: "Job code", width: 22 },
        { header: "FY", width: 12 },
        { header: "Whose paper", width: 16 },
        { header: "Shared", width: 10 },
        { header: "Earlier copies", width: 14 },
        { header: "Size (KB)", width: 12 },
        { header: "Put up by", width: 22 },
        { header: "Added", width: 14 },
      ],
      rows,
    },
  ]);

  await withAuditContext(contextFromRequest(actor, await headers()), async () =>
    withAudit((session) =>
      recordAudit(
        {
          action: ACTIONS.export,
          entityType: "Document",
          note: `file register — ${rows.length} row${rows.length === 1 ? "" : "s"}`,
        },
        session,
      ),
    ),
  );

  return xlsxResponse(workbook, "phmg-files");
}
