// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * How the firm does one thing, in the firm's own words (P3-19).
 *
 * Two kinds in one collection, because they are the same shape read in two
 * places: a **screen** procedure, which opens in the panel beside the work,
 * and a **playbook**, which is a job start to finish and points at the
 * screens its steps happen on.
 *
 * **Nothing here is ever seeded.** A row exists because somebody at PHMG
 * wrote it; until then the panel says so and names who could. The same
 * stance as the notice-law table (D48) and the certificate wording (D54):
 * the structure is the system's, the words are the firm's.
 *
 * `reviewedAt` is what keeps it honest a year from now. An SOP that was
 * true in 2026 and quietly wrong in 2028 is how every firm handbook dies.
 */

const stepSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 600 },
    /** The caveat, the exception, the thing that bites. Optional. */
    note: { type: String, default: "", trim: true, maxlength: 600 },
  },
  { _id: true },
);

const procedureSchema = new mongoose.Schema(
  {
    /** "screen" keys come from `SCREENS`; a playbook's is its own slug. */
    kind: { type: String, enum: ["screen", "playbook"], default: "screen" },
    key: { type: String, required: true, trim: true },
    title: { type: String, default: "", trim: true, maxlength: 160 },

    /** What it is for, in a line. */
    intro: { type: String, default: "", trim: true, maxlength: 600 },
    steps: { type: [stepSchema], default: [] },

    /**
     * What it is **not** for. The half of every SOP that gets left out, and
     * the half that stops somebody using a procedure for a job it was never
     * about.
     */
    notFor: { type: [String], default: [] },

    /** A playbook's own sections, each empty until somebody writes it. */
    whenItHappens: { type: String, default: "", trim: true, maxlength: 1000 },
    decisions: { type: String, default: "", trim: true, maxlength: 2000 },
    mistakes: { type: String, default: "", trim: true, maxlength: 2000 },
    example: { type: String, default: "", trim: true, maxlength: 4000 },
    /** Screen keys a playbook's steps happen on. */
    screens: { type: [String], default: [] },

    writtenBy: { type: String, default: null },
    writtenByName: { type: String, default: "", trim: true },

    /** A partner has read it and says it is still how the firm works. */
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    reviewedByName: { type: String, default: "", trim: true },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

procedureSchema.plugin(softDeletePlugin);
procedureSchema.plugin(auditPlugin, { entityType: "Procedure" });

/** One procedure per key among the live ones. */
procedureSchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
procedureSchema.index({ kind: 1, updatedAt: -1 });

export default mongoose.models.Procedure ??
  mongoose.model("Procedure", procedureSchema);
