// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

export const POTENTIAL_STATUSES = ["Talking", "Converted", "Dropped"];

/**
 * Somebody the firm is talking to, who is not a client yet (owner request,
 * 04-11-2026). The firm's own word for it is a **potential client**.
 *
 * ## Why this is not a `Client` with `status: "Lead"`
 *
 * That status exists and is what onboarding writes, but a `Client` needs a
 * code, a legal name, an entity type and a branch before Mongoose will
 * accept it, and the wizard that fills those in is seven steps long. A
 * conversation is not that. It is a name somebody heard at a wedding, a
 * number, and a line about what they want — and if writing it down costs
 * more than a WhatsApp message to oneself, it does not get written down,
 * which is how a firm forgets a lead.
 *
 * So four fields, and nothing is required of a conversation that a
 * conversation does not have. What it must have is a way to reach them:
 * a name with no number and no email is a note, not a lead, and the
 * action refuses it (see `app/(app)/potentials/actions.js`).
 *
 * ## What happens when they say yes
 *
 * This record is **not** turned into a client in place. It hands its four
 * fields to the onboarding wizard as a starting point
 * (`/clients/new?from=<id>`), the wizard does what it always does, and on
 * success this row is marked `Converted` and keeps `clientId` — so the
 * register still shows who came from where, and nobody is onboarded twice.
 * One path into the client list, which is the whole reason the duplicate
 * check and the engagement pack can be trusted.
 *
 * ## Remarks are one field on purpose
 *
 * Not a thread of notes. Every edit is audited with its before and after
 * (CLAUDE.md rule 2), so the history of the conversation is already kept
 * where it cannot be edited, and the field stays something a person can
 * fix after a phone call rather than a log they have to curate.
 */
const potentialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },

    /** Ten digits, as `checkMobile` normalises them. */
    mobile: { type: String, default: "", trim: true },
    email: { type: String, default: "", lowercase: true, trim: true },

    /** What they want, what was quoted, what was said. Free text. */
    remarks: { type: String, default: "", trim: true, maxlength: 2000 },

    /**
     * When to pick the conversation up again (owner request, 04-11-2026).
     *
     * IST midnight, or null — and null is the common case, not a gap in the
     * record: plenty of enquiries are "he will ring us". Stored as a day
     * rather than a moment because that is what somebody means by "ring him
     * Tuesday", and read through `istDayFromInput` so a date box cannot
     * land a day out (see `lib/dates.js`).
     *
     * **It does not send anything.** No reminder, no email, no sweep: the
     * register's own screen counts what is due and leads with it. A date
     * that mails the firm is the notification rules' job and would want a
     * rule key, a template and quiet hours behind it.
     */
    followUpOn: { type: Date, default: null },

    status: {
      type: String,
      enum: POTENTIAL_STATUSES,
      default: "Talking",
    },

    /**
     * Which office is talking to them, so a CA reads their own branch's
     * register (spec section 2). Taken from whoever wrote the row down.
     */
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    /** The client they became. Set only by the onboarding wizard. */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    convertedAt: { type: Date, default: null },

    createdBy: { type: String, default: null },
    createdByName: { type: String, default: "" },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

potentialSchema.plugin(softDeletePlugin);
potentialSchema.plugin(auditPlugin, {
  entityType: "Potential",
  /* once converted, the trail belongs on the client's own activity tab too */
  clientIdField: "clientId",
});

/** "Who are we talking to, most recently touched first." */
potentialSchema.index({ status: 1, updatedAt: -1 });
/** "Who is due a call?" — the register's opening question. */
potentialSchema.index({ status: 1, followUpOn: 1 });
potentialSchema.index({ branchId: 1, status: 1, updatedAt: -1 });
/** "Are we already talking to this number?" — the duplicate check. */
potentialSchema.index({ mobile: 1 });
/** "Which conversation did this client come from?" — the client's own file. */
potentialSchema.index({ clientId: 1 });

export default mongoose.models.Potential ??
  mongoose.model("Potential", potentialSchema);
