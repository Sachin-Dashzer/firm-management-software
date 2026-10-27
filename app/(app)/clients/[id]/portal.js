"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import ClientUser from "@/models/ClientUser";
import Client from "@/models/Client";
import { hashPassword } from "@/lib/crypto";
import { temporaryPassword } from "@/lib/security/password";

/**
 * Portal accounts, from the firm's side (P2-9a).
 *
 * These are logins for people outside the firm, so the rules are tighter
 * than for anything else on the case file:
 *
 *  - **only a CA or a partner** may create, reset or close one;
 *  - **there is no self-registration**, here or anywhere;
 *  - the first password is a one-time one, read out or typed into an email
 *    by the firm, and the account cannot do anything until it is changed;
 *  - an account is **closed, never deleted** — who could see a client's file
 *    last year is part of the record.
 */

const invite = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  designation: z.string().trim().max(120).optional().default(""),
});

/** The permission every action here shares. */
async function gate(actor, clientId) {
  await connectDB();
  const client = await Client.findById(clientId)
    .select("branchId legalName tradeName")
    .lean();
  if (!client)
    throw Object.assign(new Error("No such client"), {
      code: "NOT_FOUND",
    });

  assertCan(actor, "edit", "clientPortalUsers", {
    branchId: String(client.branchId),
  });
  if (!["ca", "partner"].includes(actor.role)) {
    throw Object.assign(new Error("Not allowed"), { code: "FORBIDDEN" });
  }
  return client;
}

/**
 * Invite somebody to the portal. Returns the one-time password **once**, to
 * be read out — it is never stored in the clear and cannot be shown again.
 */
export async function invitePortalUser(clientId, formData) {
  const actor = await requireUser();
  const client = await gate(actor, clientId);

  const parsed = invite.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    designation: formData.get("designation") ?? "",
  });
  if (!parsed.success) {
    return { error: "A name and a working email address, please." };
  }
  const { name, email, designation } = parsed.data;

  /**
   * One account per email across the whole portal. Two companies sharing
   * an address would make a sign-in ambiguous, and the safe answer to an
   * ambiguous sign-in is to refuse the second account rather than guess.
   */
  const taken = await ClientUser.findOne({ email }).lean();
  if (taken) {
    return {
      error:
        String(taken.clientId) === String(clientId)
          ? "That email already has an account for this client."
          : "That email already has a portal account for another client. One account sees one company, so this person needs a different address.",
    };
  }

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  await audited(actor, async (session) => {
    const [created] = await ClientUser.create(
      [
        {
          name,
          email,
          designation,
          clientId: client._id,
          branchId: client.branchId,
          passwordHash,
          mustChangePassword: true,
          invitedBy: actor.id,
          invitedByName: actor.name,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "ClientUser",
        entityId: String(created._id),
        note: `portal account for ${email} on ${client.tradeName || client.legalName}`,
      },
      session,
    );
  });

  revalidatePath(`/clients/${clientId}`);
  return {
    ok: `Account created for ${name}.`,
    // shown once and never again: there is no copy of this anywhere
    password,
  };
}

/** Issue a new one-time password. The old one stops working immediately. */
export async function resetPortalPassword(clientId, userId) {
  const actor = await requireUser();
  await gate(actor, clientId);

  const person = await ClientUser.findOne({ _id: userId, clientId });
  if (!person) return { error: "That account is gone." };

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  await audited(actor, async (session) => {
    person.passwordHash = passwordHash;
    person.mustChangePassword = true;
    person.failedLogins = 0;
    person.lockedUntil = null;
    person.updatedBy = actor.id;
    await person.save({ session });

    await recordAudit(
      {
        action: ACTIONS.passwordReset,
        entityType: "ClientUser",
        entityId: String(person._id),
        note: `portal password reset for ${person.email}`,
      },
      session,
    );
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: `New password for ${person.name}.`, password };
}

/**
 * Close or reopen an account. Closing takes effect on the next request —
 * `currentClientUser()` reads the record live, so a session already open
 * stops working at once rather than in thirty minutes.
 */
export async function setPortalUserActive(clientId, userId, active) {
  const actor = await requireUser();
  await gate(actor, clientId);

  const person = await ClientUser.findOne({ _id: userId, clientId });
  if (!person) return { error: "That account is gone." };

  const on = Boolean(active);

  await audited(actor, async (session) => {
    person.active = on;
    person.updatedBy = actor.id;
    await person.save({ session });

    await recordAudit(
      {
        action: ACTIONS.statusChange,
        entityType: "ClientUser",
        entityId: String(person._id),
        note: on
          ? `portal access reopened for ${person.email}`
          : `portal access closed for ${person.email}`,
      },
      session,
    );
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: on ? "Access reopened." : "Access closed." };
}

/**
 * Require an authenticator app on this account, or stop requiring one.
 *
 * Turning it on clears any half-finished setup, so the next sign-in shows a
 * fresh QR rather than asking for a code from an app nobody has.
 */
export async function setPortalTwoFactor(clientId, userId, required) {
  const actor = await requireUser();
  await gate(actor, clientId);

  const person = await ClientUser.findOne({ _id: userId, clientId });
  if (!person) return { error: "That account is gone." };

  const on = Boolean(required);

  await audited(actor, async (session) => {
    person.totpRequired = on;
    if (on && !person.totpEnabledAt) {
      person.totpSecret = null;
    }
    person.updatedBy = actor.id;
    await person.save({ session });

    await recordAudit(
      {
        action: ACTIONS.twoFactorReset,
        entityType: "ClientUser",
        entityId: String(person._id),
        note: on
          ? `two-factor required for ${person.email}`
          : `two-factor no longer required for ${person.email}`,
      },
      session,
    );
  });

  revalidatePath(`/clients/${clientId}`);
  return {
    ok: on
      ? "They will be asked to set up an authenticator app next time they sign in."
      : "Two-factor is no longer required for this account.",
  };
}

/**
 * Let this person confirm the figures on a return, or stop them (P3-6).
 *
 * Deliberately separate from everything else a portal account can do. The
 * other rights are about seeing and uploading; this one is the client taking
 * responsibility for a number that goes to the department in their name.
 */
export async function setPortalMayConfirm(clientId, userId, may) {
  const actor = await requireUser();
  await gate(actor, clientId);

  const person = await ClientUser.findOne({ _id: userId, clientId });
  if (!person) return { error: "That account is gone." };

  const on = Boolean(may);

  await audited(actor, async (session) => {
    person.mayConfirmFigures = on;
    person.updatedBy = actor.id;
    await person.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "ClientUser",
        entityId: String(person._id),
        clientId,
        diff: { mayConfirmFigures: [!on, on] },
        note: on
          ? `${person.email} may now confirm figures before filing`
          : `${person.email} may no longer confirm figures`,
      },
      session,
    );
  });

  revalidatePath(`/clients/${clientId}`);
  return {
    ok: on
      ? "They can now confirm figures on the portal before a return is filed."
      : "They can no longer confirm figures.",
  };
}
