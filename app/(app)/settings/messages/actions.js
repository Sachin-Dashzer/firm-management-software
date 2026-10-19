"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import NotificationRule from "@/models/NotificationRule";
import { RULE_DEFAULTS, clearRuleCache } from "@/lib/mailer/rules";
import { TEMPLATES } from "@/lib/mailer/templates";

/**
 * Changing a notification rule (spec section 12).
 *
 * Only the firm's *changes* are stored, so saving the defaults back
 * deletes the row rather than freezing today's defaults into the database.
 *
 * Every change is audited, because "why was nobody reminded" is a question
 * that gets asked months later, and the answer is usually that somebody
 * switched a rule off for a good reason and forgot.
 */

const input = z.object({
  enabled: z.boolean(),
  daysBefore: z.array(z.coerce.number().int().min(0).max(90)).max(4).optional(),
  everyDays: z.coerce.number().int().min(1).max(90).optional(),
  maxReminders: z.coerce.number().int().min(1).max(20).optional(),
  atIST: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00")
    .optional(),
  subject: z.string().trim().max(200).optional(),
  body: z.string().max(4000).optional(),
});

/**
 * @param {string} key
 * @param {FormData} formData
 */
export async function saveRule(key, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  const fallback = RULE_DEFAULTS[key];
  if (!fallback) return { error: "There is no such message." };

  const days = String(formData.get("daysBefore") ?? "").trim();
  const parsed = input.safeParse({
    enabled: formData.get("enabled") === "on",
    daysBefore: days
      ? days
          .split(/[,\s]+/)
          .filter(Boolean)
          .map(Number)
      : undefined,
    everyDays: formData.get("everyDays") || undefined,
    maxReminders: formData.get("maxReminders") || undefined,
    atIST: formData.get("atIST") || undefined,
    subject: formData.get("subject") ?? undefined,
    body: formData.get("body") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const wanted = parsed.data;
  const template = TEMPLATES[key];

  // wording the same as the code's own is not an override
  const subject =
    wanted.subject && wanted.subject !== template?.subject
      ? wanted.subject
      : "";
  const body =
    wanted.body && wanted.body.trim() !== template?.body.trim()
      ? wanted.body
      : "";

  const sameTiming =
    String(wanted.daysBefore ?? "") === String(fallback.daysBefore ?? "") &&
    (wanted.everyDays ?? null) === (fallback.everyDays ?? null) &&
    (wanted.maxReminders ?? null) === (fallback.maxReminders ?? null) &&
    (wanted.atIST ?? null) === (fallback.atIST ?? null);

  const isDefault =
    wanted.enabled === fallback.enabled && sameTiming && !subject && !body;

  await connectDB();

  await audited(actor, async (session) => {
    const existing = await NotificationRule.findOne({ key }).session(session);

    if (isDefault) {
      if (!existing) return;
      // back to how the system ships: the row is emptied, not deleted
      // (nothing is hard-deleted), so the rule follows the code again
      existing.set({
        enabled: fallback.enabled,
        daysBefore: undefined,
        everyDays: undefined,
        maxReminders: undefined,
        atIST: undefined,
        subject: "",
        body: "",
        updatedBy: actor.id,
      });
      await existing.save({ session });
      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "NotificationRule",
          entityId: existing._id,
          note: `${actor.name} put "${key}" back to its default settings`,
        },
        session,
      );
      return;
    }

    const row = existing ?? new NotificationRule({ key });
    const was = row.enabled;

    row.enabled = wanted.enabled;
    row.daysBefore = wanted.daysBefore;
    row.everyDays = wanted.everyDays;
    row.maxReminders = wanted.maxReminders;
    row.atIST = wanted.atIST;
    row.subject = subject;
    row.body = body;
    row.updatedBy = actor.id;
    await row.save({ session });

    if (existing && was !== wanted.enabled) {
      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "NotificationRule",
          entityId: row._id,
          note: `${actor.name} switched "${key}" ${wanted.enabled ? "on" : "off"}`,
        },
        session,
      );
    }
  });

  clearRuleCache();
  revalidatePath("/settings/messages");

  return {
    ok: wanted.enabled
      ? `Saved. ${template?.what ?? key}`
      : "Saved. This message will not be sent to anyone.",
  };
}
