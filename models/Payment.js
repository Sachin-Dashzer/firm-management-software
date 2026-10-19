// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { PAYMENT_MODES } from "../lib/billing/allocation.js";

/**
 * Money received (spec section 7).
 *
 * A payment belongs to the client, not to an invoice: one transfer often
 * covers several bills, and whatever is not allocated sits as credit until
 * someone decides where it goes. That is why the allocations are embedded
 * here rather than the payment being a field on the invoice.
 */

const allocationSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
    },
    amountPaise: { type: Number, default: 0, min: 0 },
    /** TDS the client deducted against this particular invoice. */
    tdsPaise: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

const paymentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    date: { type: Date, required: true, default: () => new Date() },
    /** What actually arrived in the bank. */
    amountPaise: { type: Number, required: true, min: 0 },
    /** What the client says it deducted as TDS, across this payment. */
    tdsPaise: { type: Number, default: 0, min: 0 },

    mode: { type: String, enum: PAYMENT_MODES, default: "Bank transfer" },
    reference: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },

    allocations: { type: [allocationSchema], default: [] },

    /**
     * Ticked by hand once the TDS shows up in Form 26AS (spec section 7:
     * reconciliation is manual in v1).
     */
    tdsSeenIn26AS: { type: Boolean, default: false },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

paymentSchema.plugin(softDeletePlugin);
paymentSchema.plugin(auditPlugin, {
  entityType: "Payment",
  clientIdField: "clientId",
});

paymentSchema.index({ clientId: 1, date: -1 });
paymentSchema.index({ "allocations.invoiceId": 1 });
paymentSchema.index({ branchId: 1, date: -1 });

/** Money received that has not been put against anything yet. */
paymentSchema.virtual("unallocatedPaise").get(function unallocated() {
  const used = (this.allocations ?? []).reduce(
    (sum, a) => sum + (a.amountPaise ?? 0),
    0,
  );
  return Math.max(0, (this.amountPaise ?? 0) - used);
});

export default mongoose.models.Payment ??
  mongoose.model("Payment", paymentSchema);
