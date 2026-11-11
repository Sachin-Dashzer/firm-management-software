// @ts-check

import Client from "../models/Client.js";
import User from "../models/User.js";
import { connectDB } from "../lib/db.js";
import { systemAudit } from "../lib/audit/system.js";
import { recordAudit, ACTIONS } from "../lib/audit/index.js";
import { quotationToClient } from "../lib/mailer/events.js";

/**
 * Send a new client the fees they were taken on at (QA 09-11-2026, #36).
 *
 * This used to happen inside the request that creates the client: its own
 * transaction, and inside it the notification rules, the firm's record,
 * the client-mail switch, a message-log row and a job to post it — five
 * more round trips to Mumbai while somebody watched a spinner. Creating a
 * client took about ten seconds.
 *
 * It belongs here for a better reason than speed, though: it is the one
 * part of onboarding that is **not** about creating the client. Nothing
 * about the client depends on it, a failure here must never undo the
 * record, and the firm already has a queue that retries, rate-limits and
 * logs every message. Onboarding now writes the client and hands the
 * letter to the post room.
 *
 * @param {object} payload
 * @param {string} payload.clientId
 * @param {string} payload.actorId   who onboarded them
 * @param {{lines: string[], totalLine: string, unpriced: number}} payload.quote
 */



export async function quotationJob(payload = {}) {
  await connectDB();

  const client = await Client.findById(payload.clientId)
    .select("branchId legalName tradeName contacts")
    .lean();
  if (!client) return { skipped: "that client no longer exists" };

  if (!payload.quote?.lines?.length) return { skipped: "nothing to quote" };

  // the quotation is signed by the person who took them on, not by "the
  // system": the client reads a name they have spoken to
  const actor = payload.actorId
    ? await User.findById(payload.actorId).select("name").lean()
    : null;

  let sent = [];
  let error = "";

  await systemAudit(async (session) => {
    const outcome = await quotationToClient(
      client,
      payload.quote,
      { id: payload.actorId, name: actor?.name ?? "The team" },
      session,
    );
    sent = outcome.sent;
    error = outcome.error ?? "";
    if (!outcome.sent.length) return;

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Client",
        entityId: client._id,
        clientId: client._id,
        note: `Quotation for ${payload.quote.lines.length} ${
          payload.quote.lines.length === 1 ? "service" : "services"
        } emailed to ${outcome.sent.join(", ")}`,
      },
      session,
    );
  });

  return { sent, error };
}

export default quotationJob;
