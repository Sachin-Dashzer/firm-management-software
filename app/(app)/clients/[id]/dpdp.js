"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import Invoice from "@/models/Invoice";
import { redactClient } from "@/lib/dpdp/redact";
import { REDACTION } from "@/lib/dpdp";

/**
 * The two things the DPDP Act lets a client ask for (spec section 16): a
 * copy of everything held on them, and the deletion of their personal
 * data.
 *
 * Both are Partner-only, both are audited, and the deletion needs a
 * written reason — it cannot be undone, so the record of *why* is the only
 * thing that will be left to explain it.
 */

/**
 * What a deletion request would do to this client, before anybody does it.
 *
 * Shown on screen first, deliberately: the firm should see the invoices
 * and UDINs that will survive, and the documents that will not, before
 * confirming something irreversible.
 * @param {string} clientId
 */
export async function previewRedaction(clientId) {
  const actor = await requireUser();
  assertCan(actor, "approve", "deleteRecord");

  await connectDB();
  const client = await Client.findById(clientId)
    .select("code legalName redactedAt status")
    .lean();
  if (!client) return { error: "That client no longer exists." };

  const [engagements, openEngagements, invoices] = await Promise.all([
    Engagement.countDocuments({ clientId }),
    Engagement.countDocuments({
      clientId,
      status: { $nin: ["Completed", "Cancelled"] },
    }),
    Invoice.countDocuments({ clientId }),
  ]);

  return {
    ok: true,
    code: client.code,
    name: client.legalName,
    alreadyDone: Boolean(client.redactedAt),
    engagements,
    openEngagements,
    invoices,
    clears: REDACTION.clears,
    keeps: REDACTION.keeps,
  };
}

/**
 * Action a deletion request.
 *
 * Open work blocks it. A client with an unfinished filing is a client the
 * firm still has an engagement with, and redacting their contact details
 * mid-engagement would stop the work rather than protect anybody — the
 * request is honoured once the work is finished or cancelled.
 *
 * @param {string} clientId
 * @param {string} reason
 */
export async function actionRedaction(clientId, reason) {
  const actor = await requireUser();
  assertCan(actor, "approve", "deleteRecord");

  const why = String(reason ?? "").trim();
  if (why.length < 10) {
    return {
      error:
        "Record who asked and when, in a sentence. This cannot be undone and the reason is all that will explain it later.",
    };
  }

  await connectDB();
  const open = await Engagement.countDocuments({
    clientId,
    status: { $nin: ["Completed", "Cancelled"] },
  });
  if (open > 0) {
    return {
      error: `This client still has ${open} unfinished ${open === 1 ? "job" : "jobs"}. Finish or cancel them first — redacting the contact details now would stop the work.`,
    };
  }

  let outcome;
  await audited(actor, async (session) => {
    outcome = await redactClient(clientId, { actor, reason: why, session });
  });

  if (outcome?.error) return outcome;

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");

  const trouble =
    outcome.failed.length > 0
      ? ` ${outcome.failed.length} ${outcome.failed.length === 1 ? "file" : "files"} could not be erased from the vault — tell me and I will look at the gateway.`
      : "";

  return {
    ok: `Personal data for ${outcome.was} has been redacted. ${outcome.erased} ${outcome.erased === 1 ? "file was" : "files were"} erased and ${outcome.credentials} portal ${outcome.credentials === 1 ? "login" : "logins"} destroyed. The invoices, the work and the audit log are kept, as the law requires.${trouble}`,
  };
}

/** Record that a client asked, before anybody acts on it. */
export async function logDataRequest(clientId, kind, note = "") {
  const actor = await requireUser();
  assertCan(actor, "view", "clientSensitive");

  await connectDB();
  const client = await Client.findById(clientId).select("legalName").lean();
  if (!client) return { error: "That client no longer exists." };

  await audited(actor, async (session) => {
    await recordAudit(
      {
        action: ACTIONS.export,
        entityType: "Client",
        entityId: clientId,
        clientId,
        note: `DPDP ${kind} request recorded by ${actor.name}${note ? `: ${note}` : ""}`,
      },
      session,
    );
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: "Recorded on the client's history." };
}
