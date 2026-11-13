// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import {
  SERVICE_CATEGORIES,
  SERVICE_LEVELS,
  RECURRENCES,
  EXEC_ROLES,
  REVIEW_ROLES,
  ITEM_KINDS,
  ITEM_LINK_KEYS,
  STEP_KINDS,
} from "../lib/services/catalog.js";

/**
 * A service the firm sells, defined once (spec section 4).
 *
 * Every engagement is created from one of these, so the checklist, the steps,
 * the turnaround and the fee come pre-filled and stay the same from client to
 * client.
 *
 * Versioning: the engagement copies the template into its own
 * `templateSnapshot` when it is created (spec section 13), so editing a
 * template can never reach back into work already in progress. `version` is
 * therefore only a label for people — it tells you which definition an
 * engagement was started from. It is bumped when the *definition of the work*
 * changes (checklist, steps, level, roles, turnaround, recurrence, UDIN), not
 * when a fee or a typo is corrected. The field-by-field history of every edit
 * is already in the audit log.
 */

const checklistItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** "client" = we need it from them, "firm" = we produce it. */
    side: { type: String, enum: ["client", "firm"], required: true },
    mandatory: { type: Boolean, default: true },
    /**
     * Which step this item belongs to, by position in `steps` (owner
     * request, 03-11-2026).
     *
     * One checklist for a whole job was a list of twenty things in no
     * order, half of them irrelevant to whatever anybody was doing that
     * afternoon. A step has its own list: "Collect data" wants the bank
     * statements and the 26AS, "Prepare the computation" wants the
     * reconciliation tied out and last year's return to hand.
     *
     * `null` means the item belongs to the job rather than to one step —
     * which is what every item meant before this field existed, so
     * existing services and every engagement already created keep working
     * exactly as they did. Those items are gathered under step one, where
     * the old single checklist effectively sat.
     *
     * It is a **position, not an id**: the steps are reordered and
     * rewritten as one array by the catalog form, and an id would be
     * orphaned by the next edit. `lib/services/catalog.js` re-maps these
     * when steps move, and anything out of range falls back to `null`.
     */
    stepIndex: { type: Number, default: null, min: 0 },

    /**
     * What the row asks somebody to do (owner request, 12-11-2026).
     *
     * `upload` is a document: a file arrives and a person accepts it, which
     * is what every row written before this field meant — so the default
     * keeps every service and every job already created exactly as it was.
     *
     * The other three are the rows the firm was writing as documents and
     * nobody could ever satisfy: `tick` for something to confirm, `link`
     * for work done on another screen, `doc` for a letter drafted from one
     * of the firm's own templates. See `ITEM_KINDS` for why.
     */
    kind: { type: String, enum: ITEM_KINDS, default: "upload" },

    /** For `link` only: which screen, by key from `ITEM_LINKS`. */
    linkTo: { type: String, enum: ["", ...ITEM_LINK_KEYS], default: "" },

    /** For `doc` only: which letter template the job drafts from. */
    docTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocTemplate",
      default: null,
    },
  },
  { _id: true },
);

const stepSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /**
     * The minimum role for this one step, which lets a B-tier service carry
     * an A-tier step: an employee prepares the audit file, and "Sign the
     * report" is a CA's. Empty means inherit the service's `minExecRole`,
     * which is what every step did before this field existed.
     */
    minRole: { type: String, enum: ["", ...EXEC_ROLES], default: "" },

    /**
     * Ordinary work, or the UDIN step (owner request, 12-11-2026).
     *
     * `udin` is the step that carries the number: the question, the way into
     * the register, and the refusal to close until a number is recorded. It
     * is also how `udinRequired` below is now decided, so a service says
     * *when* the UDIN is wanted rather than only that it is.
     */
    kind: { type: String, enum: STEP_KINDS, default: "" },
  },
  { _id: true },
);

const serviceTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    level: { type: String, enum: SERVICE_LEVELS, required: true },

    // who may do the work, and who may sign it off (spec section 2 roles)
    minExecRole: { type: String, enum: EXEC_ROLES, required: true },
    minReviewRole: { type: String, enum: REVIEW_ROLES, required: true },

    /**
     * Working days from start to delivery. `null` means the date comes from a
     * statutory deadline or an agreement rather than a count of days — see
     * `turnaroundNote`, and the due-date master in Step 7.
     */
    turnaroundDays: { type: Number, default: null, min: 0 },

    /**
     * How long one of these takes to prepare, in hours (P3-16).
     *
     * Null until the firm says, like the fee and the SAC code: a guessed
     * estimate would drive a workload board that looks authoritative and
     * is not. The board shows hours against capacity only where every job
     * in the lane has one, and counts jobs otherwise.
     *
     * Preparation only. Nobody has estimated review effort, and a fraction
     * of this one would be a number the firm never agreed to.
     */
    effortHours: { type: Number, default: null, min: 0, max: 200 },
    turnaroundNote: { type: String, default: "", trim: true },
    /** Filled in Step 7, when the due-date master exists. */
    dueRuleId: { type: mongoose.Schema.Types.ObjectId, default: null },

    recurrence: { type: String, enum: RECURRENCES, required: true },

    checklist: { type: [checklistItemSchema], default: [] },
    steps: { type: [stepSchema], default: [] },

    // billing defaults (spec section 7 uses these when raising an invoice)
    sac: { type: String, default: "", trim: true },
    defaultFeePaise: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, default: 18, min: 0, max: 28 },

    /**
     * **Derived, not chosen** (owner request, 12-11-2026).
     *
     * It used to be a checkbox in the billing defaults, miles from the work
     * it described: it said a number would be demanded at completion and
     * never said at which point in the job anybody was supposed to get one.
     * Now `saveService` writes it from the steps — true exactly when one of
     * them is the UDIN step — and the field stays because the completion
     * gate, the reviewer's checklist and the certificate rules all read it.
     */
    udinRequired: { type: Boolean, default: false },

    /**
     * Does the client confirm the figures before anything is filed (P3-5)?
     *
     * True for GST, GSTR-9, TDS and the two ITRs (owner, 26-10-2026), and
     * false for assurance work, which carries its own sign-off and
     * representation letters. It lives on the template rather than in a list
     * in the code so the firm can change its mind in Settings.
     */
    clientConfirmationRequired: { type: Boolean, default: false },

    version: { type: Number, default: 1, min: 1 },
    active: { type: Boolean, default: true },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

serviceTemplateSchema.plugin(softDeletePlugin);
serviceTemplateSchema.plugin(auditPlugin, { entityType: "ServiceTemplate" });

serviceTemplateSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
serviceTemplateSchema.index({ category: 1, name: 1 });

export default mongoose.models.ServiceTemplate ||
  mongoose.model("ServiceTemplate", serviceTemplateSchema);
