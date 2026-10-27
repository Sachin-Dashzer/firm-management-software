// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { LEAVE_KINDS } from "../lib/team/leave.js";

/**
 * One absence, with the person who holds the work while it lasts (P3-16).
 *
 * Spec section 9 asks for a leave calendar where "approved leave reduces
 * capacity, and the system warns if a person on leave has engagements due".
 * Two things follow from that sentence and both are in this schema:
 *
 *  - **the cover is required**, because an absence with nobody named is the
 *    state the firm is already in and the one that loses work. The cover is
 *    a person, not a role: "the team will handle it" is what everybody
 *    believes until the day the return is late.
 *  - **a partner records it** (owner decision, 27-10-2026), and the row
 *    carries who did and when, so approval is a fact on the record rather
 *    than a workflow nobody completes.
 *
 * Dates are IST midnights and **both ends count**: leave from the 10th to
 * the 14th includes the 14th, which is how everybody says it out loud.
 */

const leaveSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /** Inclusive, both ends, at IST midnight. */
    from: { type: Date, required: true },
    to: { type: Date, required: true },

    kind: { type: String, enum: LEAVE_KINDS, default: "Leave" },

    /**
     * Who holds their work. Their Issues and their staff mail include this
     * person's for the duration, and nothing else changes: a cover never
     * widens access to a client (spec section 2).
     */
    coverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    note: { type: String, default: "", trim: true, maxlength: 300 },

    /** The partner who recorded it, which is the approval. */
    approvedBy: { type: String, default: null },
    approvedByName: { type: String, default: "" },
    approvedAt: { type: Date, default: null },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

leaveSchema.plugin(softDeletePlugin);
leaveSchema.plugin(auditPlugin, { entityType: "Leave" });

leaveSchema.index({ userId: 1, from: 1 });
/** "Whose work am I holding today" — the question Issues asks on every load. */
leaveSchema.index({ coverId: 1, from: 1, to: 1 });
leaveSchema.index({ from: 1, to: 1 });

export default mongoose.models.Leave ?? mongoose.model("Leave", leaveSchema);
