// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { ASSURANCE_LEVELS } from "../lib/practice/certificates.js";

/**
 * One certificate the firm has issued, or is drafting (P3-15).
 *
 * Its own record and not a document on an engagement, because a certificate
 * is a thing the firm signed: it goes in a register, it carries a UDIN, and
 * somebody will ask about it years later. The engagement it was done under
 * sits beside it for the fee.
 *
 * The paragraphs are **copied in** when the draft is started, like the
 * audit programme and the engagement's template snapshot: the Guidance
 * Note's wording may be corrected next year and that must not reach back
 * into a certificate already signed.
 */

/** One paragraph of the document, with whether anybody may rewrite it. */
const paragraphSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    /**
     * The Guidance Note's own structure is not a practitioner's prose to
     * improve. What is open is what is particular to this engagement.
     */
    locked: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    text: { type: String, default: "" },
    help: { type: String, default: "", trim: true },
  },
  { _id: true },
);

/** One thing the certificate rests on. */
const evidenceSchema = new mongoose.Schema(
  {
    what: { type: String, required: true, trim: true },
    held: { type: Boolean, default: false },
    notApplicable: { type: Boolean, default: false },
    /** Why it does not apply, or where it is. */
    note: { type: String, default: "", trim: true },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
  },
  { _id: true },
);

const certificateSchema = new mongoose.Schema(
  {
    /** The firm's own serial, gapless within a financial year. */
    number: { type: String, default: "", trim: true },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engagement",
      default: null,
    },

    /** A key of `CERTIFICATE_TYPES`. */
    type: { type: String, required: true, trim: true },
    typeName: { type: String, default: "", trim: true },
    /** Who asked for it: the bank, the consulate, the tendering body. */
    addressee: { type: String, default: "", trim: true },
    purpose: { type: String, default: "", trim: true },

    level: { type: String, enum: ASSURANCE_LEVELS, default: "Reasonable" },
    asOn: { type: Date, default: null },

    paragraphs: { type: [paragraphSchema], default: [] },
    evidence: { type: [evidenceSchema], default: [] },

    /** The one headline amount, where the type carries one. Integer paise. */
    figurePaise: { type: Number, default: null },
    figureBasis: { type: String, default: "", trim: true },

    /** The member who signs, and their number at the time. */
    signerId: { type: String, default: null },
    signerName: { type: String, default: "" },
    signerMembershipNo: { type: String, default: "", trim: true },
    udin: { type: String, default: "", trim: true },

    signedAt: { type: Date, default: null },
    signedBy: { type: String, default: null },
    signedByName: { type: String, default: "" },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

certificateSchema.plugin(softDeletePlugin);
certificateSchema.plugin(auditPlugin, {
  entityType: "Certificate",
  clientIdField: "clientId",
});

/**
 * A UDIN is used once, across the whole firm. The UDIN register (P2-7) has
 * the same rule for the same reason: the number identifies one document.
 */
certificateSchema.index(
  { udin: 1 },
  {
    unique: true,
    partialFilterExpression: {
      udin: { $type: "string", $gt: "" },
      deletedAt: null,
    },
  },
);
certificateSchema.index({ clientId: 1, createdAt: -1 });
certificateSchema.index({ branchId: 1, signedAt: -1 });

export default mongoose.models.Certificate ??
  mongoose.model("Certificate", certificateSchema);
