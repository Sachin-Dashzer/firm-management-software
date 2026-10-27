"use server";

import { revalidatePath } from "next/cache";
import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Comment from "@/models/Comment";
import Client from "@/models/Client";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { belongsToClient } from "@/lib/access/clientScope";
import { clientReplied } from "@/lib/mailer/events";

/**
 * The client's half of a job's conversation (P3-17b).
 *
 * The fourth thing a portal account can write, after a change request
 * (P2-9b), a document request reply (P3-2) and a confirmation of figures
 * (P3-6). It needs no per-account right: answering a question the firm
 * asked on a job the client can already see is the least a portal can do,
 * and the firm started the thread.
 *
 * **Only onto a thread the firm started.** A reply with nothing to reply to
 * is refused — otherwise the portal becomes a way to open conversations
 * about jobs nobody at the firm is watching, which is worse than email.
 */
export async function replyOnJob(engagementId, formData) {
  const person = await requireClientUser();

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 2) return { error: "Write your message first." };
  if (body.length > 4000) return { error: "That is too long for a message." };

  await connectDB();
  const engagement = await Engagement.findById(engagementId)
    .select("clientId assigneeId reviewerId templateSnapshot periodLabel period")
    .lean();

  /**
   * Theirs, or nothing. The id comes from a form, so it is checked against
   * the session's own client and never trusted.
   */
  if (!belongsToClient(person, engagement)) {
    return { error: "That job is not one of yours." };
  }

  const started = await Comment.countDocuments({
    entityType: "Engagement",
    entityId: engagement._id,
    internal: false,
  });
  if (started === 0) {
    return {
      error:
        "There is no conversation open on this job yet. Use Ask us a question on your profile, or reply to an email from us.",
    };
  }

  const client = await Client.findById(person.clientId)
    .select("legalName tradeName")
    .lean();
  const clientName = client?.tradeName || client?.legalName || "the client";

  const actor = {
    id: String(person.id),
    name: person.name,
    role: "client",
    kind: "client",
  };

  await audited(actor, async (session) => {
      const [comment] = await Comment.create(
        [
          {
            entityType: "Engagement",
            entityId: engagement._id,
            clientId: engagement.clientId,
            kind: "Client message",
            body,
            // written from outside the firm: it is never internal
            internal: false,
            createdBy: actor.id,
            createdByName: `${person.name} (${clientName})`,
          },
        ],
        { session },
      );

      await recordAudit(
        {
          action: ACTIONS.create,
          entityType: "Comment",
          entityId: comment._id,
          clientId: engagement.clientId,
          note: `${person.name} replied on ${engagement.templateSnapshot?.name ?? "a job"} from the client portal`,
        },
        session,
      );

      await clientReplied(
        engagement,
        { name: person.name, clientName },
        body,
      session,
    );
  });

  revalidatePath("/client/work");
  return { ok: "Sent. The people on this job have been told." };
}
