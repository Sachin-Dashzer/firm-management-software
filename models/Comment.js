// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { CONTACT_CHANNELS } from "../lib/validators.js";

/**
 * Notes, the client communication log (spec section 3) and engagement comment
 * threads (spec section 5), in one collection keyed by what they are attached
 * to — they are the same thing with a different `kind`.
 *
 * `internal` marks anything that must never reach a future client portal.
 */
const commentSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true }, // Client, Engagement, Invoice
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    /**
     * "Note" is a plain note, the contact channels are communication log
     * entries, and "Change request" is the one kind written from **outside**
     * the firm (P2-9b): a client asking for something on their record to be
     * corrected. It is never internal, and it is the only thing a portal
     * account can create anywhere in the system.
     */
    kind: {
      type: String,
      enum: ["Note", "Change request", ...CONTACT_CHANNELS],
      default: "Note",
    },
    body: { type: String, required: true, trim: true },
    /** When the call or meeting happened, which may not be when it was typed. */
    occurredAt: { type: Date, default: () => new Date() },
    mentions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    internal: { type: Boolean, default: true },
    createdBy: { type: String, default: null },
    createdByName: { type: String, default: "" },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

commentSchema.plugin(softDeletePlugin);
commentSchema.plugin(auditPlugin, {
  entityType: "Comment",
  clientIdField: "clientId",
});

commentSchema.index({ entityType: 1, entityId: 1, occurredAt: -1 });
commentSchema.index({ clientId: 1, occurredAt: -1 });

export default mongoose.models.Comment ??
  mongoose.model("Comment", commentSchema);
