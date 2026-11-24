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

    /**
     * Where the bytes are in the vault.
     *
     * Required until the file is **purged**, which is the one path in this
     * app that destroys anything: the row stays so the firm can show what
     * it held and that it is gone, and the key is emptied because there is
     * nothing left for it to point at. A flat `required: true` refused
     * that empty string, so a partner's purge and the 90-day cron that
     * clears the bin both died on validation — the one operation that
     * frees space on BigRock, failing since the vault was built.
     */
    fileKey: {
      type: String,
      required: function keyUntilPurged() {
        return !this.purgedAt;
      },
    },

    /** When the bytes were destroyed. The record of them outlives them. */
    purgedAt: { type: Date, default: null },

    size: { type: Number, default: 0 },
    mime: { type: String, default: "application/octet-stream" },
    checksum: { type: String, default: "" },

    /** Financial year label, e.g. "FY2026-27" — the vault folder too. */
    fy: { type: String, default: "", trim: true },
    isPermanent: { type: Boolean, default: false },

    /**
     * Is this one of the documents the client may see in their portal
     * (P2-9a)?
     *
     * **False on everything, always, until somebody ticks it.** Switching
     * the portal on must reveal nothing: a working paper, an internal note
     * and a draft all live in the same list as the client's own return, and
     * the safe default for a client-facing flag is off.
     */
    sharedWithClient: { type: Boolean, default: false },
    sharedAt: { type: Date, default: null },
    sharedBy: { type: String, default: null },
    /** What it is: PAN card, engagement letter, acknowledgement… */
    kind: { type: String, default: "", trim: true },

    /**
     * Whose paper this is: one the client gave us, or one the firm prepared
     * and issued to them.
     *
     * Two different things used to sit in one list under one word, "file":
     * the bank statement a client emailed and the signed certificate the
     * firm issued against it. They are not the same record — one is evidence
     * we were given, the other is work the firm is answerable for — and
     * "send me everything we issued to this client last year" had no answer
     * except reading every name in the list.
     *
     * `client` is the default because that is what most of the vault is, and
     * because being wrong in that direction understates what the firm claims
     * to have produced rather than overstating it.
     */
    origin: {
      type: String,
      enum: ["client", "firm"],
      default: "client",
      index: true,
    },

    /**
     * Which of the three places this file lives in (P3-48, and
     * `lib/documents/zones.js`): a client's paper, the firm's own, or one
     * person's private copy.
     *
     * Not indexed on its own — nothing asks for "every firm file" without
     * also saying which folder — but part of the compound indexes below.
     */
    zone: {
      type: String,
      enum: ["client", "firm", "personal"],
      default: "client",
    },
    /** zone "personal": whose it is, and the only person who may read it. */
    ownerId: { type: String, default: null, index: true },

    /**
     * A client's file has a client, and nothing else does.
     *
     * Conditional rather than a flat `required: true`, because the firm's
     * own policies and somebody's own working copies belong to no client and
     * a placeholder client would be a lie the whole app then has to filter
     * out. A row with no zone at all — every file uploaded before this
     * step — still needs its client, which is what the two `!==` say rather
     * than `=== "client"`.
     */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: function requiredForClientFiles() {
        return this.zone !== "firm" && this.zone !== "personal";
      },
    },
    /** The folder somebody filed it in, if any (`models/Folder.js`). */
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true,
    },
    /**
     * The service this is about. Taken from the engagement when there is
     * one, and from the folder's own context when there is not — papers
     * collected for next year's audit before the job exists are still about
     * the audit, and the drive has to put them under it.
     */
    serviceTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceTemplate",
      default: null,
      index: true,
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
    /**
     * The UDIN this file belongs to: the signed certificate itself, and the
     * client papers it rests on. A certificate can be issued outside any
     * engagement, so its documents need somewhere of their own to hang.
     */
    udinId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Udin",
      default: null,
    },
    /**
     * The sample row this is the voucher for (P3-30).
     *
     * A photograph taken on a phone at the client's office belongs to the
     * row it proves, not to the engagement in general: "show me the
     * voucher for item 17" is the question a reviewer asks, and a folder
     * of forty photographs does not answer it. It is a subdocument id
     * inside a `Sample`, so there is no `ref` to give it.
     */
    sampleItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    versions: { type: [versionSchema], default: [] },

    /**
     * The folder this went to the bin with (P3-48c).
     *
     * Deleting a folder sends everything under it down too, and restoring
     * must bring back exactly that and nothing else — a file somebody
     * deleted on its own last week is still deleted, and would otherwise
     * come back because it happens to sit in the same folder.
     */
    deletedWithFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true,
    },

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
documentSchema.index({ udinId: 1, createdAt: -1 });
documentSchema.index({ sampleItemId: 1 });
documentSchema.index({ fileKey: 1 });
documentSchema.index({ name: "text" });
// the drive, listing one folder at a time (P3-48)
documentSchema.index({ zone: 1, folderId: 1, createdAt: -1 });
documentSchema.index({ clientId: 1, serviceTemplateId: 1, fy: 1 });
documentSchema.index({ engagementId: 1, createdAt: -1 });
// the recycle bin asks for recently deleted files
documentSchema.index({ deletedAt: -1 });

export default mongoose.models.Document ??
  mongoose.model("Document", documentSchema);
