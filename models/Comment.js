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
     * "Note" is a plain note and the contact channels are communication log
     * entries. Two kinds are written from **outside** the firm: "Change
     * request" (P2-9b), a client asking for something on their record to be
     * corrected, and "Client message" (P3-17b), their half of a job's
     * conversation. Neither is ever internal.
     */
    kind: {
      type: String,
      enum: ["Note", "Change request", "Client message", ...CONTACT_CHANNELS],
      default: "Note",
    },
    body: { type: String, required: true, trim: true },
    /** When the call or meeting happened, which may not be when it was typed. */
    occurredAt: { type: Date, default: () => new Date() },
    mentions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    /**
     * Internal means it never leaves the firm. The default is true and
     * stays true: a note written without a thought about it is an internal
     * note.
     *
     * Until P3-17b this flag was **read by nothing** — the box had a tick
     * and clearing it changed a boolean no query filtered on, so somebody
     * could believe they had written to a client and be wrong. Now
     * `threadScope` in `lib/access/clientScope.js` is the one query the
     * portal uses, and it filters on this.
     */
    internal: { type: Boolean, default: true },

    /**
     * When the client was actually sent it (P3-17b). A with-client message
     * composed while client email is switched off is held by the guard, so
     * "not internal" and "they have it" are different facts and the thread
     * shows which.
     */
    sentToClientAt: { type: Date, default: null },
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
