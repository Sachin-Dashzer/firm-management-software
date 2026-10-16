// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/** The firm's offices (spec section 13). Invoice series are per branch. */
const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, "Branch code is three letters, e.g. NOI"],
    },
    address: { type: String, default: "" },
    gstin: {
      type: String,
      uppercase: true,
      trim: true,
      default: "",
      validate: {
        validator: (v) =>
          v === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/.test(v),
        message: "Not a valid GSTIN",
      },
    },
    // prefix for invoice numbers, e.g. NOI in NOI/26-27/0087
    invoicePrefix: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

branchSchema.plugin(softDeletePlugin);
branchSchema.plugin(auditPlugin, { entityType: "Branch" });

// unique among live branches, so a soft-deleted code can be reused
branchSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export default mongoose.models.Branch ?? mongoose.model("Branch", branchSchema);
