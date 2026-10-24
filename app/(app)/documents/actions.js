"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { targetForClient } from "@/lib/access/clientAccess";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Document from "@/models/Document";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import Udin from "@/models/Udin";
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  getUploadTicket,
  getDownloadLink,
  remove,
} from "@/lib/storage";
import { buildFileKey } from "@/lib/storage/paths";
import { financialYearLabel } from "@/lib/dates";
import { canEditWork } from "@/lib/engagements/status";

/**
 * Documents (spec section 6).
 *
 * Uploading is two steps on purpose: the browser asks here for a ticket,
 * then sends the bytes straight to the gateway, which keeps large files away
 * from Vercel's request limit. Only when the gateway confirms what it stored
 * does the app record the document — so a failed upload leaves no row, and a
 * row never points at bytes that are not there.
 *
 * Every view, download and delete is audited (spec section 6).
 */

/**
 * Who may touch files on this engagement or client, and what they are.
 * @param {object} actor
 * @param {{ engagementId?: string, clientId?: string }} where
 */
async function loadTarget(actor, { engagementId, clientId }) {
  await connectDB();

  if (engagementId) {
    const engagement = await Engagement.findById(engagementId).lean();
    if (!engagement) throw new Error("That engagement no longer exists.");
    const client = await Client.findById(engagement.clientId)
      .select("code branchId legalName tradeName")
      .lean();
    return { engagement, client };
  }

  const client = await Client.findById(clientId)
    .select("code branchId legalName tradeName")
    .lean();
  if (!client) throw new Error("That client no longer exists.");
  return { engagement: null, client };
}

/** The permission target for a document: its branch and the work it is on. */
/**
 * The target for a `can(… "documents" …)` call about one file.
 *
 * Everything that decides whether somebody may touch a document asks this,
 * so the five paths through this file cannot drift apart. It carries three
 * kinds of attachment:
 *
 *  - the branch, for a CA;
 *  - the engagement's own assignee and reviewer, for work on their desk;
 *  - who holds a grant on the client, and whether this person is on any of
 *    its open work (`targetForClient`) — which is what lets somebody reach
 *    the client's **permanent file**, the PAN card and the incorporation
 *    certificate that belong to no single engagement.
 *
 * `targetForClient` returns early for a Partner, a CA or the accounts
 * person, so their downloads pay for no extra query.
 */
async function targetOf(actor, engagement, client, clientId) {
  const id = String(engagement?.clientId ?? client?._id ?? clientId ?? "");
  const branchId = String(engagement?.branchId ?? client?.branchId ?? "");

  const base = id
    ? await targetForClient(actor, { _id: id, branchId })
    : { branchId };

  return {
    ...base,
    assigneeId: String(engagement?.assigneeId ?? ""),
    reviewerId: String(engagement?.reviewerId ?? ""),
  };
}

/**
 * Step one of an upload: check the person may do it, work out where the file
 * will live, and hand back a ten-minute ticket for the browser to use.
 *
 * @param {object} input
 * @param {string} [input.engagementId]
 * @param {string} [input.clientId]
 * @param {string} [input.checklistItemId]
 * @param {string} input.filename
 * @param {string} input.mime
 * @param {number} input.size
 * @param {boolean} [input.permanent]
 */
export async function requestUpload(input) {
  const actor = await requireUser();
  const { engagement, client } = await loadTarget(actor, input);
  const target = await targetOf(actor, engagement, client);

  assertCan(actor, "edit", "documents", target);

  if (engagement && !canEditWork(actor, engagement)) {
    return {
      error: `Nothing can be attached while this is ${engagement.status}.`,
    };
  }

  if (!input.filename) return { error: "That file has no name." };
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { error: "That file is empty." };
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    return {
      error: `That file is ${Math.round(input.size / 1024 / 1024)} MB. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    };
  }
  if (!ALLOWED_TYPES.includes(input.mime)) {
    return { error: `${input.mime || "That kind of file"} is not accepted.` };
  }

  const fy = engagement?.periodStart
    ? `FY${financialYearLabel(new Date(engagement.periodStart))}`
    : `FY${financialYearLabel(new Date())}`;

  const key = buildFileKey({
    clientCode: client.code,
    filename: input.filename,
    fy,
    serviceCode: engagement?.templateSnapshot?.code,
    engagementCode: engagement?.code,
    permanent: Boolean(input.permanent),
  });

  const ticket = getUploadTicket({ key, maxBytes: MAX_UPLOAD_BYTES });
  return { ok: true, key, fy, ...ticket };
}

/**
 * Step two: the gateway has the bytes, so record the document.
 *
 * `replacesId` keeps the old file as a version rather than overwriting it
 * (spec section 6).
 */
export async function confirmUpload(input) {
  const actor = await requireUser();
  const { engagement, client } = await loadTarget(actor, input);
  const target = await targetOf(actor, engagement, client);
  assertCan(actor, "edit", "documents", target);

  if (!input.key || !input.checksum) {
    return { error: "The upload did not finish." };
  }

  const existing = input.replacesId
    ? await Document.findById(input.replacesId)
    : null;

  /**
   * A file attached to a UDIN: the signed certificate, or the client paper
   * it rests on. The register's row and the file must agree about whose
   * client they belong to, or the certificate's evidence would be somebody
   * else's document.
   */
  let udinId = null;
  if (input.udinId) {
    const udin = await Udin.findById(input.udinId).select("clientId").lean();
    if (!udin) return { error: "That UDIN is no longer in the register." };
    if (String(udin.clientId) !== String(client._id)) {
      return { error: "That UDIN belongs to a different client." };
    }
    udinId = udin._id;
  }

  const saved = await audited(actor, async (session) => {
    if (existing) {
      // the previous file becomes a version; nothing is overwritten
      existing.versions.push({
        fileKey: existing.fileKey,
        size: existing.size,
        checksum: existing.checksum,
        uploadedAt: existing.updatedAt ?? new Date(),
        uploadedBy: existing.uploadedBy,
        uploadedByName: existing.uploadedByName,
      });
      existing.fileKey = input.key;
      existing.size = input.size ?? 0;
      existing.mime = input.mime ?? existing.mime;
      existing.checksum = input.checksum;
      existing.uploadedBy = actor.id;
      existing.uploadedByName = actor.name;
      existing.updatedBy = actor.id;
      await existing.save({ session });
      return existing;
    }

    const [document] = await Document.create(
      [
        {
          name: input.name || input.filename,
          fileKey: input.key,
          size: input.size ?? 0,
          mime: input.mime ?? "application/octet-stream",
          checksum: input.checksum,
          fy: input.fy ?? "",
          kind: input.kind ?? "",
          isPermanent: Boolean(input.permanent),
          clientId: client._id,
          engagementId: engagement?._id ?? null,
          checklistItemId: input.checklistItemId || null,
          udinId,
          branchId: engagement?.branchId ?? client.branchId,
          uploadedBy: actor.id,
          uploadedByName: actor.name,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );

    await recordAudit(
      {
        action: ACTIONS.documentUpload,
        entityType: "Document",
        entityId: document._id,
        clientId: client._id,
        note: document.name,
      },
      session,
    );

    // attaching a file to a checklist item moves it along (spec section 6)
    if (engagement && input.checklistItemId) {
      const live = await Engagement.findById(engagement._id).session(session);
      const item = live?.checklist?.id(input.checklistItemId);
      if (item) {
        item.documentIds.push(document._id);
        if (item.status === "Pending" || item.status === "Requested") {
          item.status = "Received";
          item.receivedAt = new Date();
        }
        live.updatedBy = actor.id;
        await live.save({ session });
      }
    }

    return document;
  });

  if (engagement) revalidatePath(`/engagements/${engagement._id}`);
  if (udinId) revalidatePath("/practice/udin");
  revalidatePath(`/clients/${client._id}`);
  return { ok: `${saved.name} uploaded.`, id: String(saved._id) };
}

/**
 * A five-minute link to read a file, with the audit entry written first —
 * the log records the intention to read, whether or not the bytes arrive.
 *
 * @param {string} id
 * @param {{ inline?: boolean, versionId?: string }} [options]
 */
export async function linkToDocument(id, options = {}) {
  const actor = await requireUser();
  await connectDB();

  const document = await Document.findById(id).lean({ withDeleted: true });
  if (!document) return { error: "That file is gone." };

  const engagement = document.engagementId
    ? await Engagement.findById(document.engagementId).lean()
    : null;

  assertCan(
    actor,
    "view",
    "documents",
    await targetOf(actor, engagement, null, document.clientId),
  );

  const version = options.versionId
    ? document.versions?.find((v) => String(v._id) === options.versionId)
    : null;
  if (options.versionId && !version) return { error: "No such version." };

  await audited(actor, (session) =>
    recordAudit(
      {
        action: options.inline
          ? ACTIONS.documentView
          : ACTIONS.documentDownload,
        entityType: "Document",
        entityId: document._id,
        clientId: document.clientId,
        note: version ? `${document.name} (earlier version)` : document.name,
      },
      session,
    ),
  );

  return {
    ok: true,
    url: getDownloadLink({
      key: version ? version.fileKey : document.fileKey,
      name: document.name,
      mime: document.mime,
      inline: Boolean(options.inline),
    }),
  };
}

/** Send a file to the recycle bin: 90 days, then a Partner can purge it. */
export async function deleteDocument(id, reason = "") {
  const actor = await requireUser();
  await connectDB();

  const document = await Document.findById(id);
  if (!document) return { error: "Already gone." };

  const engagement = document.engagementId
    ? await Engagement.findById(document.engagementId).lean()
    : null;

  assertCan(
    actor,
    "edit",
    "documents",
    await targetOf(actor, engagement, null, document.clientId),
  );

  if (engagement?.status === "Completed") {
    return { error: "A completed engagement is locked." };
  }

  // the vault move first: if it fails, the record stays and so does the file
  await remove(document.fileKey);

  await audited(actor, async (session) => {
    await recordAudit(
      {
        action: ACTIONS.documentDelete,
        entityType: "Document",
        entityId: document._id,
        clientId: document.clientId,
        note: reason ? `${document.name} — ${reason}` : document.name,
      },
      session,
    );
    document.updatedBy = actor.id;
    await document.softDelete(actor.id, { session });
  });

  if (engagement) revalidatePath(`/engagements/${engagement._id}`);
  revalidatePath(`/clients/${document.clientId}`);
  revalidatePath("/documents/bin");
  return { ok: `${document.name} moved to the recycle bin.` };
}

/** Bring a file back out of the bin. */
export async function restoreDocument(id) {
  const actor = await requireUser();
  assertCan(actor, "approve", "deleteRecord");

  await connectDB();
  const document = await Document.findById(id).setOptions({
    withDeleted: true,
  });
  if (!document) return { error: "That file is gone." };
  if (!document.deletedAt) return { ok: "It was never deleted." };

  await remove(document.fileKey, { restore: true });

  await audited(actor, async (session) => {
    document.updatedBy = actor.id;
    await document.restore(actor.id, { session });
  });

  revalidatePath("/documents/bin");
  revalidatePath(`/clients/${document.clientId}`);
  return { ok: `${document.name} restored.` };
}

/**
 * Erase a file for good. Partner only, and only from the bin — this is the
 * one path in the app that destroys anything.
 */
export async function purgeDocument(id) {
  const actor = await requireUser();
  assertCan(actor, "approve", "deleteRecord");

  await connectDB();
  const document = await Document.findById(id).setOptions({
    withDeleted: true,
  });
  if (!document) return { error: "Already gone." };
  if (!document.deletedAt) {
    return { error: "Delete it first; only binned files can be purged." };
  }

  await remove(document.fileKey, { purge: true });
  for (const version of document.versions ?? []) {
    await remove(version.fileKey, { purge: true }).catch(() => {});
  }

  await audited(actor, async (session) => {
    await recordAudit(
      {
        action: ACTIONS.documentDelete,
        entityType: "Document",
        entityId: document._id,
        clientId: document.clientId,
        note: `purged for good: ${document.name}`,
      },
      session,
    );
    document.name = `${document.name} (purged)`;
    document.fileKey = "";
    document.versions = [];
    document.updatedBy = actor.id;
    await document.save({ session });
  });

  revalidatePath("/documents/bin");
  return { ok: "File erased. The record of it staying deleted remains." };
}

/** Rename a document, or mark it part of the client's permanent file. */
export async function updateDocument(id, { name, kind, permanent }) {
  const actor = await requireUser();
  await connectDB();

  const document = await Document.findById(id);
  if (!document) return { error: "That file is gone." };

  const engagement = document.engagementId
    ? await Engagement.findById(document.engagementId).lean()
    : null;
  assertCan(
    actor,
    "edit",
    "documents",
    await targetOf(actor, engagement, null, document.clientId),
  );

  await audited(actor, async (session) => {
    if (name !== undefined) document.name = String(name).trim();
    if (kind !== undefined) document.kind = String(kind).trim();
    if (permanent !== undefined) document.isPermanent = Boolean(permanent);
    document.updatedBy = actor.id;
    await document.save({ session });
  });

  revalidatePath(`/clients/${document.clientId}`);
  if (document.engagementId) {
    revalidatePath(`/engagements/${document.engagementId}`);
  }
  return { ok: "Saved." };
}

/** Everything attached to one engagement, for the checklist. */
export async function documentsForEngagement(engagementId) {
  const actor = await requireUser();
  if (!can(actor, "view", "documents")) return [];

  await connectDB();
  const documents = await Document.find({ engagementId })
    .sort({ createdAt: -1 })
    .lean();

  return documents.map((d) => ({
    id: String(d._id),
    name: d.name,
    size: d.size,
    mime: d.mime,
    checklistItemId: d.checklistItemId ? String(d.checklistItemId) : null,
    versions: (d.versions ?? []).length,
    uploadedByName: d.uploadedByName,
  }));
}

/**
 * The files attached to one UDIN: the signed certificate and the client
 * papers behind it, read together with the register row.
 *
 * Scoped by the UDIN's own branch rather than the looser check the
 * engagement list uses — a certificate register is read by whoever may read
 * UDINs, and the files under it follow the same line.
 *
 * @param {string} udinId
 */
export async function documentsForUdin(udinId) {
  const actor = await requireUser();
  if (!can(actor, "view", "documents")) return [];

  await connectDB();
  const udin = await Udin.findById(udinId).select("branchId").lean();
  if (!udin) return [];
  assertCan(actor, "view", "udin", { branchId: String(udin.branchId) });

  const documents = await Document.find({ udinId })
    .sort({ createdAt: -1 })
    .lean();

  return documents.map((d) => ({
    id: String(d._id),
    name: d.name,
    size: d.size,
    mime: d.mime,
    versions: (d.versions ?? []).length,
    uploadedByName: d.uploadedByName,
  }));
}

/**
 * Share a document with the client's own portal, or take it back (P2-9a).
 *
 * Its own action rather than another field on `updateDocument`, because it
 * is the only edit on this screen that makes something visible **outside
 * the firm**. It carries its own audit note saying which way it went.
 *
 * **Only a CA or a partner may share.** Everything else in this file an
 * employee or an intern may do on work they are on; this one sends the
 * firm's material to somebody who is not in the firm, and that is a
 * judgement for somebody who signs things.
 */
export async function shareDocument(id, shared) {
  const actor = await requireUser();
  await connectDB();

  const document = await Document.findById(id);
  if (!document) return { error: "That file is gone." };

  const engagement = document.engagementId
    ? await Engagement.findById(document.engagementId).lean()
    : null;
  assertCan(
    actor,
    "edit",
    "documents",
    await targetOf(actor, engagement, null, document.clientId),
  );
  if (!["ca", "partner"].includes(actor.role)) {
    return { error: "Only a CA or a partner shares a document with a client." };
  }

  const on = Boolean(shared);

  await audited(actor, async (session) => {
    document.sharedWithClient = on;
    document.sharedAt = on ? new Date() : null;
    document.sharedBy = on ? actor.id : null;
    document.updatedBy = actor.id;
    await document.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Document",
        entityId: String(document._id),
        note: on
          ? `shared with the client's portal: ${document.name}`
          : `withdrawn from the client's portal: ${document.name}`,
      },
      session,
    );
  });

  revalidatePath(`/clients/${document.clientId}`);
  if (document.engagementId) {
    revalidatePath(`/engagements/${document.engagementId}`);
  }
  return { ok: on ? "Shared with the client." : "No longer shared." };
}
