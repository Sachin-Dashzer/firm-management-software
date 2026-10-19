// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A stored file (spec section 6).
 *
 * The bytes live in the vault on BigRock; this is the record of what they
 * are, who put them there and what they belong to. Re-uploading over a
 * document keeps the old file: `fileKey` is the current version and
 * `versions[]` holds everything before it, each with its own key, so an
 * earlier copy can always be fetched.
 *
 * `isPermanent` marks the client's permanent file — PAN card, incorporation
 * certificate, MOA/AOA — which any engagement may reference without a second
 * upload.
 */

const versionSchema = new mongoose.Schema(
  {
    fileKey: { type: String, required: true },
    size: { type: Number, default: 0 },
    checksum: { type: String, default: "" },
    uploadedAt: { type: Date, default: () => new Date() },
    uploadedBy: { type: String, default: null },
    uploadedByName: { type: String, default: "" },
  },
  { _id: true },
);

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    fileKey: { type: String, required: true },
    size: { type: Number, default: 0 },
    mime: { type: String, default: "application/octet-stream" },
    checksum: { type: String, default: "" },

    /** Financial year label, e.g. "FY2026-27" — the vault folder too. */
    fy: { type: String, default: "", trim: true },
    isPermanent: { type: Boolean, default: false },
    /** What it is: PAN card, engagement letter, acknowledgement… */
    kind: { type: String, default: "", trim: true },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engagement",
      default: null,
    },
    /** The checklist item this answers, when it answers one. */
    checklistItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    versions: { type: [versionSchema], default: [] },

    /** Erased on a DPDP deletion request: the row stays, the file does not. */
    redactedAt: { type: Date, default: null },

    uploadedBy: { type: String, default: null },
    uploadedByName: { type: String, default: "" },

    /**
     * Kept for at least this many years (spec section 6: eight by default,
     * configurable). Nothing deletes on this date by itself; it is what the
     * retention report in Step 12 reads.
     */
    retainYears: { type: Number, default: 8 },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

documentSchema.plugin(softDeletePlugin);
documentSchema.plugin(auditPlugin, {
  entityType: "Document",
  clientIdField: "clientId",
});

documentSchema.index({ clientId: 1, isPermanent: 1, createdAt: -1 });
documentSchema.index({ engagementId: 1, checklistItemId: 1 });
documentSchema.index({ fileKey: 1 });
documentSchema.index({ name: "text" });
// the recycle bin asks for recently deleted files
documentSchema.index({ deletedAt: -1 });

export default mongoose.models.Document ??
  mongoose.model("Document", documentSchema);
