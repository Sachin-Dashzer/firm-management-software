"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import SendBatch from "@/models/SendBatch";
import NotificationRule from "@/models/NotificationRule";
import FirmSettings from "@/models/FirmSettings";
import MessageLog from "@/models/MessageLog";
import { sendBatch } from "@/lib/mailer/batches";
import { RULE_DEFAULTS } from "@/lib/mailer/rules";
import { enqueue } from "@/lib/jobs/queue";

/**
 * The partner's end of the automation gate (P3-10).
 *
 * Three decisions live here and all three are a partner's: approve a batch,
 * decline it, and decide a rule may run on its own. Trusting a rule is
 * trusting every message it will ever send, which is not a thing to put
 * behind "edit settings".
 */

/** Approving, declining and trusting are all partner-only. */
function gate(actor) {
  assertCan(actor, "approve", "feeWriteOff");
}

/**
 * Let a queued batch go.
 *
 * Every message is re-checked against the live record as it goes out, so a
 * client who sent their documents while the batch waited is not chased for
 * them — see `stillWanted` in `lib/mailer/gate.js`.
 */
export async function approveBatch(id) {
  const actor = await requireUser();
  gate(actor);
  await connectDB();

  const batch = await SendBatch.findById(id);
  if (!batch) return { error: "That batch is gone." };
  if (batch.status !== "queued") {
    return { error: `This batch was already ${batch.status}.` };
  }

  batch.decidedBy = actor.id;
  batch.decidedByName = actor.name;
  batch.decidedAt = new Date();
  batch.updatedBy = actor.id;

  const result = await sendBatch(batch);

  await audited(actor, async (session) => {
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "SendBatch",
        entityId: batch._id,
        note: `${batch.rule}: approved — ${result.sent} sent, ${result.cancelled} no longer needed, ${result.held} held`,
      },
      session,
    );
  });

  revalidatePath("/settings/automation");
  return {
    ok:
      `${result.sent} ${result.sent === 1 ? "message" : "messages"} sent.` +
      (result.cancelled
        ? ` ${result.cancelled} were no longer needed and did not go.`
        : "") +
      (result.held
        ? ` ${result.held} held: something arrived that nobody has checked.`
        : ""),
  };
}

/** Say no, with a reason whoever reads the log will understand. */
export async function declineBatch(id, reason) {
  const actor = await requireUser();
  gate(actor);
  await connectDB();

  const why = String(reason ?? "").trim();
  if (why.length < 5) {
    return { error: "Say why. The run log is read by people, not machines." };
  }

  const batch = await SendBatch.findById(id);
  if (!batch) return { error: "That batch is gone." };
  if (batch.status !== "queued") {
    return { error: `This batch was already ${batch.status}.` };
  }

  await audited(actor, async (session) => {
    batch.status = "declined";
    batch.declineReason = why;
    batch.decidedBy = actor.id;
    batch.decidedByName = actor.name;
    batch.decidedAt = new Date();
    batch.updatedBy = actor.id;
    for (const item of batch.items) {
      if (!item.outcome) {
        item.outcome = "cancelled";
        item.outcomeWhy = why;
      }
    }
    await batch.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "SendBatch",
        entityId: batch._id,
        note: `${batch.rule}: declined — ${why}`,
      },
      session,
    );
  });

  revalidatePath("/settings/automation");
  return { ok: "Declined. Nothing went out, and the reason is on the log." };
}

/**
 * Decide whether a rule may write to clients on its own.
 *
 * Trusted is not unlimited: quiet hours, the monthly cap, the firm-wide
 * pause and the 25-client ceiling all still apply, and the screen says so.
 */
export async function setRuleTrusted(key, trusted) {
  const actor = await requireUser();
  gate(actor);
  await connectDB();

  const on = Boolean(trusted);

  await audited(actor, async (session) => {
    const rule = await NotificationRule.findOneAndUpdate(
      { key },
      {
        $set: {
          trusted: on,
          trustedBy: on ? actor.id : null,
          trustedByName: on ? actor.name : "",
          trustedAt: on ? new Date() : null,
          updatedBy: actor.id,
        },
        $setOnInsert: { key },
      },
      { new: true, upsert: true, session },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "NotificationRule",
        entityId: rule._id,
        diff: { trusted: [!on, on] },
        note: on
          ? `${key} may now write to clients without being looked at first`
          : `${key} goes back to being approved before it sends`,
      },
      session,
    );
  });

  revalidatePath("/settings/automation");
  revalidatePath("/settings/messages");
  return {
    ok: on
      ? "That rule can now send without waiting for you — within the limits below."
      : "That rule will wait for you again.",
  };
}

/** The one switch that stops everything automatic to a client. */
export async function setAutomationPaused(paused) {
  const actor = await requireUser();
  gate(actor);
  await connectDB();

  const on = Boolean(paused);

  await audited(actor, async (session) => {
    const firm = await FirmSettings.findOneAndUpdate(
      { key: "firm" },
      {
        $set: {
          automationPaused: on,
          automationPausedBy: on ? actor.id : null,
          automationPausedAt: on ? new Date() : null,
          updatedBy: actor.id,
        },
      },
      { new: true, session },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "FirmSettings",
        entityId: firm?._id,
        diff: { automationPaused: [!on, on] },
        note: on
          ? "every automatic message to a client is paused"
          : "automatic messages to clients are running again",
      },
      session,
    );
  });

  revalidatePath("/settings/automation");
  return {
    ok: on
      ? "Paused. Nothing automatic reaches a client until you turn this back on."
      : "Running again. The next sweep will propose what is due.",
  };
}

/**
 * The kill switch, rule by rule (the owner's screen of 02-11-2026).
 *
 * Trusting a rule decides *whether a partner reads it first*; this decides
 * whether it runs at all. They are two different sentences on the screen
 * and two different fields, because switching a nagging chaser off is a
 * thing a firm does in a hurry and should not require reading the wording.
 *
 * Partner-only, like the rest of this file: a rule that stops running
 * stops a client being told something.
 */
export async function setRuleEnabled(key, enabled) {
  const actor = await requireUser();
  gate(actor);
  await connectDB();

  if (!RULE_DEFAULTS[key]) return { error: "There is no such message." };
  const on = Boolean(enabled);

  await audited(actor, async (session) => {
    const rule = await NotificationRule.findOneAndUpdate(
      { key },
      { $set: { enabled: on, updatedBy: actor.id }, $setOnInsert: { key } },
      { new: true, upsert: true, session },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "NotificationRule",
        entityId: rule._id,
        diff: { enabled: [!on, on] },
        note: on
          ? `${key} is running again`
          : `${key} is switched off and will not run for anybody`,
      },
      session,
    );
  });

  revalidatePath("/settings/automation");
  revalidatePath("/settings/messages");
  return {
    ok: on
      ? "That rule is running again."
      : "Switched off. It will not run for anybody until it is switched back on.",
  };
}

/**
 * Send a failed message again.
 *
 * The runner already retries three times with a back-off, so anything
 * still sitting here failed for a reason that did not fix itself — a bad
 * address, a mailbox that was down all morning. Pressing this puts the
 * same composed message back in the queue; it does not rewrite it, and the
 * failure stays on the record.
 */
export async function retryMessage(id) {
  const actor = await requireUser();
  gate(actor);
  await connectDB();

  const log = await MessageLog.findById(id);
  if (!log) return { error: "That message is gone." };
  if (log.status !== "failed") {
    return { error: `That message is ${log.status}, not failed.` };
  }

  await audited(actor, async (session) => {
    log.status = "queued";
    log.error = "";
    log.updatedBy = actor.id;
    await log.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "MessageLog",
        entityId: log._id,
        note: `queued again after failing: ${log.subject || log.template}`,
      },
      session,
    );
  });

  // outside the transaction: a job that runs before the write lands would
  // read the old row and skip it
  await enqueue("sendMail", { messageLogId: String(log._id) });

  revalidatePath("/settings/automation");
  revalidatePath("/settings/messages");
  return { ok: "Back in the queue. The runner picks it up within 5 minutes." };
}
