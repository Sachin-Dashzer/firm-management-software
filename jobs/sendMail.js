// @ts-check

import MessageLog from "../models/MessageLog.js";
import Comment from "../models/Comment.js";
import { connectDB } from "../lib/db.js";
import { sendMail as send } from "../lib/mailer/index.js";
import { HOURLY_LIMIT } from "../lib/mailer/guard.js";
import { systemAudit } from "../lib/audit/system.js";

/**
 * Send one queued message (spec sections 12 and 14).
 *
 * The rate limit lives here rather than in the sender, because here is
 * where the whole hour's traffic can be counted: before sending, the job
 * asks how many have gone out in the last hour and defers itself if the
 * firm is at its cap. Fifty invoices raised at once therefore trickle out
 * over an hour instead of getting the domain throttled.
 *
 * Deferring is done by throwing, which the runner already handles as a
 * retry with back-off — no second mechanism for the same thing.
 */
export async function sendMailJob(payload = {}) {
  await connectDB();

  const log = await MessageLog.findById(payload.messageLogId);
  if (!log) return { skipped: "the message log row is gone" };
  if (log.status === "sent") return { skipped: "already sent" };
  if (log.status === "held") return { skipped: "held by the client guard" };

  const sentInLastHour = await MessageLog.countDocuments({
    status: "sent",
    sentAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
  });

  if (sentInLastHour >= HOURLY_LIMIT) {
    throw new Error(
      `At the hourly limit of ${HOURLY_LIMIT} messages; this one waits.`,
    );
  }

  try {
    const result = await send({
      to: log.sentTo || log.to,
      subject: log.subject,
      text: log.body,
      attachments: payload.attachments,
    });

    log.status = "sent";
    log.sentAt = new Date();
    log.error = "";
    await log.save();

    // a client-facing message belongs on the client's communication log,
    // so the firm can see what was said without leaving the client record
    if (log.audience === "client" && log.clientId) {
      await systemAudit(async (session) => {
        await Comment.create(
          [
            {
              entityType: "Client",
              entityId: log.clientId,
              clientId: log.clientId,
              kind: "Email",
              body: `${log.subject}\n\n${log.body}`,
              occurredAt: log.sentAt,
              internal: false,
              createdByName: "System",
            },
          ],
          { session },
        );
      });
    }

    return { sent: true, via: result.via, to: log.sentTo || log.to };
  } catch (err) {
    log.status = "failed";
    log.error = String(err?.message ?? err).slice(0, 500);
    await log.save();
    // let the runner retry: a mailbox that is down now may be up in a minute
    throw err;
  }
}

export default sendMailJob;
