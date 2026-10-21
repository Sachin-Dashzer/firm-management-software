"use server";

import { revalidatePath } from "next/cache";
import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Comment from "@/models/Comment";
import Client from "@/models/Client";
import { notify } from "@/lib/mailer/notify";

/**
 * A client asking for something on their record to be corrected (P2-9b).
 *
 * **It does not change anything.** A GSTIN the client retyped and nobody
 * checked is worse than a stale one: it goes onto invoices, into returns
 * and into the compliance grid. So this writes a request, tells the people
 * responsible for the client, and leaves the record exactly as it was.
 *
 * It is the only write a portal account can make anywhere in the system,
 * and it is a comment — the collection that already holds the client
 * communication log, which is where a request like this belongs anyway.
 */

const MAX = 2000;

export async function requestChange(_prev, formData) {
  const person = await requireClientUser();

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 5) {
    return { error: "Tell us what needs changing." };
  }
  if (body.length > MAX) {
    return { error: `That is longer than ${MAX} characters. Please shorten it.` };
  }

  await connectDB();
  const client = await Client.findById(person.clientId)
    .select("legalName tradeName clientPartnerId relationshipManagerId")
    .lean();
  if (!client) return { error: "Your file is not available. Please ring the office." };

  const actor = {
    id: person.id,
    name: person.name,
    role: "client",
    kind: "client",
  };

  await audited(actor, async (session) => {
    const [comment] = await Comment.create(
      [
        {
          entityType: "Client",
          entityId: client._id,
          clientId: client._id,
          kind: "Change request",
          // the one place in the system that writes this false by hand: it
          // defaults to true, and a request nobody outside can see would
          // defeat the point of having asked
          internal: false,
          body,
          createdBy: person.id,
          createdByName: `${person.name} (client)`,
        },
      ],
      { session },
    );

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "Comment",
        entityId: String(comment._id),
        clientId: client._id,
        note: "change request from the client portal",
      },
      session,
    );

    /**
     * The client partner and the relationship manager. A request that
     * reached nobody is worse than no portal at all, so this goes with the
     * write rather than after it.
     */
    const to = [client.clientPartnerId, client.relationshipManagerId]
      .filter(Boolean)
      .map((id) => ({ id: String(id) }));

    if (to.length) {
      await notify(
        {
          template: "clientChangeRequest",
          to,
          values: {
            client: client.tradeName || client.legalName,
            who: person.name,
            designation: person.designation || "portal user",
            body,
            link: `/clients/${client._id}?tab=notes`,
          },
          about: {
            entityType: "Client",
            entityId: client._id,
            clientId: client._id,
            href: `/clients/${client._id}?tab=notes`,
          },
        },
        session,
      );
    }
  });

  revalidatePath("/client/profile");
  return {
    ok: "Thank you — we have passed that to the people who look after your file. Nothing has been changed yet.",
  };
}
