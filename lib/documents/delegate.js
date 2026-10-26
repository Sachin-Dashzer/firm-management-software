// @ts-check

import DocRequest from "../../models/DocRequest.js";
import Client from "../../models/Client.js";
import { systemAudit } from "../audit/system.js";
import { recordAudit, ACTIONS } from "../audit/index.js";
import {
  newRequestToken,
  hashRequestToken,
  requestExpiry,
  requestLink,
} from "../storage/requests.js";
import { notify } from "../mailer/notify.js";

/**
 * An upload link for one item, for somebody who is not the client (P3-2).
 *
 * The client's accountant usually has the file. Before this, the only ways
 * to get it were to forward the client's own link — which covers every
 * outstanding item on the job — or to give the accountant a portal login.
 *
 * So the client names them and **we** mint the link. Three things make it
 * narrow:
 *
 * - **one item**, not the job's outstanding list. The delegate sees the name
 *   of the thing they were asked for and nothing else about the engagement
 * - the same seven-day expiry, the same hashed token, the same upload-only
 *   gateway as any other request — nothing new was built to hold it
 * - the client never holds the token. A portal user minting a link that
 *   works without signing in is an escalation; this way the effect is the
 *   same and the capability is not handed over
 *
 * Written with `systemAudit` because the client asked for it and no member
 * of the firm is in the room; the entry says who asked.
 *
 * @param {object} args
 * @param {any} args.engagement
 * @param {any} args.item the checklist item, already saved
 * @param {{ name: string, contact: string }} args.delegate
 * @param {string} args.askedBy the portal user's name
 */
export async function createDelegateRequest({
  engagement,
  item,
  delegate,
  askedBy,
}) {
  const token = newRequestToken();
  const client = await Client.findById(engagement.clientId)
    .select("legalName tradeName")
    .lean();

  const looksLikeEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(delegate.contact);

  await systemAudit(async (session) => {
    const [request] = await DocRequest.create(
      [
        {
          tokenHash: hashRequestToken(token),
          tokenHint: token.slice(0, 6),
          clientId: engagement.clientId,
          engagementId: engagement._id,
          branchId: engagement.branchId,
          // exactly one item: that is the whole point
          items: [
            {
              checklistItemId: item._id,
              name: item.name,
              mandatory: item.mandatory,
            },
          ],
          expiresAt: requestExpiry(),
          message: `${askedBy} asked you to send this one document to ${
            client?.tradeName || client?.legalName || "their accountants"
          }.`,
          sentVia: looksLikeEmail ? "email" : "link",
          sentAt: looksLikeEmail ? new Date() : null,
          delegate: {
            name: delegate.name,
            contact: delegate.contact,
            askedBy,
          },
          createdBy: "client-portal",
          createdByName: `${askedBy} (client)`,
          updatedBy: "client-portal",
        },
      ],
      { session },
    );

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "DocRequest",
        entityId: request._id,
        clientId: engagement.clientId,
        note: `One-item upload link created for ${delegate.name} (${delegate.contact}) at ${askedBy}'s request: ${item.name}`,
      },
      session,
    );

    /**
     * Only an email address can be sent to from here. A mobile number waits
     * for WhatsApp, which waits on the provider decision still open in spec
     * section 18 — so the firm sees the link on the job and sends it by
     * hand rather than the request silently going nowhere.
     */
    if (looksLikeEmail) {
      await notify(
        {
          template: "documentRequest",
          to: [{ email: delegate.contact, clientName: delegate.name }],
          values: {
            service: engagement.templateSnapshot?.name ?? "their work",
            items: `- ${item.name}`,
            link: requestLink(token),
            messageLine: `\n\n${askedBy} at ${
              client?.tradeName || client?.legalName || "the client"
            } asked us to collect this from you. The link covers this one document and nothing else.`,
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
  });

  return { sent: looksLikeEmail };
}
