// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { LEAVE_KINDS, LEAVE_STATUSES } from "../lib/team/leave.js";

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
 *  - **somebody decides it** (owner decision, 01-11-2026, replacing the one
 *    of 27-10-2026), and the row carries who did and when.
 *
 * **The approval cycle, and why it came back.** On 27-10-2026 the owner's
 * decision was that a partner records an absence and recording it *is* the
 * approval — no request, no second state. On 01-11-2026 they asked for the
 * cycle the firm actually runs: the person applies, a CA or a Partner
 * approves or declines, and the cover is named at the moment of approval
 * rather than at the moment of asking. So `status` is new, and `coverId` is
 * **no longer required by the schema** — an application has nobody holding
 * the work yet, because that is the decision being asked for. The action
 * layer requires it to approve, which is where the rule belongs.
 *
 * Rows written before all this have no `status` field at all. They were
 * recorded by a partner, which under the old decision was the approval, so
 * `statusOf()` in `lib/team/leave.js` reads a missing status as approved.
 * Nothing is migrated: the absence of a field is the fact that it predates
 * the cycle.
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
     * Where it is in the cycle. A senior marking leave for somebody lands
     * straight on `Approved` — they are the approver, so asking them to
     * approve their own entry would be a second click that means nothing.
     */
    status: { type: String, enum: LEAVE_STATUSES, default: "Pending" },

    /**
     * Who holds their work. Their Issues and their staff mail include this
     * person's for the duration, and nothing else changes: a cover never
     * widens access to a client (spec section 2).
     *
     * Not required here, because an application has not been decided yet
     * and naming the cover **is** part of the decision. Approving without
     * one is refused in `decideLeave`.
     */
    coverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /** Why they are asking. Required of an applicant, not of a senior. */
    note: { type: String, default: "", trim: true, maxlength: 300 },

    /** The CA or Partner who decided it, either way. */
    approvedBy: { type: String, default: null },
    approvedByName: { type: String, default: "" },
    approvedAt: { type: Date, default: null },

    /**
     * What the decider said — and for a decline it is required, because
     * "no" with no reason is the message that comes straight back as a
     * question the screen could have answered.
     */
    decisionNote: { type: String, default: "", trim: true, maxlength: 300 },

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
/** "What is waiting on me" — the first thing the leave board asks. */
leaveSchema.index({ status: 1, from: 1 });

export default mongoose.models.Leave ?? mongoose.model("Leave", leaveSchema);
