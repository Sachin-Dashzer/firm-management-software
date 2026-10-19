// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * The statutory due-date master (spec section 8).
 *
 * One rule per service, saying how its deadline is worked out, plus any
 * period where the government moved it. The firm maintains this; the
 * developer only seeds a first draft.
 *
 * **Nothing here is treated as true until a person confirms it.** A rule
 * carries `verifiedBy` and `verifiedAt`, and the generator refuses to put a
 * statutory date on an engagement from a rule nobody has checked
 * (CLAUDE.md rule 8). An unverified rule is a suggestion on a screen, not a
 * deadline in the system.
 */

/**
 * How a date is worked out.
 *
 * - `dayOfMonth`: the <day> of the month <monthsAfter> months after the
 *   period ends. "GSTR-3B is the 20th of the following month" is day 20,
 *   monthsAfter 1. "ITR non-audit is 31 July" is day 31, monthsAfter 4 from
 *   a March year end. A day past the end of a short month clamps to its
 *   last day.
 * - `daysAfterEvent`: <days> days after something dated on the engagement,
 *   such as the AGM for AOC-4, or the date on a notice.
 */
const formulaSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["dayOfMonth", "daysAfterEvent"],
      required: true,
    },
    day: { type: Number, default: null, min: 1, max: 31 },
    monthsAfter: { type: Number, default: 0, min: 0, max: 24 },
    event: { type: String, default: "" },
    days: { type: Number, default: null, min: 0, max: 400 },
  },
  { _id: false },
);

/**
 * Some services have a different rule for one period of the year — the Q4
 * TDS return is the clearest case, due at the end of May rather than the
 * month after the quarter.
 */
const variantSchema = new mongoose.Schema(
  {
    /** Matches the end of the period code, e.g. "Q4" or "-03". */
    match: { type: String, required: true, trim: true },
    formula: { type: formulaSchema, required: true },
    note: { type: String, default: "", trim: true },
  },
  { _id: true },
);

/** A date the government actually moved, for one period (spec section 8). */
const overrideSchema = new mongoose.Schema(
  {
    period: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    byId: { type: String, default: null },
    byName: { type: String, default: "" },
    at: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const dueDateRuleSchema = new mongoose.Schema(
  {
    /** The service catalog code this governs, e.g. "GSTR3B". */
    serviceCode: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    periodType: {
      type: String,
      enum: ["monthly", "quarterly", "half-yearly", "annual", "one-time"],
      required: true,
    },

    formula: { type: formulaSchema, required: true },
    variants: { type: [variantSchema], default: [] },
    overrides: { type: [overrideSchema], default: [] },

    /**
     * Where the seeded draft came from, so the person confirming it has
     * something to check against rather than taking our word for it.
     */
    source: { type: String, default: "", trim: true },
    sourceUrl: { type: String, default: "", trim: true },
    /** Anything the firm should look at twice. */
    caution: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },

    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null },
    verifiedByName: { type: String, default: "" },

    active: { type: Boolean, default: true },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

dueDateRuleSchema.plugin(softDeletePlugin);
dueDateRuleSchema.plugin(auditPlugin, { entityType: "DueDateRule" });

dueDateRuleSchema.index(
  { serviceCode: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

/** Has a person confirmed this rule against the law? */
dueDateRuleSchema.virtual("verified").get(function verified() {
  return Boolean(this.verifiedAt);
});

export default mongoose.models.DueDateRule ??
  mongoose.model("DueDateRule", dueDateRuleSchema);
