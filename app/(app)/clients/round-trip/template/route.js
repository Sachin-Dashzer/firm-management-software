import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can, seesOnlyOwnRecords } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import ClientGroup from "@/models/ClientGroup";
import { clientListFilter } from "@/lib/access/clientAccess";
import { toCSV } from "@/lib/csv";
import { ROUND_TRIP_COLUMNS, clientToRow } from "@/lib/clients/roundTrip";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * The client list in the shape the sheet reads back (P3-18a).
 *
 * CSV rather than the `.xlsx` the ordinary export produces, because this
 * file is **meant to come back**: the import reads CSV, and a round trip
 * through a format the other half cannot read is not a round trip.
 *
 * PAN is in it, because correcting identity is the point — so it is refused
 * to anybody who may not see a PAN, and the download is audited like every
 * other export of client data (spec section 11).
 */
export async function GET() {
  const actor = await requireUser();

  if (!can(actor, "edit", "clients") || seesOnlyOwnRecords(actor, "clients")) {
    return new Response("Not allowed", { status: 403 });
  }
  if (!can(actor, "view", "clientIdentifiers")) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();

  const [clients, branches, groups] = await Promise.all([
    Client.find(await clientListFilter(actor))
      .select(
        "code legalName tradeName entityType branchId groupId pan tan cin gstins contacts status risk creditDays industry turnoverBand tags invoiceEmail addresses",
      )
      .sort({ code: 1 })
      .limit(10000)
      .lean(),
    Branch.find({}).select("code").lean(),
    ClientGroup.find({}).select("name").lean(),
  ]);

  const branchCode = new Map(branches.map((row) => [String(row._id), row.code]));
  const groupName = new Map(groups.map((row) => [String(row._id), row.name]));

  const rows = clients.map((client) =>
    clientToRow(client, {
      branchCode: branchCode.get(String(client.branchId)) ?? "",
      groupName: groupName.get(String(client.groupId)) ?? "",
    }),
  );

  await withAuditContext(contextFromRequest(actor, await headers()), async () => {
    await withAudit((session) =>
      recordAudit(
        {
          action: ACTIONS.export,
          entityType: "Client",
          entityId: "export",
          note: `${rows.length} clients as a round-trip sheet`,
        },
        session,
      ),
    );
  });

  /** The columns, then one array per client, in the order the header gives. */
  const table = [
    ROUND_TRIP_COLUMNS,
    ...rows.map((row) => ROUND_TRIP_COLUMNS.map((column) => row[column] ?? "")),
  ];

  return new Response(toCSV(table), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="phmg-clients-round-trip.csv"',
      "Cache-Control": "no-store",
    },
  });
}
