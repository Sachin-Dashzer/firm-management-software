// @ts-check

import mongoose from "mongoose";
import { auditPlugin } from "./plugins/audit.js";

/**
 * One automated rule's decision to write to a list of clients (P3-10).
 *
 * This collection is two things at once, deliberately:
 *
 *  - the **approval queue**: what a rule wants to send, with the first real
 *    message as a preview and every recipient named, waiting for a partner
 *  - the **run log**: what was proposed, who decided, when, what actually
 *    went out and what did not, kept for ever. It is append-only in the
 *    sense that matters — nothing is deleted and nothing is rewritten, only
 *    decided — because it is the evidence a peer reviewer reads when they
 *    ask how the firm communicates with its clients.
 *
 * It is not a queue in the job sense. `jobs/sendMail.js` and the rate limit
 * still do the delivering; this decides whether a message is allowed to
 * reach them at all.
 */

export const BATCH_STATUSES = [
  /** Waiting for a partner. */
  "queued",
  /** Approved, and sent (or partly sent — see the items). */
  "sent",
  /** A partner said no, with a reason. */
  "declined",
  /** Quiet hours: nobody needs to approve what only needs to wait. */
  "deferred",
  /** Trusted rule, inside the limits: it went straight out. */
  "auto-sent",
  /** The firm-wide pause was on. */
  "paused",
];

/**
 * One recipient's message, kept so the batch can be previewed now and sent
 * later without recomputing anything.
 */
const itemSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    clientName: { type: String, default: "", trim: true },
    rule: { type: String, required: true, trim: true },
    /** Stops the same client being chased twice for the same thing. */
    dedupeKey: { type: String, default: "", trim: true },
    values: { type: mongoose.Schema.Types.Mixed, default: {} },
    about: { type: mongoose.Schema.Types.Mixed, default: {} },

    /**
     * What happened to this one: "sent", "cancelled" (the reason went away),
     * "held" (something arrived and nobody has checked it), or "capped"
     * (four messages already this month).
     */
    outcome: { type: String, default: "" },
    outcomeWhy: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const sendBatchSchema = new mongoose.Schema(
  {
    rule: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: BATCH_STATUSES, required: true },
    /** Why it is in that state, in the words the screen shows. */
    why: { type: String, default: "", trim: true },

    items: { type: [itemSchema], default: [] },
    /** The first real message, rendered, so a partner reads what a client will. */
    preview: {
      to: { type: String, default: "" },
      subject: { type: String, default: "" },
      body: { type: String, default: "" },
    },

    /** How many the cap or the gate removed before anybody looked. */
    cappedCount: { type: Number, default: 0 },

    /** When a deferred batch may go. */
    notBefore: { type: Date, default: null },

    decidedBy: { type: String, default: null },
    decidedByName: { type: String, default: "" },
    decidedAt: { type: Date, default: null },
    declineReason: { type: String, default: "", trim: true },

    sentCount: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

/**
 * No soft-delete plugin, on purpose. Everything else in this system can be
 * soft deleted and restored; a record of what the firm said to its clients
 * is not something anybody should be able to take off a list, even with a
 * deletedAt beside it.
 */
sendBatchSchema.plugin(auditPlugin, { entityType: "SendBatch" });

sendBatchSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.SendBatch ??
  mongoose.model("SendBatch", sendBatchSchema);
