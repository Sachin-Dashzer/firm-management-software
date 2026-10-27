// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { AUDIENCES } from "../lib/firm/announcements.js";

/**
 * One thing the firm has said to its own staff (P3-17b).
 *
 * Its own collection rather than a notification per person, because an
 * announcement is a thing that exists once: it has a life, an audience and
 * a record of who has read it, and forty copies of it could disagree.
 * Notifications are still written — that is how it reaches the inbox — but
 * they point at this.
 *
 * The acknowledgements are embedded. One row per person who has read it,
 * for a firm of five to fifty, is a handful of subdocuments; a collection
 * of its own would be a join to answer "who has not read this", which is
 * the only question anybody asks about it.
 */

const ackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** Their name as it was then, so the list survives them leaving. */
    name: { type: String, default: "", trim: true },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 4000 },

    /** A rule, not a list of names — see `lib/firm/announcements.js`. */
    audience: { type: String, enum: AUDIENCES, default: "everyone" },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    role: { type: String, default: "" },

    /** Both IST midnights. `until` absent means until somebody takes it down. */
    from: { type: Date, required: true },
    until: { type: Date, default: null },

    /**
     * Whether people are asked to say they have read it. It never blocks
     * anything: the partner sees who has not, and asks them.
     */
    needsAck: { type: Boolean, default: false },
    acknowledgements: { type: [ackSchema], default: [] },

    postedBy: { type: String, default: null },
    postedByName: { type: String, default: "" },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

announcementSchema.plugin(softDeletePlugin);
announcementSchema.plugin(auditPlugin, { entityType: "Announcement" });

/** The inbox's own query: what is up now. */
announcementSchema.index({ from: -1, until: 1 });

export default mongoose.models.Announcement ??
  mongoose.model("Announcement", announcementSchema);
