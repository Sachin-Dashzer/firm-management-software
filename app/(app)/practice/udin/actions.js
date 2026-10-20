"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import Udin from "@/models/Udin";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import User from "@/models/User";
import { checkUdinShape } from "@/lib/practice/udin";

/**
 * The UDIN register (P2-7).
 *
 * A UDIN is generated on the ICAI's portal, not here — these actions only
 * record one, correct a detail, or mark one revoked. Nothing ever deletes a
 * row: a number that was issued was issued, and the register's job is to say
 * what became of it.
 */

/** Record a UDIN that was generated on the portal. */
export async function recordUdin(_prev, formData) {
  const actor = await requireUser();

  const udin = String(formData.get("udin") ?? "")
    .trim()
    .toUpperCase();
  const shape = checkUdinShape(udin);
  if (!shape.ok) return { error: shape.error };

  const clientId = String(formData.get("clientId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  const documentType = String(formData.get("documentType") ?? "").trim();
  const generatedOn = String(formData.get("generatedOn") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!clientId) return { error: "Which client is it for?" };
  if (!documentType) return { error: "What was signed?" };
  if (!generatedOn) return { error: "When was it generated?" };
  if (new Date(generatedOn) > new Date()) {
    return { error: "That is in the future." };
  }

  await connectDB();
  const client = await Client.findById(clientId).select("branchId").lean();
  if (!client) return { error: "That client no longer exists." };

  // a CA records UDINs for their own branches (spec section 2)
  assertCan(actor, "edit", "udin", { branchId: String(client.branchId) });

  const clash = await Udin.findOne({ udin }).select("documentType").lean();
  if (clash) {
    return {
      error: `That UDIN is already in the register, against ${clash.documentType}. A UDIN belongs to one document.`,
    };
  }

  const engagement = engagementId
    ? await Engagement.findById(engagementId)
    : null;
  if (engagementId && !engagement) {
    return { error: "That engagement no longer exists." };
  }
  if (engagement && String(engagement.clientId) !== clientId) {
    return { error: "That engagement belongs to a different client." };
  }

  const member = memberId
    ? await User.findById(memberId).select("icai").lean()
    : null;

  try {
    await audited(actor, async (session) => {
      await Udin.create(
        [
          {
            udin,
            clientId,
            engagementId: engagement?._id ?? null,
            branchId: client.branchId,
            memberId: memberId || null,
            membershipNo: member?.icai?.membershipNo ?? "",
            documentType,
            generatedOn: new Date(generatedOn),
            note,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );

      // the engagement's own field is a copy of the register (P2-7)
      if (engagement) {
        engagement.udin = udin;
        engagement.updatedBy = actor.id;
        await engagement.save({ session });
      }
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath("/practice/udin");
  if (engagement) revalidatePath(`/engagements/${engagementId}`);
  return { ok: `${udin} recorded.` };
}

/**
 * Mark a UDIN revoked on the portal, or take the revocation back.
 *
 * The engagement keeps the number: the document it was issued for still
 * carries it, and somebody reading the file later needs to see both the
 * number and that it was withdrawn.
 */
export async function setUdinRevoked(id, revoked, reason = "") {
  const actor = await requireUser();

  await connectDB();
  const row = await Udin.findById(id);
  if (!row) return { error: "That entry no longer exists." };
  assertCan(actor, "edit", "udin", { branchId: String(row.branchId) });

  if (revoked && !String(reason).trim()) {
    return { error: "Say why it was revoked." };
  }

  await audited(actor, async (session) => {
    row.revokedAt = revoked ? new Date() : null;
    row.revokeReason = revoked ? String(reason).trim() : "";
    row.updatedBy = actor.id;
    await row.save({ session });
  });

  revalidatePath("/practice/udin");
  return { ok: revoked ? `${row.udin} marked revoked.` : "Revocation lifted." };
}
