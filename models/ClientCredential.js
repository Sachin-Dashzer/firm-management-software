// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { PORTALS } from "../lib/validators.js";

/**
 * The credentials vault (spec section 3), kept in its own collection so it
 * never loads with the client (spec section 13).
 *
 * The password is AES-256-GCM ciphertext and `select: false`: reading a
 * client, or listing their logins, does not decrypt anything. Revealing one is
 * a deliberate action that writes an audit entry (spec section 11).
 */
const clientCredentialSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    portal: { type: String, required: true, enum: PORTALS },
    /** e.g. which GSTIN or which director this login belongs to. */
    label: { type: String, default: "", trim: true },
    username: { type: String, required: true, trim: true },
    passwordEncrypted: { type: String, required: true, select: false },
    /** Security questions and the like, also encrypted. */
    notesEncrypted: { type: String, default: null, select: false },
    lastRevealedAt: { type: Date, default: null },
    lastRevealedBy: { type: String, default: null },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

clientCredentialSchema.plugin(softDeletePlugin);
clientCredentialSchema.plugin(auditPlugin, {
  entityType: "ClientCredential",
  clientIdField: "clientId",
});

clientCredentialSchema.index({ clientId: 1, portal: 1 });

export default mongoose.models.ClientCredential ??
  mongoose.model("ClientCredential", clientCredentialSchema);
