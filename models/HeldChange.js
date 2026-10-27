// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * One change to a client's identity, waiting for a partner (P3-18a).
 *
 * The firm's own answer to the thing a spreadsheet does best: forty PANs
 * rewritten by a cell somebody dragged down. A sheet uploaded by anybody
 * but a partner cannot change a legal name, a PAN, a GSTIN, the branch,
 * the group or the status — those land here instead, one row per field, and
 * a partner decides on each.
 *
 * It holds **both** values. `from` is what makes a decline honest and an
 * undo exact; `to` is what gets written on approval. Neither is read from
 * the sheet again — the file may be gone by then, and the person who
 * uploaded it may have moved on.
 *
 * Approving one goes back through the ordinary client update, so the
 * duplicate check and the field-level audit entry happen exactly as they
 * would if somebody had typed it on the client's own page.
 */

const heldChangeSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    /** The client's name as it was, so the queue reads without a join. */
    clientName: { type: String, default: "", trim: true },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    /** The field on the client, and its name in words. */
    field: { type: String, required: true, trim: true },
    label: { type: String, default: "", trim: true },

    /** What it was and what it would become, as values, not as text. */
    from: { type: mongoose.Schema.Types.Mixed, default: null },
    to: { type: mongoose.Schema.Types.Mixed, default: null },
    /** The same two, as the preview showed them, for the queue. */
    fromText: { type: String, default: "", trim: true },
    toText: { type: String, default: "", trim: true },

    /** Where it came from: a sheet, and whose. */
    source: { type: String, default: "Bulk sheet", trim: true },
    askedBy: { type: String, default: null },
    askedByName: { type: String, default: "", trim: true },

    state: {
      type: String,
      enum: ["pending", "applied", "declined"],
      default: "pending",
    },
    decidedBy: { type: String, default: null },
    decidedByName: { type: String, default: "", trim: true },
    decidedAt: { type: Date, default: null },
    /** Why it was declined. Required by the action, not by the schema. */
    reason: { type: String, default: "", trim: true },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

heldChangeSchema.plugin(softDeletePlugin);
heldChangeSchema.plugin(auditPlugin, {
  entityType: "HeldChange",
  clientIdField: "clientId",
});

/** The queue's own query, and the count on Issues. */
heldChangeSchema.index({ state: 1, createdAt: -1 });
heldChangeSchema.index({ clientId: 1, state: 1 });

export default mongoose.models.HeldChange ??
  mongoose.model("HeldChange", heldChangeSchema);
