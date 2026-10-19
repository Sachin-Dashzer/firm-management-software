"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";

/**
 * Changing your own password.
 *
 * Open since Step 1: `mustChangePassword` was written when a partner created
 * an account, reset a password or imported the team, and read nowhere — and
 * there was no way for anybody to change their own password at all. A
 * one-time password read out across a desk stayed that person's password.
 *
 * The current password is required even though the session already proves who
 * they are. A session is a cookie on a machine that may be borrowed; the
 * password is the thing only they know, and this is the action that replaces
 * it.
 */

/** Spec section 16 has no length; `hashPassword` refuses under ten. */
const MIN_LENGTH = 10;

/**
 * @param {unknown} _prev
 * @param {FormData} formData
 */
export async function changeOwnPassword(_prev, formData) {
  const actor = await requireUser();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const again = String(formData.get("again") ?? "");

  if (!current) return { error: "Type your current password." };
  if (next.length < MIN_LENGTH) {
    return { error: `A password needs at least ${MIN_LENGTH} characters.` };
  }
  if (next !== again) return { error: "The two new passwords are different." };
  if (next === current) {
    return { error: "That is the password you already have." };
  }

  await connectDB();
  const user = await User.findById(actor.id).select("+passwordHash");
  if (!user) return { error: "Your account no longer exists." };

  const ok = user.passwordHash
    ? await verifyPassword(current, user.passwordHash)
    : false;
  if (!ok) return { error: "That is not your current password." };

  const passwordHash = await hashPassword(next);

  await audited(actor, async (session) => {
    await User.updateOne(
      { _id: actor.id },
      {
        $set: {
          passwordHash,
          mustChangePassword: false,
          failedLogins: 0,
          lockedUntil: null,
          updatedBy: actor.id,
        },
      },
      { session },
    );
    // the password itself is never written to the log (CLAUDE.md rule 7)
    await recordAudit(
      {
        action: ACTIONS.passwordReset,
        entityType: "User",
        entityId: actor.id,
        note: "changed their own password",
      },
      session,
    );
  });

  revalidatePath("/me");
  return { ok: "Password changed." };
}
