"use server";

import { revalidatePath } from "next/cache";
import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Engagement from "@/models/Engagement";
import { engagementScope } from "@/lib/access/clientScope";
import {
  clientCannotProvide,
  clientDelegates,
  clientAsks,
} from "@/lib/engagements/checklist";
import { createDelegateRequest } from "@/lib/documents/delegate";

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
 * A client still cannot upload here. That stays on the token link, which has
 * its own narrow scope — a second way into the vault is a second thing to
 * get wrong.
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
