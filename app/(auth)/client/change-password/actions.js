"use server";

import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import ClientUser from "@/models/ClientUser";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";

/**
 * A client changing their own portal password (P2-9a).
 *
 * The staff action's twin against the other collection. It is not shared
 * code because the two differ in the only line that matters — which
 * collection the account is in — and a single function taking "which
 * collection" as an argument is one wrong argument away from resetting the
 * wrong person's password.
 *
 * The current password is required even though the session proves who they
 * are: a session is a cookie on a machine that may be shared, and this is
 * the action that replaces the thing only they know.
 */

const MIN_LENGTH = 10;

export async function changeClientPassword(_prev, formData) {
  const person = await requireClientUser();

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
  const account = await ClientUser.findById(person.id).select("+passwordHash");
  if (!account || !account.active) {
    return { error: "Your account is no longer open. Please contact the office." };
  }

  const ok = account.passwordHash
    ? await verifyPassword(current, account.passwordHash)
    : false;
  if (!ok) return { error: "That is not your current password." };

  const passwordHash = await hashPassword(next);

  await audited(
    { id: person.id, name: person.name, role: "client", kind: "client" },
    async (session) => {
      await ClientUser.updateOne(
        { _id: person.id },
        {
          $set: {
            passwordHash,
            mustChangePassword: false,
            failedLogins: 0,
            lockedUntil: null,
            updatedBy: person.id,
          },
        },
        { session },
      );
      // the password itself is never written to the log (CLAUDE.md rule 7)
      await recordAudit(
        {
          action: ACTIONS.passwordReset,
          entityType: "ClientUser",
          entityId: person.id,
          note: "changed their own portal password",
        },
        session,
      );
    },
  );

  return { ok: "Password changed." };
}
