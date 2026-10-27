// @ts-check

import mongoose from "mongoose";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A partner has read one rule the firm is going to rely on, and says it is
 * right (P3-11, P3-12, P3-13).
 *
 * CLAUDE.md rule 8 again, and the same shape `DueDateRule.verifiedAt`
 * already uses: the rules live in code (`lib/practice/noticeLaw.js`) because
 * they are a first draft nobody should be able to edit into something
 * plausible-looking, and the *confirmation* lives here because it is a fact
 * about a person and a date.
 *
 * One row per kind and rule, where `kind` says which table: a notice kind
 * such as `SCN74`, the GST set-off order, or an audit area. It was named
 * after notices when it only held them; the third use made the name wrong,
 * and nothing had ever run against a database, so it was renamed rather than
 * left to mislead.
 *
 * No row means not confirmed, which is why
 * the absence of a row has to be the default state everywhere that reads
 * this — and it is: `lawClocks` shows no date without one.
 *
 * Confirmations are never deleted, only superseded by a fresh one: a partner
 * confirmed a limitation period last year, the firm relied on it, and that
 * is part of the record whether or not the law has since changed.
 */

const confirmationSchema = new mongoose.Schema(
  {
    /** Which table: a `NOTICE_KINDS` key, `GST-SETOFF`, or an audit area. */
    kind: { type: String, required: true, trim: true },
    /** The rule's own key within that kind. */
    key: { type: String, required: true, trim: true },

    /** The wording that was confirmed, copied in, so a later edit is visible. */
    text: { type: String, default: "", trim: true },
    cite: { type: String, default: "", trim: true },

    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: String, default: null },
    confirmedByName: { type: String, default: "" },
    /** A partner's own note: a proviso, a case, a date they checked it to. */
    note: { type: String, default: "", trim: true },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

confirmationSchema.plugin(auditPlugin, {
  entityType: "RuleConfirmation",
});

confirmationSchema.index({ kind: 1, key: 1 }, { unique: true });

export default mongoose.models.RuleConfirmation ??
  mongoose.model("RuleConfirmation", confirmationSchema);
