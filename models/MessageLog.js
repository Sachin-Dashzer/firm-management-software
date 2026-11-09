// @ts-check

import mongoose from "mongoose";

/**
 * Every message the firm sends a client, and what became of it
 * (spec sections 12 and 13).
 *
 * This is a record, not a nudge, so it is kept: "we emailed you the
 * reminder on the 14th" is the kind of thing a firm needs to be able to
 * show. A message held back by the client-email guard is logged too, with
 * `status: "held"` and the reason — so nobody believes a client was told
 * something they were not.
 */
const messageLogSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ["email", "whatsapp"], default: "email" },
    template: { type: String, required: true },
    audience: { type: String, enum: ["team", "client"], default: "team" },

    to: { type: String, required: true, trim: true },
    /**
     * Where it actually went. Filled by the send, not by the queue: the
     * test redirect is applied at the moment of posting, so until then
     * nobody knows (#2).
     */
    sentTo: { type: String, default: "", trim: true },
    /** Which transport posted it — "smtp" or "log". What really happened. */
    via: { type: String, default: "" },
    subject: { type: String, default: "", trim: true },
    body: { type: String, default: "" },

    status: {
      type: String,
      enum: ["queued", "sent", "failed", "held"],
      default: "queued",
    },
    heldReason: { type: String, default: "" },
    error: { type: String, default: "" },
    sentAt: { type: Date, default: null },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    entityType: { type: String, default: "" },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },

    /**
     * Set by the scheduled reminders. A unique index on it is what makes
     * "every 3 days, at most 4 times" true even if the runner runs twice:
     * the second attempt collides and stops, before anybody is chased
     * again. Immediate messages leave it null, and the index ignores those.
     */
    dedupeKey: { type: String, default: null },

    /**
     * Placeholders the wording still had in it when the message was
     * composed. Anything in here and the message is never posted: a client
     * who reads `{unpricedLine}` learns nothing except that the firm's
     * system is broken (QA 09-11-2026, #15).
     */
    unfilled: { type: [String], default: [] },
  },
  { timestamps: true },
);

messageLogSchema.index({ clientId: 1, createdAt: -1 });
messageLogSchema.index({ status: 1, createdAt: -1 });
messageLogSchema.index({ template: 1, entityId: 1 });
messageLogSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);

export default mongoose.models.MessageLog ??
  mongoose.model("MessageLog", messageLogSchema);
