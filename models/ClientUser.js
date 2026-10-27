// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A client's own login to the portal (P2-9a).
 *
 * The first account in this system that belongs to somebody outside the
 * firm, which is why it is a **separate collection** rather than a role on
 * `users`. A role is one careless matrix row away from reaching a staff
 * screen; a different collection cannot be given one at all. `can()` refuses
 * anything marked `kind: "client"` on its first line (P2-1), and
 * `currentUser()` looks only in `users` — so a portal token is not a staff
 * token that happens to be weaker, it is not a staff token.
 *
 * **One account sees one client.** A person who runs two companies gets two
 * logins. A join table would be the moment somebody's second company became
 * visible from the first by accident.
 *
 * `passwordHash` and `totpSecret` are `select: false`, like the staff model:
 * they are never loaded unless a query names them.
 */

const clientUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 200,
    },
    /** What they are to the client — Director, Partner, Accountant. */
    designation: { type: String, default: "", trim: true, maxlength: 120 },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    /** Copied from the client, so a list can be scoped without a lookup. */
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    active: { type: Boolean, default: true },

    /**
     * May this person confirm the figures on a return before it is filed
     * (P3-5, P3-6)?
     *
     * Off by default and granted deliberately: the client, not the firm,
     * owes the tax, so the confirmation has to come from somebody the client
     * has actually put in that position — not from whoever at their office
     * happens to have a login for uploading bank statements.
     */
    mayConfirmFigures: { type: Boolean, default: false },

    passwordHash: { type: String, select: false },
    mustChangePassword: { type: Boolean, default: true },

    /**
     * Optional, unlike staff (spec section 16 makes 2FA mandatory for the
     * firm; the brief leaves it to the client). Off by default and turned on
     * per account by the firm.
     */
    totpRequired: { type: Boolean, default: false },
    totpSecret: { type: String, select: false, default: null },
    totpEnabledAt: { type: Date, default: null },
    lastTotpCounter: { type: Number, default: 0, select: false },

    // the same five-and-fifteen as staff, through lib/security/lockout.js
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    lastLoginAt: { type: Date, default: null },
    invitedBy: { type: String, default: null },
    invitedByName: { type: String, default: "" },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

clientUserSchema.plugin(softDeletePlugin);
clientUserSchema.plugin(auditPlugin, { entityType: "ClientUser" });

/**
 * One account per email, across the whole portal. Two clients sharing an
 * address — an accountant who looks after both — would otherwise make a
 * sign-in ambiguous, and the safe answer to an ambiguous sign-in is to
 * refuse the second account rather than guess which company to open.
 */
clientUserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
clientUserSchema.index({ clientId: 1, active: 1 });

export default mongoose.models.ClientUser ??
  mongoose.model("ClientUser", clientUserSchema);
