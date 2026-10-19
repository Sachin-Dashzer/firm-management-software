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
  },
  { _id: true },
);

const stepSchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true } },
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

    udinRequired: { type: Boolean, default: false },

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
