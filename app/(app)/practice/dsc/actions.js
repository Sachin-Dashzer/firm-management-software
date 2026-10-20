"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import Dsc from "@/models/Dsc";
import Client from "@/models/Client";
import { DSC_CLASSES, DSC_HOLDERS } from "@/lib/practice/dsc";

/**
 * The DSC register (P2-7): a list of whose certificate expires when.
 *
 * The firm does not hold clients' tokens (owner decision, 19-10-2026), so
 * there is nothing here about custody — and nothing anywhere about a PIN,
 * which is a credential and belongs in the encrypted vault, not on a
 * register half the firm can read.
 */

/** Read the form, the same way for a new row and an edit. */
function readForm(formData) {
  return {
    clientId: String(formData.get("clientId") ?? ""),
    holderName: String(formData.get("holderName") ?? "").trim(),
    holderRole: String(formData.get("holderRole") ?? "").trim(),
    certClass: String(formData.get("certClass") ?? ""),
    issuer: String(formData.get("issuer") ?? "").trim(),
    serial: String(formData.get("serial") ?? "").trim(),
    validFrom: String(formData.get("validFrom") ?? ""),
    validTill: String(formData.get("validTill") ?? ""),
    heldBy: String(formData.get("heldBy") ?? "client"),
    note: String(formData.get("note") ?? "").trim(),
  };
}

function check(data) {
  if (!data.clientId) return "Which client is it for?";
  if (!data.holderName) return "Whose certificate is it?";
  if (!data.validTill) return "When does it expire?";
  if (data.certClass && !DSC_CLASSES.includes(data.certClass)) {
    return "That is not a certificate class we know.";
  }
  if (!DSC_HOLDERS.includes(data.heldBy)) return "Who has it?";
  if (data.validFrom && new Date(data.validFrom) > new Date(data.validTill)) {
    return "It cannot expire before it starts.";
  }
  return null;
}

/** Add a certificate to the register. */
export async function addDsc(_prev, formData) {
  const actor = await requireUser();
  const data = readForm(formData);

  const wrong = check(data);
  if (wrong) return { error: wrong };

  await connectDB();
  const client = await Client.findById(data.clientId)
    .select("branchId legalName tradeName")
    .lean();
  if (!client) return { error: "That client no longer exists." };
  assertCan(actor, "edit", "dsc", { branchId: String(client.branchId) });

  /**
   * The same person's certificate with the same expiry, twice, is somebody
   * entering it again rather than a second certificate — and a register with
   * two of everything is read by nobody.
   */
  const twin = await Dsc.findOne({
    clientId: data.clientId,
    holderName: data.holderName,
    validTill: new Date(data.validTill),
  })
    .select("_id")
    .lean();
  if (twin) {
    return {
      error: `${data.holderName}'s certificate with that expiry is already in the register.`,
    };
  }

  await audited(actor, async (session) => {
    await Dsc.create(
      [
        {
          ...data,
          branchId: client.branchId,
          validFrom: data.validFrom ? new Date(data.validFrom) : null,
          validTill: new Date(data.validTill),
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
  });

  revalidatePath("/practice/dsc");
  revalidatePath(`/clients/${data.clientId}`);
  return {
    ok: `${data.holderName}'s certificate added, expiring ${data.validTill}.`,
  };
}

/** Correct a certificate, or record a renewal's new dates. */
export async function updateDsc(id, formData) {
  const actor = await requireUser();
  const data = readForm(formData);

  await connectDB();
  const row = await Dsc.findById(id);
  if (!row) return { error: "That certificate is no longer in the register." };
  assertCan(actor, "edit", "dsc", { branchId: String(row.branchId) });

  // the client is not editable here: a certificate belongs to whoever it
  // belongs to, and moving one between clients is adding a different one
  const wrong = check({ ...data, clientId: String(row.clientId) });
  if (wrong) return { error: wrong };

  await audited(actor, async (session) => {
    row.set({
      holderName: data.holderName,
      holderRole: data.holderRole,
      certClass: data.certClass,
      issuer: data.issuer,
      serial: data.serial,
      validFrom: data.validFrom ? new Date(data.validFrom) : null,
      validTill: new Date(data.validTill),
      heldBy: data.heldBy,
      note: data.note,
      updatedBy: actor.id,
    });
    await row.save({ session });
  });

  revalidatePath("/practice/dsc");
  revalidatePath(`/clients/${row.clientId}`);
  return { ok: `${row.holderName}'s certificate saved.` };
}

/**
 * Take a certificate off the register — soft delete, like everything else
 * (CLAUDE.md rule 3). Used when a row was entered twice or for the wrong
 * client; a certificate that has simply expired stays, in red.
 */
export async function removeDsc(id) {
  const actor = await requireUser();

  await connectDB();
  const row = await Dsc.findById(id);
  if (!row) return { ok: "Already gone." };
  assertCan(actor, "edit", "dsc", { branchId: String(row.branchId) });

  await audited(actor, async (session) => {
    row.updatedBy = actor.id;
    await row.softDelete(actor.id, { session });
  });

  revalidatePath("/practice/dsc");
  return { ok: "Taken off the register." };
}
