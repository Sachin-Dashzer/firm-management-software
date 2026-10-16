"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan, ROLES } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { hashPassword } from "@/lib/crypto";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";

/**
 * User management, Partner only.
 *
 * Every action starts with `assertCan`, so the check cannot be skipped by
 * calling the action directly — server actions are reachable over HTTP
 * whether or not a button for them is rendered — and every change runs inside
 * `audited()`, which opens the transaction the change and its audit entry
 * share (spec section 11).
 */

const userInput = z.object({
  name: z.string().trim().min(2, "Name is too short"),
  email: z.string().trim().toLowerCase().email("Not a valid email address"),
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Mobile must be 10 digits starting 6-9")
    .or(z.literal("")),
  role: z.enum(ROLES),
  branchIds: z.array(z.string()).min(1, "Choose at least one branch"),
  reportingTo: z.string().optional(),
  capacityHours: z.coerce.number().min(0).max(24).default(8),
  icaiRegNo: z.string().trim().optional(),
  articleshipStart: z.string().optional(),
  articleshipEnd: z.string().optional(),
});

/** A readable one-time password: 4 groups of 4, no lookalike characters. */
function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/** Pull the plain object out of a form, including multi-select branches. */
function readForm(formData) {
  return {
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    mobile: formData.get("mobile") ?? "",
    role: formData.get("role") ?? "",
    branchIds: formData.getAll("branchIds").map(String),
    reportingTo: formData.get("reportingTo") || undefined,
    capacityHours: formData.get("capacityHours") ?? 8,
    icaiRegNo: formData.get("icaiRegNo") ?? "",
    articleshipStart: formData.get("articleshipStart") ?? "",
    articleshipEnd: formData.get("articleshipEnd") ?? "",
  };
}

/**
 * Create a team member and return the one-time password to read out to them.
 * Email delivery arrives with the mailer in Step 9.
 */
export async function createUser(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  const parsed = userInput.safeParse(readForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  await connectDB();
  if (await User.findOne({ email: data.email })) {
    return { error: "Someone already has that email address." };
  }

  const password = temporaryPassword();
  const isIntern = data.role === "intern";

  try {
    // the audit entry for the create is written by the model's audit plugin,
    // inside this same transaction
    await audited(actor, async (session) => {
      await User.create(
        [
          {
            name: data.name,
            email: data.email,
            mobile: data.mobile,
            role: data.role,
            branchIds: data.branchIds,
            reportingTo: data.reportingTo || null,
            capacityHours: data.capacityHours,
            isIntern,
            articleship: isIntern
              ? {
                  icaiRegNo: data.icaiRegNo || "",
                  start: data.articleshipStart || undefined,
                  expectedEnd: data.articleshipEnd || undefined,
                }
              : undefined,
            passwordHash: await hashPassword(password),
            mustChangePassword: true,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath("/settings/users");
  return {
    ok: `${data.name} added. One-time password: ${password} — give it to them directly; they must change it and set up 2FA at first sign-in.`,
  };
}

/** Change someone's role (logged as its own action, spec section 11). */
export async function changeRole(userId, role) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");
  if (!ROLES.includes(role)) return { error: "Unknown role." };

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return { error: "That person no longer exists." };
  if (user.role === role) return { ok: "No change." };
  if (userId === actor.id) {
    return { error: "You cannot change your own role. Ask another partner." };
  }

  const before = user.role;
  await audited(actor, async (session) => {
    await User.updateOne(
      { _id: userId },
      { $set: { role, isIntern: role === "intern", updatedBy: actor.id } },
      { session },
    );
    await recordAudit(
      {
        action: ACTIONS.roleChange,
        entityType: "User",
        entityId: userId,
        diff: { role: [before, role] },
      },
      session,
    );
  });

  revalidatePath("/settings/users");
  return { ok: `Role changed to ${role}.` };
}

/** Turn an account off (instant force-logout, spec section 16) or back on. */
export async function setUserActive(userId, active) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  if (userId === actor.id && !active) {
    return { error: "You cannot deactivate your own account." };
  }

  await connectDB();
  await audited(actor, async (session) => {
    await User.updateOne(
      { _id: userId },
      { $set: { active: Boolean(active), updatedBy: actor.id } },
      { session },
    );
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "User",
        entityId: userId,
        diff: { active: [!active, Boolean(active)] },
        note: active ? "account activated" : "account deactivated",
      },
      session,
    );
  });

  revalidatePath("/settings/users");
  return { ok: active ? "Account activated." : "Account deactivated." };
}

/** Issue a new one-time password; the old one stops working immediately. */
export async function resetPassword(userId) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  await audited(actor, async (session) => {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash,
          mustChangePassword: true,
          failedLogins: 0,
          lockedUntil: null,
          updatedBy: actor.id,
        },
      },
      { session },
    );
    // the new password itself is never written to the log
    await recordAudit(
      {
        action: ACTIONS.passwordReset,
        entityType: "User",
        entityId: userId,
      },
      session,
    );
  });

  revalidatePath("/settings/users");
  return { ok: `New one-time password: ${password}` };
}

/**
 * Clear someone's 2FA — for a lost or replaced phone. They set it up again at
 * their next sign-in, which is forced because the account has no secret.
 */
export async function reset2FA(userId) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  await audited(actor, async (session) => {
    await User.updateOne(
      { _id: userId },
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
        entityId: userId,
      },
      session,
    );
  });

  revalidatePath("/settings/users");
  return { ok: "Two-factor reset. They will scan a new QR code next sign-in." };
}
