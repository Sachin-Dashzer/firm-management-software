"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import FirmSettings from "@/models/FirmSettings";
import User from "@/models/User";
import { clearFirmCache } from "@/lib/firm/settings";
import { FIRM_CONSTITUTIONS, CPE_YEAR_BASES } from "@/lib/firm/profile";

/**
 * The firm's own record, its members' ICAI details, and the CPE log.
 *
 * Two permissions meet on this screen and they are checked apart:
 * `firmProfile` for the firm's name, FRN and targets (Partner only), and
 * `icai` with an `own` scope for a member's own record and log — a CA keeps
 * their own membership and hours, which is how it works in a real firm.
 */

const firmInput = z.object({
  name: z.string().trim().min(2, "The firm needs a name"),
  tagline: z.string().trim().max(80).default(""),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "That is not a valid PAN")
    .or(z.literal("")),
  headOffice: z.string().trim().max(300).default(""),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Not an email address")
    .or(z.literal("")),
  phone: z.string().trim().max(20).default(""),

  frn: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{6}[A-Z]?$/, "An FRN is six digits, sometimes with a letter")
    .or(z.literal("")),
  constitution: z.enum(FIRM_CONSTITUTIONS),
  peerReviewValidTill: z.string().trim().default(""),
  icaiNotes: z.string().max(8000).default(""),

  cpeTargetStructured: z.coerce.number().min(0).max(200),
  cpeTargetUnstructured: z.coerce.number().min(0).max(200),
  cpeYearBasis: z.enum(CPE_YEAR_BASES),

  retentionYears: z.coerce.number().int().min(1).max(25),
});

/** Save the firm's own record. Partner only — this is the letterhead. */
export async function saveFirm(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "firmProfile");

  const parsed = firmInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  await connectDB();

  await audited(actor, async (session) => {
    // one document, for ever: an upsert on the unique key cannot fork
    const firm =
      (await FirmSettings.findOne({ key: "firm" }).session(session)) ??
      new FirmSettings({ key: "firm" });

    firm.set({
      ...data,
      peerReviewValidTill: data.peerReviewValidTill
        ? new Date(data.peerReviewValidTill)
        : null,
      updatedBy: actor.id,
    });
    await firm.save({ session });
  });

  clearFirmCache();
  // the name reaches invoices, reports and emails, so nothing may stay stale
  revalidatePath("/settings/icai");
  revalidatePath("/billing");

  return {
    ok: `Saved. ${data.name} is the name on every invoice and email from now on.`,
  };
}

/**
 * A member's own ICAI record.
 *
 * `own` scope means a CA may save theirs and nobody else's; a Partner may
 * save anybody's. The check is on the server with the target, so a hidden
 * form is not what stops it.
 */
export async function saveMemberIcai(userId, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "icai", { userId: String(userId) });

  await connectDB();
  const person = await User.findById(userId);
  if (!person) return { error: "That person no longer exists." };

  const membershipNo = String(formData.get("membershipNo") ?? "").trim();
  const grade = String(formData.get("grade") ?? "");
  if (!["", "ACA", "FCA"].includes(grade)) {
    return { error: "A grade is ACA or FCA." };
  }
  if (membershipNo && !/^\d{5,6}$/.test(membershipNo)) {
    return { error: "A membership number is five or six digits." };
  }

  const admittedOn = String(formData.get("admittedOn") ?? "");
  const copFrom = String(formData.get("copFrom") ?? "");
  const copHeld = formData.get("copHeld") === "on";

  await audited(actor, async (session) => {
    person.icai = {
      membershipNo,
      grade,
      admittedOn: admittedOn ? new Date(admittedOn) : null,
      copHeld,
      copFrom: copFrom ? new Date(copFrom) : null,
    };
    person.updatedBy = actor.id;
    await person.save({ session });
  });

  revalidatePath("/settings/icai");
  revalidatePath(`/team/${userId}`);
  return { ok: `${person.name}'s ICAI record saved.` };
}

/** Add one programme to a member's CPE log. */
export async function addCpe(userId, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "icai", { userId: String(userId) });

  await connectDB();
  const person = await User.findById(userId);
  if (!person) return { error: "That person no longer exists." };

  const on = String(formData.get("on") ?? "");
  const hours = Number(formData.get("hours"));
  const programme = String(formData.get("programme") ?? "").trim();
  const organiser = String(formData.get("organiser") ?? "").trim();
  const kind =
    formData.get("kind") === "unstructured" ? "unstructured" : "structured";

  if (!on) return { error: "When was it?" };
  if (new Date(on) > new Date()) {
    return { error: "That is in the future. Log it after you attend." };
  }
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 24) {
    return { error: "Hours are between 0.5 and 24." };
  }
  if (!programme) return { error: "What was the programme?" };

  await audited(actor, async (session) => {
    person.cpe.push({
      on: new Date(on),
      hours,
      kind,
      programme,
      organiser,
      createdBy: actor.id,
    });
    person.updatedBy = actor.id;
    await person.save({ session });
  });

  revalidatePath("/settings/icai");
  return { ok: `${hours} ${hours === 1 ? "hour" : "hours"} logged.` };
}

/**
 * Take an entry back out.
 *
 * A CPE log is the firm's own record of what somebody attended, not a
 * statutory register, so a mistyped entry is removed rather than reversed —
 * but the audit log keeps what was there, like every other change.
 */
export async function removeCpe(userId, entryId) {
  const actor = await requireUser();
  assertCan(actor, "edit", "icai", { userId: String(userId) });

  await connectDB();
  const person = await User.findById(userId);
  if (!person) return { error: "That person no longer exists." };

  const entry = person.cpe.id(entryId);
  if (!entry) return { ok: "Already gone." };

  await audited(actor, async (session) => {
    entry.deleteOne();
    person.updatedBy = actor.id;
    await person.save({ session });
  });

  revalidatePath("/settings/icai");
  return { ok: "Entry removed." };
}
