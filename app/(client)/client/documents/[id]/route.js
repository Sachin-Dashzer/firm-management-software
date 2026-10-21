import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import DocumentModel from "@/models/Document";
import { getDownloadLink } from "@/lib/storage";
import { belongsToClient } from "@/lib/access/clientScope";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * A client downloading one of their own documents (P2-9b).
 *
 * Three things have to be true and all three are checked here, because an
 * id in a URL is a guess until proved otherwise: the document is theirs,
 * it was shared, and it is not deleted. Only then does the gateway issue a
 * signed, short-lived link (CLAUDE.md rule 11) and the client is sent to
 * it.
 *
 * The download is audited against the portal account, so "who took a copy
 * of this and when" has the same answer whether it was staff or the client.
 */

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const person = await requireClientUser();
  const { id } = await params;

  await connectDB();
  const document = await DocumentModel.findById(id).lean();

  // one answer for "not yours", "not shared" and "not there": a client
  // learning that a document exists but is withheld is itself a leak
  if (
    !document ||
    !belongsToClient(person, document) ||
    !document.sharedWithClient
  ) {
    return new Response("Not found", { status: 404 });
  }

  await withAuditContext(
    contextFromRequest(
      { id: person.id, name: person.name, role: "client", kind: "client" },
      await headers(),
    ),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.documentDownload,
            entityType: "Document",
            entityId: document._id,
            clientId: document.clientId,
            note: `${document.name} — downloaded by the client`,
          },
          session,
        ),
      );
    },
  );

  redirect(
    getDownloadLink({
      key: document.fileKey,
      name: document.name,
      mime: document.mime,
    }),
  );
}
