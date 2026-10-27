"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan, ROLES } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Engagement from "@/models/Engagement";
import ClientAccess from "@/models/ClientAccess";
import Leave from "@/models/Leave";
import { hashPassword } from "@/lib/crypto";
import { temporaryPassword } from "@/lib/security/password";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { checkAssignment } from "@/lib/engagements/assign";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { LEAVE_KINDS, checkLeave } from "@/lib/team/leave";
import { startOfISTDay, formatISTDate } from "@/lib/dates";

/**
 * Team administration. Moved here from `/settings/users` in P2-3, so the
 * actions sit beside the screens that use them.
 *
 * **Still Partner only** — every one of these asserts `usersSettings`, not
 * `team`. A CA reads their branch's team records (owner decision D2) and
 * creates, promotes and removes nobody.
 *
 * Every action starts with `assertCan`, because a server action is reachable
 * over HTTP whether or not a button for it is rendered, and every change runs
 * inside `audited()`, which opens the transaction the change and its audit
 * entry share (spec section 11).
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

/** Form fields arrive flat; branches arrive as a repeated field. */
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

function touched(id) {
  revalidatePath("/team");
  if (id) revalidatePath(`/team/${id}`);
}

/**
 * Create a team member and return the one-time password to read out to them.
 * The account cannot be used until they replace it (`mustChangePassword`,
 * enforced by the app layout since P2-3).
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

  touched();
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

  /**
   * A demotion can strand work. Somebody who was a CA may be the assignee on
   * A-tier engagements or the reviewer on anything, and neither is legal for
   * an employee — so the role change is refused until the work is moved,
   * rather than leaving engagements nobody may touch.
   */
  const stranded = await strandedBy(user, role);
  if (stranded.length > 0) {
    return {
      error: `${user.name} is still on work that an ${role} cannot do or review: ${stranded
        .slice(0, 3)
        .join(
          ", ",
        )}${stranded.length > 3 ? ` and ${stranded.length - 3} more` : ""}. Reassign it first.`,
    };
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

  touched(userId);
  return { ok: `Role changed to ${role}.` };
}

/**
 * Open work this person could no longer legally do or review in a new role.
 * Returns the engagement codes.
 */
async function strandedBy(user, role) {
  const open = await Engagement.find({
    status: { $nin: CLOSED_STATUSES },
    $or: [{ assigneeId: user._id }, { reviewerId: user._id }],
  })
    .select("code templateSnapshot assigneeId reviewerId")
    .lean();

  const after = { id: String(user._id), name: user.name, role };

  return open
    .filter((engagement) => {
      const isAssignee = String(engagement.assigneeId ?? "") === after.id;
      const result = checkAssignment(
        engagement.templateSnapshot ?? {},
        isAssignee ? after : null,
        isAssignee ? null : after,
      );
      return !result.ok;
    })
    .map((engagement) => engagement.code);
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

  touched(userId);
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
      { action: ACTIONS.passwordReset, entityType: "User", entityId: userId },
      session,
    );
  });

  touched(userId);
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
      { action: ACTIONS.twoFactorReset, entityType: "User", entityId: userId },
      session,
    );
  });

  touched(userId);
  return { ok: "Two-factor reset. They will scan a new QR code next sign-in." };
}

/**
 * The parts of someone's record that are not their role: which offices they
 * work in, who they report to, their capacity and what they can handle.
 */
export async function updateTeamMember(userId, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  const branchIds = formData.getAll("branchIds").map(String);
  const reportingTo = String(formData.get("reportingTo") ?? "");
  const capacityHours = Number(formData.get("capacityHours") ?? 8);
  const skills = String(formData.get("skills") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (branchIds.length === 0) {
    return { error: "Somebody has to belong to at least one office." };
  }
  if (
    !Number.isFinite(capacityHours) ||
    capacityHours < 0 ||
    capacityHours > 24
  ) {
    return { error: "Capacity is hours in a day, so 0 to 24." };
  }
  if (reportingTo && reportingTo === userId) {
    return { error: "Nobody reports to themselves." };
  }

  await connectDB();
  if (reportingTo) {
    const senior = await User.findById(reportingTo)
      .select("role active")
      .lean();
    if (!senior || senior.active === false) {
      return { error: "That senior is not here any more." };
    }
    if (!["ca", "partner"].includes(senior.role)) {
      return { error: "A reporting senior has to be a CA or a partner." };
    }
  }

  await audited(actor, (session) =>
    User.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          branchIds,
          reportingTo: reportingTo || null,
          capacityHours,
          skills,
          updatedBy: actor.id,
        },
      },
      { session },
    ),
  );

  touched(userId);
  return { ok: "Saved." };
}

/**
 * Offboarding (owner decision D6, 19-10-2026).
 *
 * **Deactivate and soft delete, never a hard delete.** Their history, their
 * audit entries and their authorship of everything they ever did stay exactly
 * where they are — a firm that deletes the person also deletes the answer to
 * "who prepared this return", which is the question an ICAI review asks.
 *
 * Refused while any open engagement is still theirs. The whole thing runs in
 * one transaction: either they are gone and their grants are revoked, or
 * nothing happened.
 *
 * Because the unique index on email is partial on `deletedAt: null`, the same
 * address can be used again later.
 */
export async function offboard(userId, reason) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");
  assertCan(actor, "approve", "deleteRecord");

  const why = String(reason ?? "").trim();
  if (why.length < 3) return { error: "Say why they are being offboarded." };
  if (userId === actor.id) {
    return { error: "You cannot offboard yourself. Ask another partner." };
  }

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return { error: "That person no longer exists." };
  if (user.role === "partner") {
    return {
      error:
        "A partner is not offboarded from a screen. Two partners should do this together.",
    };
  }

  const open = await Engagement.find({
    status: { $nin: CLOSED_STATUSES },
    $or: [{ assigneeId: userId }, { reviewerId: userId }],
  })
    .select("code")
    .lean();

  if (open.length > 0) {
    return {
      error: `${user.name} is still on ${open.length} open ${
        open.length === 1 ? "engagement" : "engagements"
      }. Reassign them first: ${open
        .slice(0, 3)
        .map((e) => e.code)
        .join(", ")}${open.length > 3 ? "…" : ""}`,
      blocking: open.map((e) => e.code),
    };
  }

  const grants = await ClientAccess.find({ userId, active: true });

  await audited(actor, async (session) => {
    for (const grant of grants) {
      grant.active = false;
      grant.revokedBy = actor.id;
      grant.revokedAt = new Date();
      grant.updatedBy = actor.id;
      await grant.save({ session });
    }

    user.active = false;
    user.updatedBy = actor.id;
    await user.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "User",
        entityId: userId,
        diff: { active: [true, false] },
        note: `offboarded: ${why}`,
      },
      session,
    );

    // soft delete last, and with the session, so the flag and its audit
    // entry stand or fall together (CLAUDE.md rule 2)
    await user.softDelete(actor.id, { session });
  });

  touched(userId);
  return {
    ok: `${user.name} has been offboarded. ${grants.length} ${
      grants.length === 1 ? "grant was" : "grants were"
    } revoked. Their work and their history are untouched, and the email address can be used again.`,
  };
}

/**
 * Record an absence, with the person who holds the work (P3-16).
 *
 * **A partner records it, and that is the approval** (owner decision,
 * 27-10-2026). There is deliberately no request-and-approve cycle: a
 * two-state workflow for a five-person firm is a second list to chase, and
 * a leave nobody approved would still have to be honoured when the person
 * does not turn up.
 *
 * Every rule `checkLeave` applies is applied here, on the server, because a
 * server action is reachable whether or not a form is rendered.
 */
export async function recordLeave(userId, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  const [person, cover] = await Promise.all([
    User.findById(userId).select("name active").lean(),
    User.findById(String(formData.get("coverId") ?? ""))
      .select("name active role")
      .lean(),
  ]);
  if (!person) return { error: "That person is not on the team." };
  if (!cover) {
    return {
      error:
        "Name who holds their work while they are away. An absence with nobody named is the one that loses a return.",
    };
  }
  if (cover.active === false) {
    return { error: `${cover.name}'s account is switched off.` };
  }

  const kind = String(formData.get("kind") ?? "Leave");
  if (!LEAVE_KINDS.includes(kind)) return { error: "Unknown kind of leave." };

  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!from || !to) return { error: "Both dates are needed." };

  const start = startOfISTDay(new Date(`${from}T00:00:00+05:30`));
  const end = startOfISTDay(new Date(`${to}T00:00:00+05:30`));

  /** Every live leave for either person, which is all `checkLeave` reads. */
  const leaves = await Leave.find({
    userId: { $in: [userId, cover._id] },
    to: { $gte: new Date(start.getTime() - 366 * 86400000) },
  }).lean();

  const check = checkLeave({
    userId: String(userId),
    coverId: String(cover._id),
    from: start,
    to: end,
    leaves,
    person,
    cover,
  });
  if (!check.ok) return { error: check.error };

  await audited(actor, async (session) => {
    const [row] = await Leave.create(
      [
        {
          userId,
          from: start,
          to: end,
          kind,
          coverId: cover._id,
          note: String(formData.get("note") ?? "").trim(),
          approvedBy: actor.id,
          approvedByName: actor.name,
          approvedAt: new Date(),
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "Leave",
        entityId: row._id,
        note: `${person.name} away ${formatISTDate(start)} to ${formatISTDate(end)} (${kind.toLowerCase()}), covered by ${cover.name}`,
      },
      session,
    );
  });

  revalidatePath(`/team/${userId}`);
  revalidatePath("/team/plan");
  return {
    ok: `Recorded. ${cover.name} holds ${person.name.split(" ")[0]}'s Issues and reminders from ${formatISTDate(start)} to ${formatISTDate(end)}.`,
  };
}

/**
 * Withdraw one.
 *
 * A soft delete like everything else (CLAUDE.md rule 3): a cover who held
 * somebody's work for three days of a cancelled fortnight did hold it, and
 * the mail that went to them is in the message log either way.
 */
export async function cancelLeave(leaveId, reason) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  const why = String(reason ?? "").trim();
  if (why.length < 3) return { error: "Say why it is being withdrawn." };

  await connectDB();
  const leave = await Leave.findById(leaveId);
  if (!leave) return { error: "That leave is already gone." };

  const person = await User.findById(leave.userId).select("name").lean();

  await audited(actor, async (session) => {
    leave.note = [leave.note, `Withdrawn: ${why}`].filter(Boolean).join(" · ");
    leave.updatedBy = actor.id;
    await leave.softDelete(actor.id, { session });

    await recordAudit(
      {
        action: ACTIONS.delete,
        entityType: "Leave",
        entityId: leave._id,
        note: `${person?.name ?? "Somebody"}'s leave of ${formatISTDate(leave.from)} withdrawn — ${why}`,
      },
      session,
    );
  });

  revalidatePath(`/team/${String(leave.userId)}`);
  revalidatePath("/team/plan");
  return { ok: "Withdrawn." };
}
