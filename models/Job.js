// @ts-check

import mongoose from "mongoose";

/**
 * The background work queue (spec section 14).
 *
 * BigRock's cron starts the runner every five minutes; the runner takes a
 * small batch from here, does it, and stops before shared hosting kills it.
 * A lock stops the same job running twice when two runs overlap, and a
 * failure retries with back-off rather than disappearing.
 *
 * Deliberately **not** carrying the audit plugin, unlike every other
 * collection. A job row is a note to the machine, not a record of the firm's
 * work — auditing each claim and retry would bury the real entries. What a
 * job *does* is audited by the handler, through `systemAudit`, exactly as if
 * a person had done it.
 */

export const JOB_STATUSES = ["queued", "running", "done", "failed"];

const jobSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },

    /** Not before this moment. */
    runAt: { type: Date, default: () => new Date(), index: true },
    status: { type: String, enum: JOB_STATUSES, default: "queued" },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },

    /** Held by a runner until this moment; after it, another may take over. */
    lockedUntil: { type: Date, default: null },
    lockedBy: { type: String, default: null },

    lastError: { type: String, default: "" },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },

    /**
     * Stops a scheduled job being queued twice for the same moment: the
     * runner enqueues "nightly generation for 2026-10-17 02:30" and a second
     * run that evening simply collides with the unique index.
     */
    uniqueKey: { type: String, default: null },
  },
  { timestamps: true },
);

jobSchema.index(
  { uniqueKey: 1 },
  { unique: true, partialFilterExpression: { uniqueKey: { $type: "string" } } },
);
// what the runner asks for on every pass
jobSchema.index({ status: 1, runAt: 1 });
// the admin screen's "what went wrong" list
jobSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.models.Job ?? mongoose.model("Job", jobSchema);
