// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { SECTIONS } from "../lib/access/sections.js";

/**
 * A Client Access Grant: one CA's decision to open one client to one person
 * (owner decision D3, 19-10-2026).
 *
 * Under spec section 2 an employee or an articled intern sees a client only
 * through work on their desk. That is too narrow for real life — somebody has
 * to be able to look things up for a client they are not formally assigned to
 * — so a CA or a Partner may widen it deliberately, for named sections, with
 * a reason, and the grant is audited like everything else.
 *
 * Three things keep it honest:
 *
 *  - `reason` is required. A grant nobody can explain is one nobody reviews,
 *    and spec section 16 treats client confidentiality as an ICAI obligation.
 *  - `sections` can never exceed the role's ceiling (`lib/access/sections.js`).
 *    The vault and the fees are not in any ceiling below CA, so no value of
 *    this field opens them.
 *  - An expiry is honoured when the grant is *read*, not when a nightly job
 *    gets round to it. The job only tidies up (`jobs/expireGrants.js`).
 */
const clientAccessSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    /** The client's branch when the grant was given, for the access review. */
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    sections: {
      type: [{ type: String, enum: SECTIONS }],
      default: [],
      validate: {
        validator: (v) => v.length > 0,
        message: "A grant has to open at least one section",
      },
    },

    /** Why this person needs this client. Short, and shown on every review. */
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    /** Null means no end date; a date in the past stops working at read time. */
    expiresAt: { type: Date, default: null },

    active: { type: Boolean, default: true },
    grantedBy: { type: String, default: null },
    grantedByName: { type: String, default: "" },
    revokedBy: { type: String, default: null },
    revokedAt: { type: Date, default: null },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

clientAccessSchema.plugin(softDeletePlugin);
clientAccessSchema.plugin(auditPlugin, {
  entityType: "ClientAccess",
  clientIdField: "clientId",
});

// one grant per person per client: widening an existing one is an edit, which
// leaves an audit entry saying what changed, rather than a second row
clientAccessSchema.index(
  { userId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// "who can see this client?" on the client's Team and access tab
clientAccessSchema.index({ clientId: 1, active: 1 });
// the nightly tidy-up
clientAccessSchema.index({ expiresAt: 1 });

export default mongoose.models.ClientAccess ??
  mongoose.model("ClientAccess", clientAccessSchema);
