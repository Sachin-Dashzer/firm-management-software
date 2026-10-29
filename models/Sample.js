// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { METHOD_KEYS } from "../lib/practice/sampling.js";

/**
 * A sample drawn and vouched (P3-30, SA 530).
 *
 * One document per working paper: the design, the population it was drawn
 * from, the rows that came out and the marks against each attribute. It
 * hangs off an audit file, because a sample with no engagement behind it
 * is not evidence of anything.
 *
 * **The seed is the field that matters.** A reviewer's question about a
 * sample is never whether twenty-five was enough; it is "show me that this
 * is the sample you drew". The seed, the method and the population
 * fingerprint together answer it, and `lib/practice/sampling.js` will
 * reproduce the same rows from them years later.
 *
 * **Locking is not a status, it is the point.** Until the sample is locked
 * it can be redrawn; once locked, the design and the rows are fixed and
 * only the marks change. An unlocked sample that somebody redraws after
 * finding an exception is how a sample stops being a sample.
 */

/** One row of the population that was selected. */
const sampleItemSchema = new mongoose.Schema(
  {
    /** Its place in the sample, 1 upwards. What people call a row. */
    no: { type: Number, required: true },

    ref: { type: String, default: "", trim: true, maxlength: 80 },
    party: { type: String, required: true, trim: true, maxlength: 200 },
    /** As it appeared in the population, in the client's own words. */
    on: { type: String, default: "", trim: true, maxlength: 40 },
    amountPaise: { type: Number, required: true },

    /** Examined in full rather than sampled, and why. */
    key: { type: Boolean, default: false },
    keyReason: { type: String, default: "", trim: true, maxlength: 120 },

    /**
     * One mark per attribute, in the order of `attributes`:
     * `1` fine, `0` an exception, `null` not looked at yet.
     *
     * A fixed-length array rather than a map, because the columns are the
     * sample's and cannot differ row to row — a grid where one row has an
     * attribute the next does not is not a grid.
     */
    marks: { type: [Number], default: [] },

    /** What the exception was. Required before it can be sent on. */
    note: { type: String, default: "", trim: true, maxlength: 1000 },
    /**
     * The money effect, where it is not the whole entry. Zero means the
     * whole amount is in question, which is the usual case.
     */
    errorPaise: { type: Number, default: 0 },

    /** The matter raised on the audit file from this row, once sent. */
    exceptionId: { type: String, default: null },

    markedBy: { type: String, default: null },
    markedByName: { type: String, default: "" },
    markedAt: { type: Date, default: null },
  },
  { _id: true },
);

const sampleSchema = new mongoose.Schema(
  {
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engagement",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    /** The working paper reference, in the firm's own filing: "H-4". */
    ref: { type: String, default: "", trim: true, maxlength: 40 },
    /** The audit area's letter, so the file can count what is open where. */
    area: { type: String, default: "", trim: true, maxlength: 8 },
    /** What was sampled: "Purchases", "Repairs above ₹50,000". */
    name: { type: String, required: true, trim: true, maxlength: 200 },

    // --- 1. the design ------------------------------------------------------

    /** Where the population came from, in words: "Purchase register, Tally". */
    population: { type: String, default: "", trim: true, maxlength: 300 },
    /**
     * Has it been agreed to the trial balance? **Null means nobody has
     * said**, which is different from no — a sample drawn from a
     * population that does not agree to the books is evidence about
     * nothing, and the file has to be able to show the question was asked.
     */
    reconciledToTb: { type: Boolean, default: null },

    entries: { type: Number, default: 0, min: 0 },
    valuePaise: { type: Number, default: 0 },

    method: { type: String, enum: METHOD_KEYS, default: "monetary-unit" },
    /**
     * The firm's own judgement, recorded rather than used. Nothing here
     * derives a sample size from a confidence level: SA 530 gives no
     * formula and inventing one would break `CLAUDE.md` rule 8.
     */
    confidence: { type: String, default: "", trim: true, maxlength: 40 },
    tolerablePaise: { type: Number, default: 0, min: 0 },
    basis: { type: String, default: "", trim: true, maxlength: 1000 },

    keyAbovePaise: { type: Number, default: 0, min: 0 },
    /** How many to draw from what is left after the key items. */
    size: { type: Number, default: 0, min: 0, max: 2000 },

    /** The selection, reproducibly. */
    seed: { type: Number, default: 0 },
    /** The sampling interval the draw used, kept as drawn. */
    intervalPaise: { type: Number, default: 0 },
    /** How the draw went, in a sentence, as it was true on the day. */
    drawNote: { type: String, default: "", trim: true, maxlength: 600 },
    drawnAt: { type: Date, default: null },

    // --- 2. the grid --------------------------------------------------------

    /** The columns. Changing them after the lock is refused. */
    attributes: { type: [String], default: [] },
    items: { type: [sampleItemSchema], default: [] },

    locked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
    lockedByName: { type: String, default: "" },

    createdBy: { type: String, default: null },
    createdByName: { type: String, default: "" },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

sampleSchema.plugin(softDeletePlugin);
sampleSchema.plugin(auditPlugin, {
  entityType: "Sample",
  clientIdField: "clientId",
});

sampleSchema.index({ engagementId: 1, createdAt: -1 });
sampleSchema.index({ clientId: 1, createdAt: -1 });
sampleSchema.index({ branchId: 1, locked: 1 });

export default mongoose.models.Sample ?? mongoose.model("Sample", sampleSchema);
