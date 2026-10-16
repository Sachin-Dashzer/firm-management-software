// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * Family and group linking (spec section 3): a director's own ITR client sits
 * in the same group as their company, so the whole relationship is visible
 * from either side.
 */
const clientGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    notes: { type: String, default: "" },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

clientGroupSchema.plugin(softDeletePlugin);
clientGroupSchema.plugin(auditPlugin, { entityType: "ClientGroup" });

clientGroupSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export default mongoose.models.ClientGroup ??
  mongoose.model("ClientGroup", clientGroupSchema);
