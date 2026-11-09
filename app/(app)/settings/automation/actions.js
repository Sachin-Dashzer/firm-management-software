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
import { clientMailAllowed } from "@/lib/mailer/guard";
import { clearFirmCache } from "@/lib/firm/settings";
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

/**
 * Switch client email on, or off (04-11-2026).
 *
 * The switch that decides whether a client is written to **at all**, moved
 * here from `EMAIL_CLIENTS_ENABLED`: it used to take the Vercel dashboard
 * and a redeploy, which put the most consequential setting in the system
 * out of the owner's reach and left no record of who threw it.
 *
 * Partner-only, like everything else in this file, and audited — "when did
 * we start emailing clients" is a question with one right answer.
 *
 * It is not the same switch as the pause below:
 *
 *  - this one is the channel. Off, nothing reaches a client, whether a rule
 *    worked it out or a person typed it, and every message is still
 *    composed and logged so the firm can see what it would have said.
 *  - the pause is the automatic senders. Paused, a person can still write
 *    to a client by hand.
 *
 * @param {boolean} on
 */
export async function setClientMail(on) {
  const actor = await requireUser();
  gate(actor);
  await connectDB();

  const wanted = Boolean(on);
  const before = await clientMailAllowed();

  await audited(actor, async (session) => {
    // upsert, for the same reason the pause does: a firm that has not
    // opened the ICAI screen yet has no settings document, and a switch
    // that silently writes nothing is worse than no switch
    const firm = await FirmSettings.findOneAndUpdate(
      { key: "firm" },
      {
        $set: {
          clientMailOn: wanted,
          clientMailBy: actor.id,
          clientMailByName: actor.name,
          clientMailAt: new Date(),
          updatedBy: actor.id,
        },
      },
      { new: true, upsert: true, session },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "FirmSettings",
        entityId: firm?._id,
        diff: { clientMailOn: [before, wanted] },
        note: wanted
          ? "client email switched on: messages to clients are delivered from now on"
          : "client email switched off: messages to clients are composed and logged, and not delivered",
      },
      session,
    );
  });

  // read through the firm's one-minute cache, so clear it or the next
  // message decides on the old answer
  clearFirmCache();

  revalidatePath("/settings/automation");
  revalidatePath("/settings/messages");
  revalidatePath("/settings");
  return {
    ok: wanted
      ? "Client email is on. Anything a rule sends from now on reaches the client — within the limits on this screen."
      : "Client email is off. Messages to clients are still composed and logged here, but nothing is delivered.",
  };
}

/** The one switch that stops everything automatic to a client. */
export async function setAutomationPaused(paused) {
  const actor = await requireUser();
  gate(actor);
  await connectDB();

  const on = Boolean(paused);

  await audited(actor, async (session) => {
    /*
     * `upsert`, like the other two writes in this file (03-11-2026).
     *
     * Without it the kill switch did nothing at all on a firm whose
     * settings record had not been created yet — `findOneAndUpdate`
     * matched nothing, wrote nothing and returned null, and the screen
     * came back still saying automation was running. A switch that fails
     * silently is worse than one that is missing, and "the morning a
     * client list has gone in wrong" is exactly when a new firm would
     * reach for it.
     */
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
      { new: true, upsert: true, session },
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
  if (log.unfilled?.length) {
    return {
      error: `This message still has ${log.unfilled
        .map((key) => `{${key}}`)
        .join(
          ", ",
        )} in its wording. Put that right in Settings → Messages, then do whatever created it again — sending this copy would post the placeholder to the recipient.`,
    };
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
