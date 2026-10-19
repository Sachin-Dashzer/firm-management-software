// @ts-check

import mongoose from "mongoose";
import { auditPlugin } from "./plugins/audit.js";
import { SEVERITIES, INCIDENT_STATES } from "../lib/security/incidents.js";

/**
 * The incident log that spec section 16 asks for.
 *
 * A record of something that went wrong, or might have: a laptop left on a
 * train, a password shared over WhatsApp, a client saying they received an
 * email they should not have. Not soft-deletable and not editable away —
 * the whole point of an incident log is that it holds what was true at the
 * time, including the entries somebody would rather forget.
 *
 * The DPDP Rules put a notification duty on the firm when personal data is
 * breached, and the firm's lawyer confirms the process (spec section 16).
 * This is where the facts live so there is something to notify *from*.
 */

// the vocabulary lives in lib/security/incidents.js, so the screens can
// import it without pulling Mongoose into the browser
export { SEVERITIES, INCIDENT_STATES };

const incidentSchema = new mongoose.Schema(
  {
    /** One line, as it would be said out loud. */
    summary: { type: String, required: true, trim: true, maxlength: 200 },

    severity: { type: String, enum: SEVERITIES, default: "Noted" },
    status: { type: String, enum: INCIDENT_STATES, default: "Open" },

    /** When it happened, which is rarely when it was noticed. */
    occurredAt: { type: Date, default: () => new Date() },
    noticedAt: { type: Date, default: () => new Date() },

    /** What happened, in full. Appended to rather than rewritten. */
    detail: { type: String, default: "" },

    /** Whether personal data was involved: the DPDP question. */
    personalData: { type: Boolean, default: false },
    clientsAffected: { type: Number, default: 0 },

    /** Who was told, and when — the notification record. */
    notified: { type: String, default: "", trim: true },
    notifiedAt: { type: Date, default: null },

    /** What was done about it, and what will stop it happening again. */
    action: { type: String, default: "" },

    raisedBy: { type: String, default: null },
    raisedByName: { type: String, default: "" },
    closedAt: { type: Date, default: null },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

// no soft-delete plugin: an incident is never deleted, only closed
incidentSchema.plugin(auditPlugin, { entityType: "Incident" });

incidentSchema.index({ status: 1, occurredAt: -1 });
incidentSchema.index({ severity: 1, occurredAt: -1 });

export default mongoose.models.Incident ??
  mongoose.model("Incident", incidentSchema);
