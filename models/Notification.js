// @ts-check

import mongoose from "mongoose";

/**
 * An in-app alert (spec section 12).
 *
 * Like the jobs queue, this deliberately carries no audit plugin: a
 * notification is a nudge, not a record of the firm's work, and auditing
 * every bell would bury the entries that matter. What the notification is
 * *about* is already audited where it happened.
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** The template key, so the bell can group and the settings can mute. */
    type: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    /** Where clicking it goes. */
    href: { type: String, default: "" },

    entityType: { type: String, default: "" },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
// a nudge is worthless after a month; let MongoDB clear them out
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 60 },
);

export default mongoose.models.Notification ??
  mongoose.model("Notification", notificationSchema);
