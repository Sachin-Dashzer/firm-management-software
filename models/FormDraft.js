// @ts-check

import mongoose from "mongoose";
import { DRAFT_KINDS } from "../lib/forms/draft.js";

/**
 * One unfinished form, belonging to the person who was filling it in
 * (P3-18b).
 *
 * Like `notifications`, this carries **no audit plugin and no soft delete**
 * on purpose: a draft is not a record of the firm's work, it is somebody's
 * half-finished typing. Auditing it would bury the entries that matter, and
 * keeping a deleted one would be the opposite of what discarding a draft
 * means.
 *
 * What it does not hold is the interesting part — `scrubDraft` drops the
 * PAN and the Aadhaar before anything reaches here, so the most sensitive
 * fields on a client never sit in plain text in a half-finished form
 * (CLAUDE.md rule 7).
 */

const formDraftSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** Which form. One draft per person per kind. */
    kind: { type: String, enum: DRAFT_KINDS, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Which fields were left out, so the banner can say so. */
    dropped: { type: [String], default: [] },
  },
  { timestamps: true },
);

/** One per person per kind: this is "carry on with that", not a library. */
formDraftSchema.index({ userId: 1, kind: 1 }, { unique: true });
/** A draft nobody came back to in a month was not being come back to. */
formDraftSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);

export default mongoose.models.FormDraft ??
  mongoose.model("FormDraft", formDraftSchema);
