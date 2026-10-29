// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { HEAD_KEYS } from "../lib/practice/scheduleIII.js";

/**
 * A trial balance, mapped, adjusted, and turned into statements (P3-32).
 *
 * One document per set of financial statements: the lines as they came out
 * of the client's books, the Schedule III head each is mapped to, the
 * journal of adjustments, and the answers that decide which notes are
 * needed.
 *
 * **The lines keep the books' own convention** — debits positive, credits
 * negative — all the way through. The sign is turned once, in
 * `statements()`, at the head's side. Storing "as the books have it" means
 * a mapping mistake shows up as a figure in the wrong place rather than as
 * a figure with the wrong sign, and it means the stored lines still add to
 * the same zero the client's own trial balance did.
 *
 * **Mapping is remembered per client, not per document.** The suggestion
 * for next year comes from this year's mapped ledger names, which is what
 * turns the second year's work from an afternoon into ten minutes.
 */

/** One ledger from the client's books. */
const lineSchema = new mongoose.Schema(
  {
    ledger: { type: String, required: true, trim: true, maxlength: 200 },
    /** The client's own group, kept because it is what the suggestion read. */
    group: { type: String, default: "", trim: true, maxlength: 200 },
    closingPaise: { type: Number, required: true },

    headKey: { type: String, enum: ["", ...HEAD_KEYS], default: "" },
    /**
     * How the head got there, which is the whole point of the screen:
     *
     *  - `unmapped` — nobody has said, and it blocks the statements;
     *  - `suggested` — guessed from the client's own group name, waiting
     *    to be confirmed;
     *  - `remembered` — the same ledger name mapped by a person last year;
     *  - `confirmed` — a person said so on this trial balance.
     *
     * A suggestion that nobody confirms is never treated as a mapping, so
     * the firm can always say who decided where a figure went.
     */
    status: {
      type: String,
      enum: ["unmapped", "suggested", "remembered", "confirmed"],
      default: "unmapped",
    },
    mappedBy: { type: String, default: null },
    mappedByName: { type: String, default: "" },
    note: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { _id: true },
);

export const ADJUSTMENT_STATES = [
  "Proposed",
  "Passed in books",
  "Unadjusted",
];

/**
 * One adjusting entry.
 *
 * **Only "Passed in books" moves the statements.** A proposal is a
 * proposal, and an unadjusted entry is a misstatement the firm has decided
 * to live with — which is exactly what the audit file's misstatement
 * summary is for, so it goes there instead of into the figures.
 */
const adjustmentSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 600 },
    amountPaise: { type: Number, required: true },
    /** Debited head, and the head credited for the same amount. */
    headKey: { type: String, enum: ["", ...HEAD_KEYS], default: "" },
    counterHeadKey: { type: String, enum: ["", ...HEAD_KEYS], default: "" },

    state: { type: String, enum: ADJUSTMENT_STATES, default: "Proposed" },
    /** Where it came from: a sampling exception, an actuarial report. */
    source: { type: String, default: "", trim: true, maxlength: 200 },
    /** The matter raised on the audit file, once an unadjusted one is sent. */
    exceptionId: { type: String, default: null },

    byId: { type: String, default: null },
    byName: { type: String, default: "" },
    at: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const trialBalanceSchema = new mongoose.Schema(
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

    /** The financial year these statements are for: "2025-26". */
    fyLabel: { type: String, required: true, trim: true, maxlength: 20 },
    /** Where the trial balance came from: "Tally, exported 21-10-2026". */
    source: { type: String, default: "", trim: true, maxlength: 200 },

    lines: { type: [lineSchema], default: [] },
    adjustments: { type: [adjustmentSchema], default: [] },

    /** Which of the note questions were answered yes. */
    noteAnswers: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    importedAt: { type: Date, default: null },
    importedBy: { type: String, default: null },
    importedByName: { type: String, default: "" },

    /**
     * Once the statements are settled, the lines and the adjustments stop
     * moving — the same reason a sample is locked. Re-importing a trial
     * balance after the notes have been built is how a set of statements
     * stops matching the papers behind it.
     */
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

trialBalanceSchema.plugin(softDeletePlugin);
trialBalanceSchema.plugin(auditPlugin, {
  entityType: "TrialBalance",
  clientIdField: "clientId",
});

/** One per engagement, and "last year's for this client" for the memory. */
trialBalanceSchema.index({ engagementId: 1 }, { unique: true });
trialBalanceSchema.index({ clientId: 1, createdAt: -1 });
trialBalanceSchema.index({ branchId: 1, locked: 1 });

export default mongoose.models.TrialBalance ??
  mongoose.model("TrialBalance", trialBalanceSchema);
