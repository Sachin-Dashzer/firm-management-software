"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { loadTarget, targetOf } from "@/lib/documents/target";
import { resolveNode } from "@/lib/folders/resolve";
import { fieldsFromContext, originFor } from "@/lib/folders/place";
import Document from "@/models/Document";
import Folder from "@/models/Folder";
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
 * Where a file goes when the upload names a folder in the work drive.
 *
 * One function for both steps of the upload, so step two cannot record a
 * file somewhere step one did not authorise. It returns the fields the
 * `Document` takes — the table in brief §9.2, in code — along with the job
 * and client the permission check needs.
 *
 * @param {object} actor
 * @param {string[]} folderPath
 */
async function placeFromFolder(actor, folderPath) {
  const resolved = await resolveNode(actor, folderPath);
  if (resolved?.error === "notFound")
    return { error: "That folder is not there." };
  if (resolved?.error === "noAccess") {
    return { error: resolved.reason || "You cannot open that folder." };
  }
  if (!resolved?.writeRules?.upload) {
    return {
      error:
        resolved?.writeRules?.reason ||
        "Files cannot be put here. Open a client, a year or a job.",
    };
  }

  const { context, records } = resolved;
  return {
    engagement: records.engagement ?? null,
    client: records.client ?? null,
    serviceCode: records.service?.code ?? "",
    target: { branchId: context.branchId ?? "" },
    fields: {
      zone: context.zone,
      clientId: context.clientId ?? null,
      ownerId: context.zone === "personal" ? actor.id : null,
      folderId: context.folderId ?? null,
      serviceTemplateId: context.serviceTemplateId ?? null,
      engagementId: context.engagementId ?? null,
      fy: context.fy ?? "",
      isPermanent: Boolean(context.permanent),
      branchId:
        records.engagement?.branchId ?? records.client?.branchId ?? null,
    },
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
 * @param {string} [input.sampleItemId] the sample row a voucher proves
 * @param {string} input.filename
 * @param {string} input.mime
 * @param {number} input.size
 * @param {boolean} [input.permanent]
 */
export async function requestUpload(input) {
  const actor = await requireUser();

  /**
   * An upload from the work drive names the **folder** it is going into
   * rather than a client or a job, and the folder decides the rest
   * (P3-48c). The path is resolved here, on the server, and again in
   * `confirmUpload` — the browser's idea of where it is uploading is never
   * taken as fact, or a hand-edited request could file a paper under
   * another client's name.
   */
  const where = input.folderPath
    ? await placeFromFolder(actor, input.folderPath)
    : null;
  if (where?.error) return { error: where.error };

  const { engagement, client } = where ?? (await loadTarget(actor, input));
  const target = where
    ? where.target
    : await targetOf(actor, engagement, client);

  if (!where) assertCan(actor, "edit", "documents", target);

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

  const fy =
    where?.fields.fy ||
    (engagement?.periodStart
      ? `FY${financialYearLabel(new Date(engagement.periodStart))}`
      : `FY${financialYearLabel(new Date())}`);

  const key = buildFileKey({
    clientCode: client?.code,
    filename: input.filename,
    fy,
    serviceCode: where?.serviceCode ?? engagement?.templateSnapshot?.code,
    engagementCode: engagement?.code,
    permanent: Boolean(where ? where.fields.isPermanent : input.permanent),
    zone: where?.fields.zone ?? "client",
    userId: actor.id,
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

  // resolved again, not believed: see `placeFromFolder`
  const where = input.folderPath
    ? await placeFromFolder(actor, input.folderPath)
    : null;
  if (where?.error) return { error: where.error };

  const { engagement, client } = where ?? (await loadTarget(actor, input));
  if (!where) {
    assertCan(
      actor,
      "edit",
      "documents",
      await targetOf(actor, engagement, client),
    );
  }

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
    if (String(udin.clientId) !== String(client?._id)) {
      return { error: "That UDIN belongs to a different client." };
    }
    udinId = udin._id;
  }

  /**
   * Where the file belongs: the folder's own context when it came from the
   * drive, and otherwise the client or job the old uploaders name. One
   * object, so the two routes cannot set different fields for the same
   * upload.
   */
  const place = where?.fields ?? {
    zone: "client",
    clientId: client?._id ?? null,
    ownerId: null,
    folderId: null,
    serviceTemplateId: engagement?.serviceTemplateId ?? null,
    engagementId: engagement?._id ?? null,
    fy: input.fy ?? "",
    isPermanent: Boolean(input.permanent),
    branchId: engagement?.branchId ?? client?.branchId ?? null,
  };

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
          fy: place.fy || input.fy || "",
          kind: input.kind ?? "",
          /*
            ours or theirs — anything unrecognised is the client's, except
            in HQ and My Docs, where there is no client whose paper it
            could be
          */
          origin:
            place.zone === "client"
              ? input.origin === "firm"
                ? "firm"
                : "client"
              : "firm",
          zone: place.zone,
          ownerId: place.ownerId,
          folderId: place.folderId,
          serviceTemplateId: place.serviceTemplateId,
          isPermanent: place.isPermanent,
          clientId: place.clientId,
          engagementId: place.engagementId,
          checklistItemId: input.checklistItemId || null,
          /* the sample row a voucher photograph proves (P3-30) */
          sampleItemId: input.sampleItemId || null,
          udinId,
          branchId: place.branchId,
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
        // null for the firm's own papers: HQ and My Docs have no client,
        // and reading `._id` off that threw before a single byte of an
        // HQ upload was ever recorded
        clientId: client?._id ?? null,
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
  if (client) revalidatePath(`/clients/${client._id}`);
  revalidatePath("/documents/folders");
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

/**
 * Bring a file back out of the bin.
 *
 * If the folder it was in is still deleted, the file is restored to the
 * nearest folder above it that is still there — and the message says where
 * it went (P3-48c). A file put back into a folder nobody can open is a file
 * nobody can find, and it would be the restore itself that lost it.
 */
export async function restoreDocument(id) {
  const actor = await requireUser();
  assertCan(actor, "approve", "deleteRecord");

  await connectDB();
  const document = await Document.findById(id).setOptions({
    withDeleted: true,
  });
  if (!document) return { error: "That file is gone." };
  if (!document.deletedAt) return { ok: "It was never deleted." };

  const home = await nearestLiveFolder(document.folderId);

  await remove(document.fileKey, { restore: true });

  await audited(actor, async (session) => {
    const live = await Document.findById(document._id)
      .setOptions({ withDeleted: true })
      .session(session);
    if (!live) throw new Error("That file is gone.");
    live.folderId = home.id;
    live.deletedWithFolderId = null;
    live.updatedBy = actor.id;
    await live.restore(actor.id, { session });
  });

  revalidatePath("/documents/bin");
  revalidatePath("/documents/folders");
  if (document.clientId) revalidatePath(`/clients/${document.clientId}`);
  return {
    ok: home.moved
      ? `${document.name} restored to ${home.label} — the folder it was in is still in the bin.`
      : `${document.name} restored.`,
  };
}

/**
 * The folder a restored file should land in: its own, if that is still
 * there, else the nearest one above it that is, else none at all — which
 * means the client's loose files, where somebody will see it.
 *
 * @param {any} folderId
 */
async function nearestLiveFolder(folderId) {
  if (!folderId) return { id: null, moved: false, label: "" };

  const own = await Folder.findById(folderId).lean();
  if (own) return { id: own._id, moved: false, label: own.name };

  const deleted = await Folder.findById(folderId)
    .setOptions({ withDeleted: true })
    .lean();
  for (const id of [...(deleted?.ancestors ?? [])].reverse()) {
    const parent = await Folder.findById(id).lean();
    if (parent) return { id: parent._id, moved: true, label: parent.name };
  }

  return { id: null, moved: true, label: "the client's files" };
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
    document.purgedAt = new Date();
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
    origin: d.origin === "firm" ? "firm" : "client",
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
    origin: d.origin === "firm" ? "firm" : "client",
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
