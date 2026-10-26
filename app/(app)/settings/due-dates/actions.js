"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import DueDateRule from "@/models/DueDateRule";
import Engagement from "@/models/Engagement";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { statutoryDueFor, internalTargetFor } from "@/lib/compliance/dueDate";
import { applyDueDates } from "@/lib/engagements/milestones";
import { istInputDate } from "@/lib/dates";

/**
 * The statutory due-date master (spec section 8), Partner only.
 *
 * Three things happen here, and all three are deliberate acts by a named
 * person: confirming a rule is right, correcting one that is wrong, and
 * recording a government extension.
 *
 * Confirming is the important one. Until a partner confirms a rule, the
 * system will not put its date on any engagement (CLAUDE.md rule 8) — so
 * this screen is the gate between a draft we looked up and a deadline the
 * firm relies on.
 */

const formulaInput = z.object({
  kind: z.enum(["dayOfMonth", "daysAfterEvent"]),
  day: z.coerce.number().int().min(1).max(31).optional(),
  monthsAfter: z.coerce.number().int().min(0).max(24).optional(),
  event: z.string().trim().max(60).optional(),
  days: z.coerce.number().int().min(0).max(400).optional(),
});

/**
 * Confirm a rule is right. This is what lets the system start using it.
 * @param {string} id
 */
export async function verifyRule(id) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  const rule = await DueDateRule.findById(id);
  if (!rule) return { error: "That rule no longer exists." };
  if (rule.verifiedAt) return { ok: "Already confirmed." };

  await audited(actor, async (session) => {
    rule.verifiedAt = new Date();
    rule.verifiedBy = actor.id;
    rule.verifiedByName = actor.name;
    rule.updatedBy = actor.id;
    await rule.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "DueDateRule",
        entityId: rule._id,
        note: `${actor.name} confirmed the due-date rule for ${rule.serviceCode}`,
      },
      session,
    );
  });

  revalidatePath("/settings/due-dates");
  return {
    ok: `${rule.serviceCode} confirmed. New work on this service will carry its statutory date.`,
  };
}

/** Withdraw a confirmation — the date stops being applied to new work. */
export async function unverifyRule(id, reason = "") {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  const rule = await DueDateRule.findById(id);
  if (!rule) return { error: "That rule no longer exists." };

  await audited(actor, async (session) => {
    rule.verifiedAt = null;
    rule.verifiedBy = null;
    rule.verifiedByName = "";
    rule.updatedBy = actor.id;
    await rule.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "DueDateRule",
        entityId: rule._id,
        note: `${actor.name} withdrew confirmation of ${rule.serviceCode}${reason ? `: ${reason}` : ""}`,
      },
      session,
    );
  });

  revalidatePath("/settings/due-dates");
  return {
    ok: "Confirmation withdrawn. Existing engagements keep their dates.",
  };
}

/**
 * Correct a rule. Correcting it un-confirms it, because what was confirmed
 * is no longer what is stored.
 */
export async function updateRule(id, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  const parsed = formulaInput.safeParse({
    kind: formData.get("kind"),
    day: formData.get("day") || undefined,
    monthsAfter: formData.get("monthsAfter") || undefined,
    event: formData.get("event") || undefined,
    days: formData.get("days") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const formula = parsed.data;

  if (formula.kind === "dayOfMonth" && !formula.day) {
    return { error: "Which day of the month?" };
  }
  if (formula.kind === "daysAfterEvent" && formula.days === undefined) {
    return { error: "How many days after the event?" };
  }

  await connectDB();
  const rule = await DueDateRule.findById(id);
  if (!rule) return { error: "That rule no longer exists." };

  await audited(actor, async (session) => {
    rule.formula = formula;
    rule.notes = String(formData.get("notes") ?? rule.notes).trim();
    // a changed rule is an unchecked rule
    rule.verifiedAt = null;
    rule.verifiedBy = null;
    rule.verifiedByName = "";
    rule.updatedBy = actor.id;
    await rule.save({ session });
  });

  revalidatePath("/settings/due-dates");
  return {
    ok: "Rule changed. Confirm it again to start using it.",
  };
}

/**
 * Record a government extension for one period, and move every open
 * engagement on that rule in one action (spec section 8).
 */
export async function extendPeriod(id, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  const period = String(formData.get("period") ?? "").trim();
  const dateText = String(formData.get("dueDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  /**
   * Which return moved (P3-1). Empty means the whole rule, which is what
   * every extension recorded before P3-1 meant — and still the right answer
   * for a service that owes one filing. Extensions are usually granted for
   * one of a pair: GSTR-3B has been moved more than once while GSTR-1 stayed
   * where it was.
   */
  const milestone = String(formData.get("milestone") ?? "")
    .trim()
    .toUpperCase();

  if (!period) return { error: "Which period has been extended?" };
  if (!dateText) return { error: "What is the new date?" };
  if (!reason) {
    return { error: "Say which notification extended it — this is audited." };
  }

  const dueDate = new Date(`${dateText}T00:00:00+05:30`);
  if (Number.isNaN(dueDate.valueOf())) return { error: "That is not a date." };

  await connectDB();
  const rule = await DueDateRule.findById(id);
  if (!rule) return { error: "That rule no longer exists." };

  let moved = 0;

  if (milestone && !(rule.milestones ?? []).some((m) => m.key === milestone)) {
    return { error: "That rule has no filing by that name." };
  }

  await audited(actor, async (session) => {
    const existing = rule.overrides.find(
      (o) => o.period === period && (o.milestone ?? "") === milestone,
    );
    if (existing) {
      existing.dueDate = dueDate;
      existing.reason = reason;
      existing.byId = actor.id;
      existing.byName = actor.name;
      existing.at = new Date();
    } else {
      rule.overrides.push({
        period,
        milestone,
        dueDate,
        reason,
        byId: actor.id,
        byName: actor.name,
      });
    }
    rule.updatedBy = actor.id;
    await rule.save({ session });

    // every open engagement on this service and period moves with it.
    // One at a time, not updateMany: each needs its own audit entry, and
    // its internal target recalculated from the new date.
    const affected = await Engagement.find({
      period,
      status: { $nin: CLOSED_STATUSES },
      "templateSnapshot.code": rule.serviceCode,
    }).session(session);

    for (const engagement of affected) {
      const before = engagement.statutoryDue;

      /**
       * Move the milestone, not the engagement (P3-1). A filing already
       * recorded keeps its `dueDateAtFiling`, so an extension cannot
       * retroactively make a late filing punctual — `applyDueDates` only
       * touches the live date.
       */
      const targets = (engagement.milestones ?? [])
        .filter(
          (m) => !milestone || String(m.ruleKey).toUpperCase() === milestone,
        )
        .map((m) => ({ key: m.ruleKey, date: dueDate }));

      if (targets.length) {
        applyDueDates(engagement, targets);
      } else {
        // pre-P3-1 work, with no milestones behind it
        engagement.statutoryDue = dueDate;
      }

      engagement.internalDue = internalTargetFor(engagement.statutoryDue);
      engagement.updatedBy = actor.id;
      await engagement.save({ session });

      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          diff: {
            statutoryDue: [
              istInputDate(before),
              istInputDate(engagement.statutoryDue),
            ],
          },
          note: `${milestone || "statutory"} date extended: ${reason}`,
        },
        session,
      );
      moved += 1;
    }
  });

  revalidatePath("/settings/due-dates");
  revalidatePath("/engagements");
  return {
    ok: `${rule.serviceCode} for ${period} moved to ${dateText}. ${moved} open ${moved === 1 ? "engagement" : "engagements"} updated.`,
  };
}

/** Take an extension back off, if it was entered wrongly. */
export async function removeOverride(id, overrideId) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  const rule = await DueDateRule.findById(id);
  if (!rule) return { error: "That rule no longer exists." };

  const override = rule.overrides.id(overrideId);
  if (!override) return { error: "Already gone." };
  const period = override.period;

  await audited(actor, async (session) => {
    override.deleteOne();
    rule.updatedBy = actor.id;
    await rule.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "DueDateRule",
        entityId: rule._id,
        note: `extension for ${period} removed by ${actor.name}`,
      },
      session,
    );
  });

  revalidatePath("/settings/due-dates");
  return {
    ok: `Extension for ${period} removed. Engagements already moved keep their dates — change those individually if needed.`,
  };
}

/** Work out what a rule would give for a period, for the preview on screen. */
export async function previewDue(id, period) {
  const actor = await requireUser();
  assertCan(actor, "view", "serviceCatalog");

  await connectDB();
  const rule = await DueDateRule.findById(id).lean();
  if (!rule) return { error: "That rule no longer exists." };

  // preview as though it were confirmed, so a partner can see what they are
  // being asked to confirm
  const result = statutoryDueFor(
    { ...rule, verifiedAt: rule.verifiedAt ?? new Date() },
    period,
  );
  return {
    ok: true,
    date: result.date ? istInputDate(result.date) : null,
    basis: result.basis,
    why: result.why ?? "",
  };
}
