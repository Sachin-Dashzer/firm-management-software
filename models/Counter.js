// @ts-check

import mongoose from "mongoose";

/**
 * Atomic counters (spec section 13 `counters`).
 *
 * Two users at once must never get the same number, so every counter is read
 * and incremented in a single `findOneAndUpdate` inside the caller's
 * transaction. Used by the audit chain now (`_id: "auditLogs"`, which also
 * carries the last hash) and by invoice numbering in Step 8
 * (`_id: "NOI/26-27"`).
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
    /** Only the audit counter uses this: the hash of the newest entry. */
    lastHash: { type: String, default: "" },
  },
  { timestamps: true, _id: false },
);

export default mongoose.models.Counter ??
  mongoose.model("Counter", counterSchema);
