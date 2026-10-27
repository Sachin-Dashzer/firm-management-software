// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import {
  NOTICE_LAWS,
  NOTICE_STAGES,
  SUBMISSION_TYPES,
} from "../lib/practice/noticeLaw.js";

/**
 * A notice, as a matter rather than a job (P3-11).
 *
 * The starter catalog has "Income tax notice / assessment reply" as one
 * service with one due date, which is how the firm would track a letter.
 * It is not how a notice behaves. A notice runs for months, takes several
 * submissions each with its own date and acknowledgement, gets heard and
 * adjourned, and sits under statutory limits that are not written on it
 * anywhere.
 *
 * So this is its own record, and the engagement it was created from (if
 * any) stays beside it for the fee.
 */

/** One thing the firm filed, or owes. */
const submissionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: SUBMISSION_TYPES, required: true },
    /** The date the department gave, or the firm's own target. */
    dueDate: { type: Date, default: null },
    filedOn: { type: Date, default: null },
    /** Whatever the portal gave back. A filing nobody can evidence is a claim. */
    ackNo: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    preparedBy: { type: String, default: null },
    preparedByName: { type: String, default: "" },
    filedBy: { type: String, default: null },
    filedByName: { type: String, default: "" },
  },
  { _id: true },
);

/**
 * One hearing. `adjourned` is the field the law cares about: s.75(5) CGST
 * caps how often a personal hearing may be put off, so the count has to be
 * a fact on the record rather than something read out of a note.
 */
const hearingSchema = new mongoose.Schema(
  {
    on: { type: Date, required: true },
    heldOn: { type: Date, default: null },
    mode: { type: String, default: "", trim: true },
    attendedBy: { type: String, default: null },
    attendedByName: { type: String, default: "" },
    outcome: { type: String, default: "", trim: true },
    adjourned: { type: Boolean, default: false },
    adjournmentReason: { type: String, default: "", trim: true },
    /** Whose doing: ours, theirs, or neither. It changes how the next ask lands. */
    adjournedBy: { type: String, default: "", trim: true },
  },
  { _id: true },
);

/** One point in dispute, the firm's answer to it, and what backs the answer. */
const groundSchema = new mongoose.Schema(
  {
    point: { type: String, required: true, trim: true },
    ourGround: { type: String, default: "", trim: true },
    evidence: { type: String, default: "", trim: true },
    settled: { type: Boolean, default: false },
  },
  { _id: true },
);

/** One document in the bundle, in the order it is to be read. */
const paperSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    pages: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
  },
  { _id: true },
);

const noticeSchema = new mongoose.Schema(
  {
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
    /** The engagement the fee hangs off, where there is one. */
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engagement",
      default: null,
    },

    law: { type: String, enum: NOTICE_LAWS, required: true },
    /** A key into `NOTICE_KINDS`, which is where the law table lives. */
    kind: { type: String, required: true, trim: true },
    /** The section as it is written on the notice, which is what staff search for. */
    section: { type: String, default: "", trim: true },
    /** "AY 2019-20" or "FY 2020-21" — the department's own words. */
    period: { type: String, default: "", trim: true },

    /**
     * The department's document number. Unique where it exists: two matters
     * with one DIN means somebody has entered the same notice twice, and
     * finding that out in a year is too late.
     */
    din: { type: String, default: "", trim: true },
    authority: { type: String, default: "", trim: true },

    noticeDate: { type: Date, default: null },
    servedOn: { type: Date, default: null },
    /** For the GST rules that count from the annual return rather than the notice. */
    annualReturnDue: { type: Date, default: null },
    orderDate: { type: Date, default: null },
    orderNote: { type: String, default: "", trim: true },

    issue: { type: String, default: "", trim: true },
    stakePaise: { type: Number, default: 0, min: 0 },
    demandPaise: { type: Number, default: 0, min: 0 },

    stage: { type: String, enum: NOTICE_STAGES, default: "Notice received" },
    risk: { type: String, default: "", trim: true },
    partnerId: { type: String, default: null },
    assigneeId: { type: String, default: null },

    submissions: { type: [submissionSchema], default: [] },
    hearings: { type: [hearingSchema], default: [] },
    grounds: { type: [groundSchema], default: [] },
    /** The bundle's index. Binding the PDF itself is not done; see PROGRESS. */
    paperBook: { type: [paperSchema], default: [] },

    /**
     * The same matter in words the client can act on: what the department
     * thinks, what the firm is doing, and whether money is due now. No
     * section numbers — `checkPlainWords` refuses them.
     */
    plainWords: { type: String, default: "", trim: true },

    closedAt: { type: Date, default: null },
    closedNote: { type: String, default: "", trim: true },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

noticeSchema.plugin(softDeletePlugin);
noticeSchema.plugin(auditPlugin, {
  entityType: "Notice",
  clientIdField: "clientId",
});

noticeSchema.index(
  { din: 1 },
  {
    unique: true,
    partialFilterExpression: {
      din: { $type: "string", $gt: "" },
      deletedAt: null,
    },
  },
);
noticeSchema.index({ clientId: 1, createdAt: -1 });
noticeSchema.index({ branchId: 1, stage: 1 });

export default mongoose.models.Notice ?? mongoose.model("Notice", noticeSchema);
