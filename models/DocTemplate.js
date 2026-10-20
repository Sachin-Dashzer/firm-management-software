// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A document the firm writes over and over (P2-8b, "Based Docs").
 *
 * The body is plain text with `{{client.legalName}}` in it; `lib/docs/resolve.js`
 * holds the closed list of fields a template may use, so no template can
 * reach a PAN or a credential however it is written (CLAUDE.md rule 7).
 *
 * **A template is unapproved until a partner says otherwise.** The eight
 * starter templates are drafted wording, not the firm's words: they produce
 * watermarked drafts and nothing else until somebody with the authority to
 * sign reads them and approves. This is the same stance the due-date master
 * takes toward an unconfirmed rule (CLAUDE.md rule 8) — the system does not
 * put the firm's name to anything a person has not checked.
 */

/** What the document is for; groups the admin screen and the pick list. */
export const DOC_KINDS = [
  "Engagement",
  "Audit and Assurance",
  "Certificate",
  "Correspondence",
];

const docTemplateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    kind: { type: String, enum: DOC_KINDS, default: "Correspondence" },
    /** One line under the title on the admin screen; not printed. */
    description: { type: String, default: "", trim: true, maxlength: 400 },

    /** The heading printed on the document itself. */
    title: { type: String, default: "", trim: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 20000 },

    /**
     * Goes up when the wording changes, exactly like a service template
     * (Step 4): a generated document snapshots the version it was made from,
     * so an old letter stays readable after the template moves on.
     */
    version: { type: Number, default: 1, min: 1 },

    /** Some letters are a partner's whatever the work is tiered at. */
    partnerOnly: { type: Boolean, default: false },
    /** A certificate without a UDIN is not issuable (spec section 16). */
    udinRequired: { type: Boolean, default: false },

    /**
     * Approval of the wording. Until `verifiedAt` is set the template makes
     * drafts only — `checkIssue()` in `lib/docs/rules.js` enforces it.
     */
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null },
    verifiedByName: { type: String, default: "" },

    /** Where the draft wording came from, for whoever has to approve it. */
    sourceNote: { type: String, default: "", trim: true, maxlength: 400 },

    active: { type: Boolean, default: true },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

docTemplateSchema.plugin(softDeletePlugin);
docTemplateSchema.plugin(auditPlugin, { entityType: "DocTemplate" });

docTemplateSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
docTemplateSchema.index({ kind: 1, name: 1 });

docTemplateSchema.virtual("verified").get(function verified() {
  return Boolean(this.verifiedAt);
});

export default mongoose.models.DocTemplate ??
  mongoose.model("DocTemplate", docTemplateSchema);
