// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A tax invoice (spec section 7).
 *
 * Every figure is integer paise, and the tax figures are stored rather than
 * recomputed on read: an invoice issued in October 2026 must still print
 * exactly as it printed then, whatever the catalog, the rates or the code
 * do afterwards. The same reasoning as the engagement's template snapshot.
 *
 * `number` is absent until the invoice is issued, because a statutory
 * series cannot have gaps and a draft may never become anything.
 */

export const INVOICE_TYPES = [
  "Tax invoice",
  "Proforma",
  "Bill of supply",
  "Credit note",
];

export const INVOICE_STATUSES = [
  "Draft",
  "Sent",
  "Partially paid",
  "Paid",
  "Disputed",
  "Written off",
  "Cancelled",
];

const lineSchema = new mongoose.Schema(
  {
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engagement",
      default: null,
    },
    description: { type: String, required: true, trim: true },
    sac: { type: String, default: "", trim: true },
    amountPaise: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 18, min: 0, max: 28 },

    // worked out at issue and then left alone
    discountPaise: { type: Number, default: 0, min: 0 },
    netPaise: { type: Number, default: 0, min: 0 },
    cgstPaise: { type: Number, default: 0, min: 0 },
    sgstPaise: { type: Number, default: 0, min: 0 },
    igstPaise: { type: Number, default: 0, min: 0 },
    totalPaise: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

/** Government fees and the like, recovered at cost: no GST (spec §7). */
const reimbursementSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    amountPaise: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const invoiceSchema = new mongoose.Schema(
  {
    /** Absent until issued. See lib/billing/number.js. */
    number: { type: String, default: null },
    series: { type: String, default: "" },

    /**
     * Carried in from the old system at go-live (spec section 17). It is
     * what a client owed on the day the firm switched over, not a tax
     * invoice PHMG issued — so it sits in its own OB/ series, outside the
     * statutory numbering, and every screen can say where it came from.
     */
    isOpeningBalance: { type: Boolean, default: false },
    seq: { type: Number, default: null },

    type: { type: String, enum: INVOICE_TYPES, default: "Tax invoice" },
    status: { type: String, enum: INVOICE_STATUSES, default: "Draft" },

    date: { type: Date, default: () => new Date() },
    dueDate: { type: Date, default: null },

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

    /** Copied at issue, so a later change to either cannot alter history. */
    supplierGstin: { type: String, default: "" },
    billingGstin: { type: String, default: "" },
    placeOfSupply: { type: String, default: "" },
    placeOfSupplyName: { type: String, default: "" },
    billingName: { type: String, default: "" },
    billingAddress: { type: String, default: "" },

    lines: { type: [lineSchema], default: [] },
    reimbursements: { type: [reimbursementSchema], default: [] },

    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountApprovedBy: { type: String, default: null },

    subtotalPaise: { type: Number, default: 0 },
    cgstPaise: { type: Number, default: 0 },
    sgstPaise: { type: Number, default: 0 },
    igstPaise: { type: Number, default: 0 },
    reimbursementTotalPaise: { type: Number, default: 0 },
    totalPaise: { type: Number, default: 0 },

    /** What the client is expected to deduct, not a reduction (spec §7). */
    tdsExpectedPaise: { type: Number, default: 0 },

    /** Kept up to date by payments in Step 8b. */
    paidPaise: { type: Number, default: 0 },
    tdsCreditedPaise: { type: Number, default: 0 },

    notes: { type: String, default: "", trim: true },

    issuedAt: { type: Date, default: null },
    issuedBy: { type: String, default: null },

    /** A credit note says which invoice it cancels or reduces. */
    creditNoteFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    writtenOffReason: { type: String, default: "", trim: true },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

invoiceSchema.plugin(softDeletePlugin);
invoiceSchema.plugin(auditPlugin, {
  entityType: "Invoice",
  clientIdField: "clientId",
});

// the indexes spec section 13 asks for; the number is unique among issued
// invoices, and drafts have none at all
invoiceSchema.index(
  { number: 1 },
  {
    unique: true,
    partialFilterExpression: { number: { $type: "string" } },
  },
);
invoiceSchema.index({ clientId: 1, status: 1, dueDate: 1 });
invoiceSchema.index({ branchId: 1, date: -1 });
invoiceSchema.index({ series: 1, seq: 1 });
invoiceSchema.index({ "lines.engagementId": 1 });

/** Still owed: the total less what has been paid and TDS credited. */
invoiceSchema.virtual("outstandingPaise").get(function outstanding() {
  return Math.max(
    0,
    (this.totalPaise ?? 0) -
      (this.paidPaise ?? 0) -
      (this.tdsCreditedPaise ?? 0),
  );
});

/**
 * Overdue is computed, never stored (spec section 7) — otherwise every
 * invoice would need touching at midnight to stay truthful.
 * @param {Date} [now]
 */
invoiceSchema.methods.isOverdue = function isOverdue(now = new Date()) {
  if (!this.dueDate) return false;
  if (["Paid", "Cancelled", "Written off", "Draft"].includes(this.status)) {
    return false;
  }
  return this.dueDate < now && this.outstandingPaise > 0;
};

export default mongoose.models.Invoice ??
  mongoose.model("Invoice", invoiceSchema);
