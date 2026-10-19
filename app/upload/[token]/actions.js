"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import { systemAudit } from "@/lib/audit/system";
import { recordAudit, ACTIONS } from "@/lib/audit";
import DocRequest from "@/models/DocRequest";
import DocumentModel from "@/models/Document";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  getUploadTicket,
} from "@/lib/storage";
import { buildFileKey } from "@/lib/storage/paths";
import { hashRequestToken } from "@/lib/storage/requests";
import { financialYearLabel } from "@/lib/dates";

/**
 * The client's side of a document request (spec section 6).
 *
 * Nobody is signed in here, so the link is the only credential and these two
 * actions are the only things it can do: get a ticket to upload one file,
 * and record that file against the item it was asked for. There is no way
 * from here to read anything, see another client, or reach the app.
 *
 * Everything the link does is audited as coming from the client.
 */

/** Links stop accepting after this many files, whatever their expiry says. */
const MAX_FILES_PER_REQUEST = 50;

/**
 * Find the request a token belongs to, or say why it cannot be used.
 * @param {string} token
 */
async function openRequest(token) {
  await connectDB();
  if (!token || token.length < 20) return { error: "This link is not valid." };

  // the token is looked up by hash: the plain one is never stored
  const request = await DocRequest.findOne({
    tokenHash: hashRequestToken(token),
  });
  if (!request) return { error: "This link is not valid." };
  if (request.revokedAt) {
    return { error: "This link has been withdrawn. Please ask for a new one." };
  }
  if (request.expiresAt <= new Date()) {
    return { error: "This link has expired. Please ask for a new one." };
  }
  if (request.uploadCount >= MAX_FILES_PER_REQUEST) {
    return {
      error: "This link has reached its limit. Please ask for a new one.",
    };
  }
  return { request };
}

/**
 * What the client sees when they open the link: who it is from and what is
 * being asked for. Deliberately thin — no engagement detail, no fees, no
 * other documents.
 * @param {string} token
 */
export async function requestDetails(token) {
  const found = await openRequest(token);
  if (found.error) return found;
  const request = found.request;

  const client = await Client.findById(request.clientId)
    .select("legalName tradeName")
    .lean();

  return {
    ok: true,
    clientName: client?.tradeName || client?.legalName || "",
    message: request.message,
    expiresAt: request.expiresAt.toISOString(),
    items: request.items.map((item) => ({
      id: String(item._id),
      name: item.name,
      mandatory: item.mandatory,
      received: item.receivedCount > 0,
    })),
  };
}

/**
 * Step one: a ticket to upload one file against one requested item.
 * @param {string} token
 * @param {{ itemId: string, filename: string, mime: string, size: number }} input
 */
export async function publicUploadTicket(token, input) {
  const found = await openRequest(token);
  if (found.error) return found;
  const request = found.request;

  const item = request.items.id(input.itemId);
  if (!item) return { error: "That is not something we asked for." };

  if (!input.filename) return { error: "That file has no name." };
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { error: "That file is empty." };
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    return {
      error: `That file is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    };
  }
  if (!ALLOWED_TYPES.includes(input.mime)) {
    return { error: "We cannot accept that kind of file." };
  }

  const [client, engagement] = await Promise.all([
    Client.findById(request.clientId).select("code").lean(),
    request.engagementId
      ? Engagement.findById(request.engagementId).lean()
      : null,
  ]);

  const fy = engagement?.periodStart
    ? `FY${financialYearLabel(new Date(engagement.periodStart))}`
    : `FY${financialYearLabel(new Date())}`;

  const key = buildFileKey({
    clientCode: client?.code ?? "unfiled",
    filename: input.filename,
    fy,
    serviceCode: engagement?.templateSnapshot?.code,
    engagementCode: engagement?.code,
  });

  return { ok: true, key, fy, ...getUploadTicket({ key }) };
}

/**
 * Step two: the gateway has the bytes, so record the document and move the
 * checklist item to Received.
 * @param {string} token
 * @param {object} input
 */
export async function publicConfirmUpload(token, input) {
  const found = await openRequest(token);
  if (found.error) return found;
  const request = found.request;

  const item = request.items.id(input.itemId);
  if (!item) return { error: "That is not something we asked for." };
  if (!input.key || !input.checksum) {
    return { error: "The upload did not finish. Please try again." };
  }

  await systemAudit(async (session) => {
    const [document] = await DocumentModel.create(
      [
        {
          name: input.filename,
          fileKey: input.key,
          size: input.size ?? 0,
          mime: input.mime ?? "application/octet-stream",
          checksum: input.checksum,
          fy: input.fy ?? "",
          clientId: request.clientId,
          engagementId: request.engagementId,
          checklistItemId: item.checklistItemId,
          branchId: request.branchId,
          uploadedBy: null,
          uploadedByName: "The client",
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
        clientId: request.clientId,
        note: `uploaded by the client through request ${request.tokenHint}…: ${input.filename}`,
      },
      session,
    );

    item.receivedCount += 1;
    request.uploadCount += 1;
    request.lastUsedAt = new Date();
    await request.save({ session });

    if (request.engagementId && item.checklistItemId) {
      const engagement = await Engagement.findById(
        request.engagementId,
      ).session(session);
      const row = engagement?.checklist?.id(item.checklistItemId);
      if (row) {
        row.documentIds.push(document._id);
        // the firm still has to verify it; received is as far as the client
        // can move anything
        if (row.status !== "Verified") {
          row.status = "Received";
          row.receivedAt = new Date();
        }
        await engagement.save({ session });
      }
    }
  });

  if (request.engagementId) {
    revalidatePath(`/engagements/${request.engagementId}`);
  }
  return { ok: `${input.filename} received. Thank you.` };
}
