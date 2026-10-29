// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * An hour of somebody's day, against the job it went on (spec section 9).
 *
 * **Minutes, not hours.** The same decision as paise rather than rupees
 * (CLAUDE.md rule 5): 2.5 hours stored as a decimal adds up wrong often
 * enough to matter, and a timesheet's whole purpose is that the week's
 * total is the sum of its lines.
 *
 * **Chargeable means it has a job.** A line against an engagement is the
 * firm's billable time; a line against nothing — training, admin, a day
 * at the bank — is not. The field is derived on save rather than offered
 * as a choice, so nobody can mark a GSTR-1 as non-chargeable to flatter
 * their own utilisation.
 *
 * **A running timer is a line of this collection**, with `startedAt` set
 * and `minutes` still zero. One person has at most one of those; the
 * action layer enforces it. The alternative was a second collection
 * holding a single row per person, which is the same thing with twice the
 * code and a way for the two to disagree.
 */
const timeEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /**
     * The branch the time is counted in, copied from the person. A CA reads
     * their own branch's timesheets and the query must not have to join
     * through the user to find out whose they are (spec section 2).
     */
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    /** The day it is against, at IST midnight. Never the moment it was typed. */
    on: { type: Date, required: true },

    /** 0 while a timer runs; 1 to 1440 once it is a finished line. */
    minutes: { type: Number, default: 0, min: 0, max: 1440 },

    /** Set only while the timer is running. */
    startedAt: { type: Date, default: null },

    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engagement",
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    /** Derived from `engagementId`, never asked for. */
    chargeable: { type: Boolean, default: false },

    /**
     * What it was, for a line with no job on it. Required in that case by
     * the validator rather than the schema, so "2 hours, no idea what on"
     * cannot be saved — an unexplained hour is worse than a missing one.
     */
    what: { type: String, trim: true, default: "", maxlength: 200 },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

/** The one invariant the schema can hold on its own. */
timeEntrySchema.pre("validate", function deriveChargeable() {
  this.chargeable = Boolean(this.engagementId);
  if (!this.engagementId && !this.what?.trim()) {
    this.invalidate("what", "Say what the time went on");
  }
});

timeEntrySchema.plugin(softDeletePlugin);
timeEntrySchema.plugin(auditPlugin, {
  entityType: "TimeEntry",
  clientIdField: "clientId",
});

/** "My week", "the branch's month", "what went on this job". */
timeEntrySchema.index({ userId: 1, on: -1 });
timeEntrySchema.index({ branchId: 1, on: -1 });
timeEntrySchema.index({ engagementId: 1 });
timeEntrySchema.index({ clientId: 1, on: -1 });
/** The running timer, found by itself rather than by scanning the day. */
timeEntrySchema.index({ userId: 1, startedAt: 1 });

export default mongoose.models.TimeEntry ??
  mongoose.model("TimeEntry", timeEntrySchema);
