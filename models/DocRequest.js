// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A request to a client for documents (spec section 6).
 *
 * The client gets a link with a long random token in it and uploads without
 * signing in. Only the token's **hash** is stored, so a copy of the database
 * does not hand anyone a working link — the same reasoning as a password.
 *
 * The link expires after seven days, can only ever upload, and names the
 * items it was made for, so files land on the right checklist row.
 */

const requestedItemSchema = new mongoose.Schema(
  {
    /** The engagement checklist item this is asking for. */
    checklistItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true, trim: true },
    mandatory: { type: Boolean, default: true },
    receivedCount: { type: Number, default: 0 },
  },
  { _id: true },
);

const docRequestSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, index: true },
    /** The first characters of the token, so staff can tell links apart. */
    tokenHint: { type: String, default: "" },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engagement",
      default: null,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    items: { type: [requestedItemSchema], default: [] },

    expiresAt: { type: Date, required: true },
    /** Set when the firm withdraws a link before it expires. */
    revokedAt: { type: Date, default: null },

    /** "link" when the firm copies it, "email" when the system sends it. */
    sentVia: { type: String, default: "link" },
    sentAt: { type: Date, default: null },

    /**
     * Chasing the client (spec section 12: every 3 days, 4 at most). Each
     * reminder mints a fresh token, because only the hash of the previous
     * one is kept — so this count is the only record of how often we have
     * asked.
     */
    reminderCount: { type: Number, default: 0 },
    lastReminderAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    uploadCount: { type: Number, default: 0 },

    message: { type: String, default: "", trim: true },

    /**
     * Set when the client asked somebody else to send the document (P3-2) —
     * usually their own accountant, who is the person holding the file.
     *
     * Such a link carries **one item**, so the delegate never sees the rest
     * of the engagement's outstanding list, and the client never holds the
     * token: they name the person and the system mints and sends it.
     */
    delegate: {
      type: new mongoose.Schema(
        {
          name: { type: String, default: "", trim: true },
          contact: { type: String, default: "", trim: true },
          /** The portal user who asked for it. */
          askedBy: { type: String, default: "", trim: true },
        },
        { _id: false },
      ),
      default: null,
    },

    createdBy: { type: String, default: null },
    createdByName: { type: String, default: "" },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

docRequestSchema.plugin(softDeletePlugin);
docRequestSchema.plugin(auditPlugin, {
  entityType: "DocRequest",
  clientIdField: "clientId",
});

docRequestSchema.index({ clientId: 1, createdAt: -1 });
docRequestSchema.index({ engagementId: 1 });
docRequestSchema.index({ expiresAt: 1 });

/** Usable means: not expired, not withdrawn, not deleted. */
docRequestSchema.methods.isOpen = function isOpen(now = new Date()) {
  return !this.revokedAt && !this.deletedAt && this.expiresAt > now;
};

export default mongoose.models.DocRequest ??
  mongoose.model("DocRequest", docRequestSchema);
