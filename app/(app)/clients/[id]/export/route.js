import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { buildClientExport } from "@/lib/dpdp";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * Everything the firm holds on one client, in one workbook (spec section
 * 16, DPDP: "ability to export all data held on a client").
 *
 * Partner-level, because this is every detail of a client in a single
 * file — and heavily audited for the same reason. Encrypted fields are
 * reported as held rather than decrypted: a spreadsheet containing a
 * client's Aadhaar number and their portal passwords would be a worse
 * breach than a slow answer, so those say "held, encrypted" and the firm
 * hands the values over by another route if it must.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request, { params }) {
  const actor = await requireUser();
  const { id } = await params;

  // the sensitive-data permission, not the ordinary client one
  if (!can(actor, "view", "clientSensitive")) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const result = await buildClientExport(id);
  if (!result) return new Response("Not found", { status: 404 });

  const buffer = await buildWorkbook(result.sheets);

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: "Client",
            entityId: id,
            clientId: id,
            note: `DPDP subject access export of ${result.client.legalName}: every record held, taken by ${actor.name}`,
          },
          session,
        ),
      );
    },
  );

  const safe = String(result.client.code ?? "client").replace(/\W+/g, "-");
  return xlsxResponse(buffer, `phmg-everything-we-hold-${safe}`);
}
