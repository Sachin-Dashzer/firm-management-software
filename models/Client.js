// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import {
  BILLING_CYCLES,
  CLIENT_STATUSES,
  ENTITY_TYPES,
  RISK_RATINGS,
  TURNOVER_BANDS,
} from "../lib/validators.js";

/**
 * The client record (spec section 3), the anchor every engagement, document
 * and invoice hangs off.
 *
 * Contacts, GSTINs, addresses and fee agreements are embedded: they are always
 * read with the client and stay small (spec section 13). Portal logins are
 * *not* here — they live in `clientCredentials` so they never load with the
 * client by accident.
 *
 * Aadhaar is encrypted and never queried, so it is stored as ciphertext with
 * the last four digits kept separately for display.
 */

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    designation: { type: String, default: "", trim: true },
    mobile: { type: String, default: "", trim: true },
    whatsapp: { type: String, default: "", trim: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    primary: { type: Boolean, default: false },
    /** Per-client opt-out of WhatsApp reminders (spec section 12). */
    whatsappOptOut: { type: Boolean, default: false },
  },
  { _id: true },
);

const gstinSchema = new mongoose.Schema(
  {
    gstin: { type: String, required: true, uppercase: true, trim: true },
    state: { type: String, default: "" },
    stateCode: { type: String, default: "" },
    registeredOn: Date,
    /** QRMP filers file GSTR-1 quarterly but pay monthly (spec section 4). */
    qrmp: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { _id: true },
);

const addressSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["Registered", "Correspondence"],
      default: "Registered",
    },
    line1: { type: String, default: "" },
    line2: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },
  },
  { _id: true },
);

const feeAgreementSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    /** Integer paise, always (CLAUDE.md rule 5). */
    amountPaise: { type: Number, required: true, min: 0 },
    recurrence: {
      type: String,
      enum: ["One-time", "Monthly", "Quarterly", "Half-yearly", "Annual"],
      default: "One-time",
    },
    agreedOn: Date,
    notes: { type: String, default: "" },
  },
  { _id: true },
);

const clientSchema = new mongoose.Schema(
  {
    // --- identity ---
    code: { type: String, required: true, uppercase: true, trim: true },
    legalName: { type: String, required: true, trim: true },
    tradeName: { type: String, default: "", trim: true },
    entityType: { type: String, required: true, enum: ENTITY_TYPES },
    /** Date of incorporation, or date of birth for an individual. */
    establishedOn: Date,

    // --- statutory identifiers ---
    pan: { type: String, default: "", uppercase: true, trim: true },
    tan: { type: String, default: "", uppercase: true, trim: true },
    cin: { type: String, default: "", uppercase: true, trim: true },
    udyam: { type: String, default: "", uppercase: true, trim: true },
    iec: { type: String, default: "", uppercase: true, trim: true },
    /** AES-256-GCM ciphertext; never selected unless asked for by name. */
    aadhaarEncrypted: { type: String, default: null, select: false },
    /** For display: "XXXXXXXX9012" needs only the last four (spec section 16). */
    aadhaarLast4: { type: String, default: "" },

    /**
     * Set when a DPDP deletion request has been actioned (spec section 16).
     * The record stays so the statutory history still has something to
     * point at; what identified a person is gone. See lib/dpdp.
     */
    redactedAt: { type: Date, default: null },
    redactedBy: { type: String, default: null },
    redactionReason: { type: String, default: "", trim: true },

    gstins: { type: [gstinSchema], default: [] },
    contacts: { type: [contactSchema], default: [] },
    addresses: { type: [addressSchema], default: [] },
    feeAgreements: { type: [feeAgreementSchema], default: [] },

    // --- firm side ---
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    clientPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    relationshipManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientGroup",
      default: null,
    },
    onboardedOn: Date,
    referralSource: { type: String, default: "" },

    // --- classification ---
    industry: { type: String, default: "" },
    turnoverBand: { type: String, enum: ["", ...TURNOVER_BANDS], default: "" },
    risk: { type: String, enum: RISK_RATINGS, default: "Low" },
    tags: { type: [String], default: [] },

    status: { type: String, enum: CLIENT_STATUSES, default: "Lead" },
    /** Why the client is on hold or closed; mandatory for those statuses. */
    statusReason: { type: String, default: "" },

    // --- commercials ---
    billingCycle: {
      type: String,
      enum: BILLING_CYCLES,
      default: "Per engagement",
    },
    creditDays: { type: Number, default: 15, min: 0, max: 365 },
    invoiceEmail: { type: String, default: "", lowercase: true, trim: true },

    // --- the quote captured while still a lead (spec section 3) ---
    proposedServices: { type: String, default: "" },
    quotedAmountPaise: { type: Number, default: 0, min: 0 },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

clientSchema.plugin(softDeletePlugin);
clientSchema.plugin(auditPlugin, { entityType: "Client" });

// the indexes spec section 13 asks for, unique only among live records
clientSchema.index(
  { pan: 1 },
  {
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      pan: { $type: "string", $ne: "" },
    },
  },
);
clientSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
clientSchema.index({ "gstins.gstin": 1 });
clientSchema.index({ branchId: 1, status: 1 });
clientSchema.index({ legalName: 1 });
clientSchema.index({ "contacts.mobile": 1 });
clientSchema.index({ groupId: 1 });

/** The name to show: trade name if there is one, legal name otherwise. */
clientSchema.virtual("displayName").get(function displayName() {
  return this.tradeName || this.legalName;
});

/** Exactly one contact is the primary one. */
clientSchema.pre("validate", function onePrimaryContact() {
  if (this.contacts?.length) {
    const primaries = this.contacts.filter((c) => c.primary);
    if (primaries.length === 0) this.contacts[0].primary = true;
    if (primaries.length > 1) {
      primaries.slice(1).forEach((c) => {
        c.primary = false;
      });
    }
  }
});

/** On hold and Closed need a reason recorded (spec section 5 does the same). */
clientSchema.pre("validate", function reasonRequired() {
  if (
    ["On hold", "Closed"].includes(this.status) &&
    !String(this.statusReason ?? "").trim()
  ) {
    this.invalidate(
      "statusReason",
      `A client set to ${this.status} needs a reason`,
    );
  }
});

export default mongoose.models.Client ?? mongoose.model("Client", clientSchema);
