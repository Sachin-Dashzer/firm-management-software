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
 * A draft holds no text at all **until somebody edits it**: it is
 * re-resolved from live data every time it is opened, because a draft that
 * quietly went stale would be the one thing worse than no draft. Issuing
 * freezes the words.
 *
 * Hand-editing is the exception the owner asked for (03-11-2026). A
 * template cannot know everything a particular letter has to say, and the
 * alternative people actually used was to export to Word, edit there, and
 * send a file the firm has no record of. So a draft may be edited in
 * place — and the moment it is, `edited` goes true and the re-resolving
 * **stops**, because re-reading the record over somebody's own words would
 * throw them away. From then on the stored `bodyText` is the draft.
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

    /**
     * The words. Frozen at issue; empty on a draft that still re-resolves,
     * and the draft itself once somebody has edited it by hand.
     */
    title: { type: String, default: "", trim: true },
    bodyText: { type: String, default: "", maxlength: 40000 },

    /**
     * Has a person written in this draft?
     *
     * The flag rather than "is `bodyText` empty", because somebody is
     * entitled to delete a paragraph down to nothing and that must not
     * silently hand the letter back to the resolver.
     */
    edited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    editedBy: { type: String, default: null },
    editedByName: { type: String, default: "" },

    /**
     * When the issued document was emailed to the client, and to whom.
     *
     * Kept on the document rather than left in the mail log because "has
     * the client got this?" is a question about the letter, and the answer
     * has to survive the mail queue being pruned.
     */
    sentAt: { type: Date, default: null },
    sentBy: { type: String, default: null },
    sentByName: { type: String, default: "" },
    sentTo: { type: [String], default: [] },

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
