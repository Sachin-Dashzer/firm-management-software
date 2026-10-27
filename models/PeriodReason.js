// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { PERIOD_REASONS } from "../lib/compliance/reasons.js";

/**
 * Why one client, one service and one period has no engagement (P3-9).
 *
 * The compliance grid colours cells by status and had no idea what an
 * **empty** cell meant — and empty is the dangerous one, because three
 * different things look identical:
 *
 *  - **our miss** — the firm should have done this and did not. The only
 *    one that is a failure, and the only one that is not recorded here: it
 *    is fixed by creating the engagement, not by writing a note about it
 *  - **handled by another professional** — the client used somebody else
 *    for this period. Not ours, not a miss
 *  - **not engaged for this period** — the client was not with the firm
 *    then. Nothing was owed
 *
 * So this collection holds only the two that explain a hole. The count of
 * "periods with nothing created" then means what it says: periods nobody
 * has an answer for.
 *
 * One row per client, service and period, enforced by a unique index — the
 * same shape as the engagement it stands in place of.
 */

const periodReasonSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    serviceTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceTemplate",
      required: true,
    },
    /** The period code, exactly as an engagement stores it: "2026-10". */
    period: { type: String, required: true, trim: true },
    /** Carried so the branch scope can be applied without a client lookup. */
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    reason: { type: String, enum: PERIOD_REASONS, required: true },
    /**
     * Who the client used instead, or why they were not with us. Optional:
     * sometimes nobody at the firm knows, and a forced guess would be worse
     * than a blank.
     */
    note: { type: String, default: "", trim: true },

    recordedBy: { type: String, default: null },
    recordedByName: { type: String, default: "" },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

periodReasonSchema.plugin(softDeletePlugin);
periodReasonSchema.plugin(auditPlugin, {
  entityType: "PeriodReason",
  clientIdField: "clientId",
});

periodReasonSchema.index(
  { clientId: 1, serviceTemplateId: 1, period: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export default mongoose.models.PeriodReason ??
  mongoose.model("PeriodReason", periodReasonSchema);
