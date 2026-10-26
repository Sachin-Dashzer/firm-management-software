"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import DocRequest from "@/models/DocRequest";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import {
  hashRequestToken,
  newRequestToken,
  requestExpiry,
  requestLink,
  REQUEST_DAYS,
} from "@/lib/storage/requests";
import { notify } from "@/lib/mailer/notify";
import { isSettled, needsReview } from "@/lib/engagements/checklist";
import { mailSettings } from "@/lib/mailer/guard";

/**
 * Asking a client for documents (spec section 6).
 *
 * One click makes a link that lists only what is still outstanding. The
 * client opens it, uploads, and the files land on the right checklist rows —
 * no account, no password, seven days.
 *
 * The link can be emailed to the client's main contact, or copied and sent
 * however the firm likes — WhatsApp is Phase 2. The record of the request
 * is the same either way, and an emailed one is then chased every three
 * days, four times at most (spec section 12).
 */

/**
 * Make a request for the items still outstanding on an engagement.
 * @param {string} engagementId
 * @param {{ itemIds?: string[], message?: string, email?: boolean }} [options]
 */
export async function createDocRequest(engagementId, options = {}) {
  const actor = await requireUser();

  await connectDB();
  const engagement = await Engagement.findById(engagementId).lean();
  if (!engagement) return { error: "That engagement no longer exists." };

  assertCan(actor, "edit", "documents", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });

  // only ever ask for what the client still owes us
  const outstanding = (engagement.checklist ?? []).filter(
    (item) =>
      item.side === "client" &&
      /**
       * Outstanding means not settled and not already arrived (P3-2).
       * `Replacement requested` is outstanding — it is the case most worth
       * re-asking for — while `Accepted`, `Not required`, `Received` and
       * `Format checked` are not. Before P3-2 this list named two statuses
       * and would have re-asked for an item a CA had waived.
       */
      !isSettled(item) &&
      !needsReview(item) &&
      (!options.itemIds?.length || options.itemIds.includes(String(item._id))),
  );

  if (outstanding.length === 0) {
    return { error: "Nothing is outstanding from the client." };
  }

  const token = newRequestToken();
  const client = options.email
    ? await Client.findById(engagement.clientId)
        .select("legalName tradeName contacts invoiceEmail")
        .lean()
    : null;
  const contactEmail = options.email ? primaryEmail(client) : "";

  if (options.email && !contactEmail) {
    return {
      error:
        "This client has no contact email address. Add one on the client, or copy the link and send it yourself.",
    };
  }

  const created = await audited(actor, async (session) => {
    const [request] = await DocRequest.create(
      [
        {
          // only the hash is stored: the link itself is shown once, here
          tokenHash: hashRequestToken(token),
          tokenHint: token.slice(0, 6),
          clientId: engagement.clientId,
          engagementId: engagement._id,
          branchId: engagement.branchId,
          items: outstanding.map((item) => ({
            checklistItemId: item._id,
            name: item.name,
            mandatory: item.mandatory,
          })),
          expiresAt: requestExpiry(),
          message: String(options.message ?? "").trim(),
          sentVia: options.email ? "email" : "link",
          sentAt: options.email ? new Date() : null,
          lastReminderAt: options.email ? new Date() : null,
          createdBy: actor.id,
          createdByName: actor.name,
          updatedBy: actor.id,
        },
      ],
      { session },
    );

    // mark the items as asked for, so the engagement shows it is waiting
    const live = await Engagement.findById(engagement._id).session(session);
    for (const item of outstanding) {
      const row = live.checklist.id(item._id);
      if (row && row.status === "Pending") {
        row.status = "Requested";
        row.requestedAt = new Date();
      }
    }
    live.updatedBy = actor.id;
    await live.save({ session });

    if (options.email) {
      await notify(
        {
          template: "documentRequest",
          to: [{ email: contactEmail, clientName: client.legalName }],
          values: {
            service: engagement.templateSnapshot?.name ?? "your work",
            items: outstanding.map((item) => `- ${item.name}`).join("\n"),
            link: requestLink(token),
            messageLine: options.message
              ? `\n\n${String(options.message).trim()}`
              : "",
          },
          about: {
            entityType: "DocRequest",
            entityId: request._id,
            clientId: engagement.clientId,
          },
          inApp: false,
        },
        session,
      );
    }

    return request;
  });

  revalidatePath(`/engagements/${engagementId}`);
  const count = `${outstanding.length} ${outstanding.length === 1 ? "document" : "documents"}`;

  // if client email is not switched on yet, say so plainly and hand the
  // link back: better that the firm sends it themselves than believes a
  // client was written to who was not
  const delivered = options.email && mailSettings().clientsEnabled;

  return {
    ok: delivered
      ? `Asked ${contactEmail} for ${count}. The link works for ${REQUEST_DAYS} days, and we will follow up every three days, up to four times.`
      : options.email
        ? `Link made for ${count}, and the message to ${contactEmail} is written and logged — but client email is not switched on yet, so nothing has been delivered. Send this link yourself for now.`
        : `Link made for ${count}. It works for ${REQUEST_DAYS} days.`,
    // shown only when the client has not actually been written to
    link: delivered ? undefined : requestLink(token),
    id: String(created._id),
  };
}

/** The address a request goes to: the primary contact, else the first one. */
function primaryEmail(client) {
  const contacts = client?.contacts ?? [];
  const primary = contacts.find((c) => c.primary) ?? contacts[0];
  return primary?.email || client?.invoiceEmail || "";
}

/** Withdraw a link before it expires. */
export async function revokeDocRequest(id) {
  const actor = await requireUser();

  await connectDB();
  const request = await DocRequest.findById(id);
  if (!request) return { error: "That request is gone." };

  assertCan(actor, "edit", "documents", {
    branchId: String(request.branchId ?? ""),
  });

  await audited(actor, async (session) => {
    request.revokedAt = new Date();
    request.updatedBy = actor.id;
    await request.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "DocRequest",
        entityId: request._id,
        clientId: request.clientId,
        note: "upload link withdrawn",
      },
      session,
    );
  });

  if (request.engagementId) {
    revalidatePath(`/engagements/${request.engagementId}`);
  }
  return { ok: "That link no longer works." };
}

/** The links made for an engagement, for the screen to list. */
export async function requestsForEngagement(engagementId) {
  const actor = await requireUser();
  await connectDB();

  const engagement = await Engagement.findById(engagementId)
    .select("branchId assigneeId reviewerId")
    .lean();
  if (!engagement) return [];

  assertCan(actor, "view", "documents", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });

  const requests = await DocRequest.find({ engagementId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const now = new Date();
  return requests.map((r) => ({
    id: String(r._id),
    hint: r.tokenHint,
    items: r.items.length,
    uploads: r.uploadCount,
    expiresAt: r.expiresAt,
    open: !r.revokedAt && new Date(r.expiresAt) > now,
    revoked: Boolean(r.revokedAt),
    by: r.createdByName,
  }));
}

/** Clients with documents still outstanding, firm-wide (spec section 6). */
export async function pendingFromClients(actor, branchScope) {
  await connectDB();

  const engagements = await Engagement.find({
    ...(branchScope ?? {}),
    status: { $nin: ["Completed", "Cancelled"] },
    checklist: {
      $elemMatch: {
        side: "client",
        status: { $in: ["Pending", "Requested"] },
        mandatory: true,
      },
    },
  })
    .sort({ internalDue: 1 })
    .limit(500)
    .lean();

  const clients = await Client.find({
    _id: { $in: engagements.map((e) => e.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const name = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  return engagements.map((e) => ({
    id: String(e._id),
    code: e.code,
    client: name.get(String(e.clientId)) ?? "Client",
    service: e.templateSnapshot?.name ?? "",
    period: e.periodLabel || e.period,
    status: e.status,
    internalDue: e.internalDue,
    waitingFor: e.checklist
      .filter(
        (i) =>
          i.side === "client" && ["Pending", "Requested"].includes(i.status),
      )
      .map((i) => i.name),
  }));
}
