"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import Branch from "@/models/Branch";
import { checkGSTIN } from "@/lib/validators";
import { stateName } from "@/lib/billing/gst";

/**
 * The firm's own details. Partner only.
 *
 * The GSTIN matters more here than anywhere else in the app: it decides
 * the tax on every invoice the branch raises, so it is check-digit
 * validated rather than merely shaped, and the state it implies is shown
 * back for confirmation before it is used.
 */
export async function updateBranch(id, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  const branch = await Branch.findById(id);
  if (!branch) return { error: "That branch no longer exists." };

  const gstin = String(formData.get("gstin") ?? "")
    .trim()
    .toUpperCase();
  const address = String(formData.get("address") ?? "").trim();

  if (gstin) {
    const checked = checkGSTIN(gstin);
    if (!checked.ok) return { error: `GSTIN: ${checked.error}` };
    if (!stateName(gstin.slice(0, 2))) {
      return { error: "That GSTIN does not begin with a known state code." };
    }
  }

  const before = branch.gstin;

  await audited(actor, async (session) => {
    branch.gstin = gstin;
    branch.address = address;
    branch.updatedBy = actor.id;
    await branch.save({ session });
  });

  revalidatePath("/settings/branches");
  revalidatePath("/billing");

  if (gstin && gstin !== before) {
    return {
      ok: `${branch.code} registered in ${stateName(gstin.slice(0, 2))}. Invoices from this branch can now be issued.`,
    };
  }
  return { ok: `${branch.code} saved.` };
}
