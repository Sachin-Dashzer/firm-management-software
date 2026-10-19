// @ts-check

import Client from "../../models/Client.js";
import ClientCredential from "../../models/ClientCredential.js";
import Document from "../../models/Document.js";
import Comment from "../../models/Comment.js";
import MessageLog from "../../models/MessageLog.js";
import { remove } from "../storage/index.js";
import { recordAudit, ACTIONS } from "../audit/index.js";

/**
 * Acting on a deletion request (spec section 16, DPDP).
 *
 * What this does and does not do is set out in `lib/dpdp/index.js`. In
 * short: personal data is overwritten, documents are erased from the
 * vault, and the statutory record is kept because the law requires the
 * firm to keep it.
 *
 * Three rules this follows that are worth stating:
 *
 *  - **It is not reversible.** There is no undo and no soft delete here,
 *    because a redaction that could be undone would not be a redaction.
 *    That is why it needs a Partner and a written reason.
 *  - **It writes its own audit entry first.** If the files fail to erase
 *    half way through, the log still says what was attempted, by whom and
 *    why. An un-auditable redaction would be worse than none.
 *  - **It leaves the client findable.** The code stays, so every invoice
 *    and every audit entry still points at a record that exists, and the
 *    firm can show what happened. A dangling reference would quietly
 *    corrupt the ledger.
 */

/**
 * @param {string} clientId
 * @param {{ actor: {id: string, name: string}, reason: string, session: any }} context
 */
export async function redactClient(clientId, { actor, reason, session }) {
  const client = await Client.findById(clientId)
    .select("+aadhaarEncrypted")
    .session(session);
  if (!client) return { error: "That client no longer exists." };
  if (client.redactedAt) {
    return { error: "This client's personal data has already been redacted." };
  }

  const code = client.code;
  const was = client.legalName;

  // the entry goes in first, so a failure half way through is still on the
  // record (CLAUDE.md rule 2, and the reason this is a deliberate act)
  await recordAudit(
    {
      action: ACTIONS.redact,
      entityType: "Client",
      entityId: client._id,
      clientId: client._id,
      note: `DPDP deletion request actioned by ${actor.name}: ${reason}`,
    },
    session,
  );

  // --- the client record -------------------------------------------------
  client.legalName = code;
  client.tradeName = "";
  client.pan = "";
  client.tan = "";
  client.cin = "";
  client.udyam = "";
  client.iec = "";
  client.aadhaarEncrypted = null;
  client.aadhaarLast4 = "";
  client.establishedOn = null;
  client.contacts = [];
  client.addresses = [];
  client.redactedAt = new Date();
  client.redactedBy = actor.id;
  client.redactionReason = reason;
  client.status = "Closed";
  client.updatedBy = actor.id;
  await client.save({ session });

  // --- portal logins: nothing here may survive ---------------------------
  const credentials = await ClientCredential.find({ clientId })
    .select("+passwordEncrypted +notesEncrypted")
    .session(session);

  for (const credential of credentials) {
    credential.username = "[redacted]";
    credential.passwordEncrypted = "[redacted]";
    credential.notesEncrypted = null;
    credential.label = "";
    credential.updatedBy = actor.id;
    await credential.save({ session });
  }

  // --- what we said to them ---------------------------------------------
  // the fact of a message stays, its contents and its address do not
  await MessageLog.updateMany(
    { clientId },
    { $set: { to: "[redacted]", sentTo: "", body: "[redacted]" } },
    { session },
  );

  await Comment.updateMany(
    { clientId, internal: false },
    { $set: { body: "[redacted on a deletion request]" } },
    { session },
  );

  // --- the files ---------------------------------------------------------
  // Erased, not soft-deleted: there is one storage key for the whole firm,
  // so deleting the file is the only way to make it unreadable. The rows
  // stay, so the firm can show what was held and that it is gone.
  const documents = await Document.find({ clientId }, null, {
    withDeleted: true,
  }).session(session);

  const erased = [];
  const failed = [];

  for (const document of documents) {
    for (const key of [
      document.fileKey,
      ...(document.versions ?? []).map((version) => version.fileKey),
    ].filter(Boolean)) {
      try {
        await remove(key, { purge: true });
        erased.push(key);
      } catch (err) {
        // a file the vault cannot erase is reported, never silently passed
        failed.push({ key, why: String(err?.message ?? err) });
      }
    }

    document.redactedAt = new Date();
    document.updatedBy = actor.id;
    await document.save({ session });
  }

  return {
    ok: true,
    code,
    was,
    erased: erased.length,
    failed,
    credentials: credentials.length,
    documents: documents.length,
  };
}
