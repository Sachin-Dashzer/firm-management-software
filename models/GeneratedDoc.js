// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A document produced from a template (P2-8b).
 *
 * **Nothing is stored as a file.** The resolved text is held here and the
 * PDF is rendered from it on demand, the way an invoice's PDF is rendered
 * from the stored figures rather than kept on disk. That makes a final
 * document reproducible byte for byte without a second copy to keep in step
 * — and it avoids inventing a server-side write to the file gateway, which
 * only ever takes uploads from a browser with a signed ticket.
 *
 * A draft holds no text at all: it is re-resolved from live data every time
 * it is opened, because a draft that quietly went stale would be the one
 * thing worse than no draft. Issuing freezes the words.
 */

const generatedDocSchema = new mongoose.Schema(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocTemplate",
      required: true,
    },
    /** Snapshotted, so the record stays readable if a template is renamed. */
    templateCode: { type: String, default: "", trim: true },
    templateName: { type: String, default: "", trim: true },
    templateVersion: { type: Number, default: 1 },

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
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    state: { type: String, enum: ["draft", "final"], default: "draft" },

    /** The words, frozen at issue. Empty on a draft, which re-resolves. */
    title: { type: String, default: "", trim: true },
    bodyText: { type: String, default: "", maxlength: 40000 },

    /** Copied at issue so the document prints what it was signed with. */
    udin: { type: String, default: "", trim: true },
    signatoryName: { type: String, default: "", trim: true },
    signatoryDesignation: { type: String, default: "", trim: true },
    signatoryMembershipNo: { type: String, default: "", trim: true },

    issuedAt: { type: Date, default: null },
    issuedBy: { type: String, default: null },
    issuedByName: { type: String, default: "" },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

generatedDocSchema.plugin(softDeletePlugin);
generatedDocSchema.plugin(auditPlugin, { entityType: "GeneratedDoc" });

generatedDocSchema.index({ clientId: 1, createdAt: -1 });
generatedDocSchema.index({ engagementId: 1, createdAt: -1 });
generatedDocSchema.index({ state: 1, issuedAt: -1 });

export default mongoose.models.GeneratedDoc ??
  mongoose.model("GeneratedDoc", generatedDocSchema);
