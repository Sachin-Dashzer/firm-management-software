"use server";

import { revalidatePath } from "next/cache";
import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Engagement from "@/models/Engagement";
import DocumentModel from "@/models/Document";
import Client from "@/models/Client";
import { engagementScope } from "@/lib/access/clientScope";
import {
  clientCannotProvide,
  clientDelegates,
  clientAsks,
  recordSubmission,
  clientMayUpload,
} from "@/lib/engagements/checklist";
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  getUploadTicket,
} from "@/lib/storage";
import { buildFileKey } from "@/lib/storage/paths";
import { financialYearLabel } from "@/lib/dates";
import { createDelegateRequest } from "@/lib/documents/delegate";
import { recordClientConfirmation } from "@/lib/engagements/gates";

/**
 * What a client can say back about a document we asked for (P3-2).
 *
 * **This is the second write a portal account can make**, and it is worth
 * saying so plainly: until now the only one was a change request, which is
 * a comment and changes no record (see `profile/actions.js`). The reason for
 * a second is that the three commonest answers to a document request —
 * *I don't have it*, *my accountant has it*, *I'm not sure what you mean* —
 * were a phone call nobody recorded, so the job sat in "Awaiting documents"
 * with no reason attached and the firm chased a client who had already
 * explained themselves.
 *
 * It is kept as narrow as a write can be:
 *
 * - the engagement must be in **this** client's scope, read through
 *   `engagementScope()` like every other portal query
 * - the item must be on the **client's own side** of the checklist
 * - the item must not already be settled
 * - the **only** field written is `clientReply`. Not the status, not the
 *   documents, not a date. A client cannot move an item forward, and
 *   nothing here accepts anything
 * - every one writes an audit entry naming the portal user
 *
 * A client **can** now upload here (owner, 19-11-2026), which reverses the
 * decision of 21-10-2026 that had kept uploading on the emailed token link
 * alone. The reason it was kept out was that a second door into the vault is
 * a second thing to get wrong. The reason it is now in: a person who has
 * signed in, uploading against a document the firm itself asked for, is the
 * *narrower* case of the two — the emailed link works for anybody holding it.
 *
 * It is the same two steps as that link (`app/upload/[token]/actions.js`) with
 * the token swapped for the session, and it buys no new authority along the
 * way: **Received is as far as anything moves**, a person at the firm still
 * accepts, and nothing uploaded here is `sharedWithClient` — the file is
 * theirs, but sharing is a CA's act and stays one.
 */

/** Load an engagement and one client-side item, or explain why not. */
async function loadOwnItem(person, engagementId, itemId) {
  await connectDB();

  const engagement = await Engagement.findOne({
    ...engagementScope(person),
    _id: engagementId,
  });
  if (!engagement) {
    return { error: "That request is not on your file." };
  }

  const item = engagement.checklist?.id(itemId);
  if (!item) return { error: "That request is no longer open." };
  if (item.side !== "client") {
    // an item the firm owes itself is the firm's business
    return { error: "That request is not one of yours." };
  }
  return { engagement, item };
}

/**
 * Save and audit. The actor is the portal user, named as such, so the firm
 * audit log never confuses a client's words for a colleague's.
 */
async function saveReply(person, engagement, item, note) {
  await audited(
    { id: `client:${person.id}`, name: `${person.name} (client)` },
    async (session) => {
      await engagement.save({ session });
      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          diff: { [item.name]: ["", item.clientReply?.kind ?? "reply"] },
          note,
        },
        session,
      );
    },
  );

  revalidatePath("/client");
  revalidatePath(`/engagements/${engagement._id}`);
}

/** "I don't have this." */
export async function sayCannotProvide(engagementId, itemId, formData) {
  const person = await requireClientUser();
  const loaded = await loadOwnItem(person, engagementId, itemId);
  if (loaded.error) return { error: loaded.error };
  const { engagement, item } = loaded;

  const note = String(formData.get("note") ?? "");
  const out = clientCannotProvide(item, { note, byName: person.name });
  if (!out.ok) return { error: out.error };

  await saveReply(
    person,
    engagement,
    item,
    `Client says they cannot provide ${item.name}${
      item.clientReply.note ? `: ${item.clientReply.note}` : ""
    }`,
  );
  return {
    ok: "Thank you — we have told your CA. They will suggest an alternative or carry on without it.",
  };
}

/**
 * "Someone else will send it."
 *
 * The client names the person; **we** make the upload link and send it. A
 * portal user minting a token that works without signing in would be an
 * escalation, and the effect is the same without handing them one.
 */
export async function delegateRequest(engagementId, itemId, formData) {
  const person = await requireClientUser();
  const loaded = await loadOwnItem(person, engagementId, itemId);
  if (loaded.error) return { error: loaded.error };
  const { engagement, item } = loaded;

  const out = clientDelegates(item, {
    name: String(formData.get("name") ?? ""),
    contact: String(formData.get("contact") ?? ""),
    byName: person.name,
  });
  if (!out.ok) return { error: out.error };

  await saveReply(
    person,
    engagement,
    item,
    `Client asked ${out.delegate.name} (${out.delegate.contact}) to send ${item.name}`,
  );

  // one item, seven days, upload only — the same link the firm would send
  await createDelegateRequest({
    engagement,
    item,
    delegate: out.delegate,
    askedBy: person.name,
  }).catch(() => {});

  return {
    ok: `We have sent ${out.delegate.name} a link for this one item. They cannot see anything else on your file.`,
  };
}

/** "Please clarify." */
export async function askAboutRequest(engagementId, itemId, formData) {
  const person = await requireClientUser();
  const loaded = await loadOwnItem(person, engagementId, itemId);
  if (loaded.error) return { error: loaded.error };
  const { engagement, item } = loaded;

  const out = clientAsks(item, {
    question: String(formData.get("question") ?? ""),
    byName: person.name,
  });
  if (!out.ok) return { error: out.error };

  await saveReply(
    person,
    engagement,
    item,
    `Client asks about ${item.name}: ${item.clientReply.question}`,
  );
  return { ok: "Sent. Your CA will come back to you." };
}

/**
 * Where a file for this job belongs: the folder, and a key inside it.
 *
 * Both steps of the upload call this, which is the point of it being a
 * function. The browser hands the key back at step two, and a key arriving
 * from a browser is a key somebody can rewrite — so step two recomputes the
 * **folder** here and refuses anything outside it. The last segment is a
 * fresh UUID and so cannot be recomputed, but it does not need to be: what
 * matters is that the key belongs to this client, this year and this job.
 *
 * `fy` comes from the period the work is *for*, never the day it was sent,
 * so the two computations agree.
 */
async function fileKeyFor(engagement, filename) {
  const client = await Client.findById(engagement.clientId)
    .select("code")
    .lean();

  const fy = `FY${financialYearLabel(
    new Date(engagement.periodStart ?? Date.now()),
  )}`;

  const key = buildFileKey({
    clientCode: client?.code ?? "unfiled",
    filename,
    fy,
    serviceCode: engagement.templateSnapshot?.code,
    engagementCode: engagement.code,
  });

  return { key, fy, folder: key.replace(/[^/]+$/, "") };
}

/**
 * Step one of an upload: a ten-minute ticket for one file.
 *
 * The same shape as `publicUploadTicket` on the token link, and the same
 * limits — they live in `lib/storage` so there is one answer to "what may be
 * uploaded" rather than two that drift. The gateway re-checks both against
 * the signed ticket, so these are the courteous refusals, given before a
 * phone spends two minutes sending something that will be turned away.
 *
 * @param {string} engagementId
 * @param {string} itemId
 * @param {{ filename: string, mime: string, size: number }} file
 */
export async function uploadTicket(engagementId, itemId, file) {
  const person = await requireClientUser();
  const loaded = await loadOwnItem(person, engagementId, itemId);
  if (loaded.error) return { error: loaded.error };
  const { engagement, item } = loaded;

  const allowed = clientMayUpload(item);
  if (!allowed.ok) return { error: allowed.error };

  if (!file?.filename) return { error: "That file has no name." };
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { error: "That file is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: `That file is too large. The limit is ${Math.round(
        MAX_UPLOAD_BYTES / 1024 / 1024,
      )} MB.`,
    };
  }
  if (!ALLOWED_TYPES.includes(file.mime)) {
    return { error: "We cannot accept that kind of file." };
  }

  const { key, fy } = await fileKeyFor(engagement, file.filename);
  return { ok: true, key, fy, ...getUploadTicket({ key }) };
}

/**
 * Step two: the gateway has the bytes, so record the document against the
 * item it was asked for.
 *
 * Everything here is one transaction, because a `Document` row with no
 * checklist item pointing at it is a file nobody will ever be asked about,
 * and a checklist item marked Received with no document is worse.
 *
 * `recordSubmission` is what keeps a replacement honest: a new file is a new
 * submission and it clears the format check and the acceptance on the one
 * before it, so the firm cannot be left vouching for a file nobody opened.
 *
 * @param {string} engagementId
 * @param {string} itemId
 * @param {{ key: string, filename: string, mime?: string, size?: number, checksum: string }} stored
 *   `fy` is ignored if sent: it is recomputed from the engagement below.
 */
export async function confirmUpload(engagementId, itemId, stored) {
  const person = await requireClientUser();
  const loaded = await loadOwnItem(person, engagementId, itemId);
  if (loaded.error) return { error: loaded.error };
  const { engagement, item } = loaded;

  const allowed = clientMayUpload(item);
  if (!allowed.ok) return { error: allowed.error };

  if (!stored?.key || !stored?.checksum) {
    return { error: "The upload did not finish. Please try again." };
  }

  /**
   * The key came back through a browser, so it is recomputed rather than
   * believed. Without this, somebody could hand back the key of a file
   * belonging to another client and have it recorded on their own file —
   * where a member of the firm would then see it, under the wrong name.
   *
   * `fy` is recomputed for the same reason, instead of being read off the
   * message.
   */
  const { fy, folder } = await fileKeyFor(engagement, stored.filename);
  if (!String(stored.key).startsWith(folder)) {
    return { error: "That upload does not belong to this request." };
  }

  const actor = {
    id: `client:${person.id}`,
    name: `${person.name} (client)`,
  };

  await audited(actor, async (session) => {
    const [document] = await DocumentModel.create(
      [
        {
          name: stored.filename,
          fileKey: stored.key,
          size: stored.size ?? 0,
          mime: stored.mime ?? "application/octet-stream",
          checksum: stored.checksum,
          fy,
          clientId: engagement.clientId,
          engagementId: engagement._id,
          checklistItemId: item._id,
          branchId: engagement.branchId ?? person.branchId,
          /**
           * Not shared back. The file is the client's own, but
           * `sharedWithClient` is the record of a CA deciding to put
           * something in front of them, and nothing should be able to set
           * that except a CA doing it.
           */
          sharedWithClient: false,
          uploadedBy: null,
          uploadedByName: `${person.name} (client portal)`,
          createdBy: null,
          updatedBy: null,
        },
      ],
      { session },
    );

    await recordAudit(
      {
        action: ACTIONS.documentUpload,
        entityType: "Document",
        entityId: document._id,
        clientId: engagement.clientId,
        note: `uploaded on the client portal by ${person.name} (${person.email}) against ${item.name}`,
      },
      session,
    );

    item.documentIds.push(document._id);
    recordSubmission(item);
    await engagement.save({ session });
  });

  revalidatePath("/client");
  revalidatePath("/client/work");
  revalidatePath(`/engagements/${engagementId}`);
  return { ok: `${stored.filename} received. Thank you.` };
}

/**
 * The client confirms the figures before a return is filed (P3-5, P3-6).
 *
 * **The third write a portal account can make**, and the only one that
 * changes what the firm may do next: until this record exists, `blocksFiling`
 * refuses the filing.
 *
 * Narrow in the same way as the other two, with one addition — the account
 * must have been *given* the right. Uploading a bank statement and agreeing
 * a tax figure are not the same act, so they are not the same permission:
 * `mayConfirmFigures` is off until somebody at the firm turns it on for a
 * named person at the client.
 *
 * The evidence line writes itself here. For a confirmation over the phone a
 * staff member has to say where it can be found; a confirmation made on the
 * portal *is* the record, and it says so, with the account's own name on it.
 */
export async function confirmFigures(engagementId) {
  const person = await requireClientUser();

  if (!person.mayConfirmFigures) {
    return {
      error:
        "Your login cannot confirm figures. Ask us to give you that, or ask whoever at your office signs these off.",
    };
  }

  await connectDB();
  const engagement = await Engagement.findOne({
    ...engagementScope(person),
    _id: engagementId,
  });
  if (!engagement) return { error: "That work is not on your file." };

  const actor = {
    id: person.id,
    name: person.name,
    role: "client",
    kind: "client",
  };

  const result = recordClientConfirmation(
    engagement,
    {
      who: person.name,
      when: new Date(),
      evidence: `Confirmed on the client portal by ${person.name} (${person.email})`,
    },
    actor,
  );
  if (!result.ok) return { error: result.error };

  await audited(actor, async (session) => {
    engagement.updatedBy = person.id;
    await engagement.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        note: `Client confirmed version ${result.version} on the portal: ${person.name}`,
      },
      session,
    );
  });

  revalidatePath("/client/work");
  revalidatePath(`/engagements/${engagementId}`);
  return {
    ok: `Thank you. We have recorded that you confirmed version ${result.version} of the figures, and we can now file.`,
  };
}
