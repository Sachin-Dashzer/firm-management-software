// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A service this client is signed up for (spec section 13 `clientServices`).
 *
 * It answers two questions: what does this client pay for this service, and
 * who normally does it — the defaults the create form fills in (spec section
 * 5, "defaults come from the client's service subscription"). Step 7 reads
 * the same records to generate recurring work.
 */
const clientServiceSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    serviceTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceTemplate",
      required: true,
    },

    /** The agreed fee for this client, which may differ from the catalog. */
    feePaise: { type: Number, default: 0, min: 0 },
    /** The first period to generate work for, e.g. "2026-10". */
    startPeriod: { type: String, default: "", trim: true },

    defaultAssigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    defaultReviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    active: { type: Boolean, default: true },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

clientServiceSchema.plugin(softDeletePlugin);
clientServiceSchema.plugin(auditPlugin, {
  entityType: "ClientService",
  clientIdField: "clientId",
});

clientServiceSchema.index(
  { clientId: 1, serviceTemplateId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
clientServiceSchema.index({ serviceTemplateId: 1, active: 1 });

export default mongoose.models.ClientService ??
  mongoose.model("ClientService", clientServiceSchema);
