"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { verifyPassword } from "@/lib/crypto";
import { checkMobile } from "@/lib/validators";

/**
 * The two things somebody may change about their own record.
 *
 * Everything else on `/me` is a partner's to change: a person who can edit
 * their own role or branches has no role or branches worth enforcing, and the
 * permission matrix would be decoration.
 */

/** Your own mobile number — the one field on your record that is yours. */
export async function updateOwnMobile(formData) {
  const actor = await requireUser();
  const mobile = String(formData.get("mobile") ?? "").trim();

  if (mobile !== "") {
    const check = checkMobile(mobile);
    if (!check.ok) return { error: check.reason };
  }

  await connectDB();
  await audited(actor, (session) =>
    User.findOneAndUpdate(
      { _id: actor.id },
      { $set: { mobile, updatedBy: actor.id } },
      { session },
    ),
  );

  revalidatePath("/me");
  return { ok: mobile ? "Mobile number saved." : "Mobile number removed." };
}

/**
 * Start again with a new authenticator app — a replaced or lost phone.
 *
 * The current password is required. Without it, anybody who found an unlocked
 * laptop could move the second factor onto their own phone, which is the one
 * move that turns a borrowed session into a permanent account takeover. A
 * partner can also do this from the team screen, for somebody who cannot
 * sign in at all.
 */
export async function resetOwn2FA(formData) {
  const actor = await requireUser();
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Type your password to confirm." };

  await connectDB();
  const user = await User.findById(actor.id).select("+passwordHash");
  if (!user) return { error: "Your account no longer exists." };

  const ok = user.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false;
  if (!ok) return { error: "That is not your password." };

  await audited(actor, async (session) => {
    await User.updateOne(
      { _id: actor.id },
      {
        $set: {
          totpSecret: null,
          totpEnabledAt: null,
          lastTotpCounter: 0,
          updatedBy: actor.id,
        },
      },
      { session },
    );
    await recordAudit(
      {
        action: ACTIONS.twoFactorReset,
        entityType: "User",
        entityId: actor.id,
        note: "reset their own two-factor authentication",
      },
      session,
    );
  });

  revalidatePath("/me");
  return {
    ok: "Two-factor cleared. You will scan a new QR code at your next sign-in — so keep this session open until you have.",
  };
}
