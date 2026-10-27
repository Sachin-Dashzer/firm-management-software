// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { AUDIT_STAGES } from "../lib/audit-studio/standards.js";
import { EXCEPTION_STATES, RISKS } from "../lib/audit-studio/exceptions.js";

/**
 * The working-paper file for one audit (P3-13).
 *
 * One per audit engagement, and its own record rather than fields on the
 * engagement: an audit file is read as a file — stage by stage, area by
 * area — and it outlives the engagement's own lifecycle, because a peer
 * reviewer opens it two years after the job was billed.
 *
 * The programme is **copied in** at creation from
 * `lib/audit-studio/standards.js`, the same rule the engagement's template
 * snapshot follows: changing the firm's programme next year must not reach
 * back into a file that has been signed.
 */

/** One question on the programme for an area. */
const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    doneBy: { type: String, default: null },
    doneByName: { type: String, default: "" },
    /** What was actually done, where the answer is not simply yes. */
    note: { type: String, default: "", trim: true },
  },
  { _id: true },
);

const areaSchema = new mongoose.Schema(
  {
    /** The letter the working papers are filed under: A, B, C, E… */
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    /** The references, as stated — pointers, not authority. */
    standards: { type: String, default: "", trim: true },
    stage: { type: String, default: "", trim: true },
    questions: { type: [questionSchema], default: [] },
  },
  { _id: true },
);

/** One step in an exception's life, kept rather than overwritten. */
const trailSchema = new mongoose.Schema(
  {
    at: { type: Date, default: () => new Date() },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
    byId: { type: String, default: null },
    byName: { type: String, default: "" },
    reason: { type: String, default: "", trim: true },
  },
  { _id: false },
);

/**
 * Something the audit found.
 *
 * `amountPaise` is the money effect where there is one. `explanation` and
 * `declineReason` are kept separately from `lastReason` because they are
 * the two that the file has to be able to produce years later: the evidence
 * for not adjusting, and what management actually said.
 */
const exceptionSchema = new mongoose.Schema(
  {
    /** The area's letter, so the index can count what is open where. */
    area: { type: String, default: "", trim: true },
    /** The ledger test that found it, where one did (P3-14). */
    test: { type: String, default: "", trim: true },
    what: { type: String, required: true, trim: true },
    risk: { type: String, enum: RISKS, default: "Medium" },
    amountPaise: { type: Number, default: 0 },

    state: { type: String, enum: EXCEPTION_STATES, default: "Open" },
    lastReason: { type: String, default: "", trim: true },
    /** Why it is not an issue. Partner-only, and mandatory to set. */
    explanation: { type: String, default: "", trim: true },
    /** What management said when they would not adjust it. */
    declineReason: { type: String, default: "", trim: true },

    /**
     * What this matter does to the report, where it does anything (P3-14):
     * "Qualify", "Adverse", or "Emphasis". Empty means it does not reach
     * the report, which is the ordinary case and has to be said rather than
     * assumed.
     */
    reportEffect: { type: String, default: "", trim: true },
    reportWording: { type: String, default: "", trim: true },

    trail: { type: [trailSchema], default: [] },

    raisedBy: { type: String, default: null },
    raisedByName: { type: String, default: "" },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

/**
 * One of the sixteen ledger tests, as the firm recorded running it (P3-14).
 *
 * `wholePopulation` is the field that matters: "tested all 14,286 vouchers"
 * and "looked at twenty-five of them" are different audits, and a file that
 * cannot say which cannot answer the only question a reviewer asks about
 * scope. Null means nobody has said.
 */
const ledgerTestSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    area: { type: String, default: "", trim: true },
    name: { type: String, default: "", trim: true },
    /** The authority: a standard, a section, or a clause. */
    ref: { type: String, default: "", trim: true },

    /** What it was run over, in the firm's words: "14,286 vouchers". */
    population: { type: String, default: "", trim: true },
    wholePopulation: { type: Boolean, default: null },
    flags: { type: Number, default: null },
    note: { type: String, default: "", trim: true },

    ranAt: { type: Date, default: null },
    ranBy: { type: String, default: null },
    ranByName: { type: String, default: "" },
  },
  { _id: true },
);

/** One CARO or 3CD clause, answered by a person from the evidence. */
const reportAnswerSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    no: { type: String, default: "", trim: true },
    what: { type: String, default: "", trim: true },
    kind: { type: String, default: "", trim: true },

    answer: { type: String, default: "", trim: true },
    notApplicable: { type: Boolean, default: false },
    answeredBy: { type: String, default: null },
    answeredByName: { type: String, default: "" },
    answeredAt: { type: Date, default: null },
  },
  { _id: true },
);

/**
 * One version of the report, as it was issued (P3-14).
 *
 * A snapshot, never edited. The second version of a report does not replace
 * the first: the first went out, somebody relied on it, and that is a fact
 * about the world regardless of what the firm thinks now.
 */
const signedReportSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    signedAt: { type: Date, required: true },
    signedBy: { type: String, default: null },
    signedByName: { type: String, default: "" },
    /** Its own UDIN. An amended report never carries the earlier one's. */
    udin: { type: String, default: "", trim: true },
    opinionType: { type: String, default: "", trim: true },
    emphasis: { type: String, default: "", trim: true },
    matters: { type: [String], default: [] },
    overall: { type: String, default: "" },
    text: { type: String, default: "" },
  },
  { _id: false },
);

const auditFileSchema = new mongoose.Schema(
  {
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engagement",
      required: true,
      unique: true,
    },
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

    stage: { type: String, enum: AUDIT_STAGES, default: "Acceptance" },
    stageHistory: { type: [trailSchema], default: [] },

    /** Materiality, with the basis — SA 320 asks for the reasoning, not the figure. */
    materialityPaise: { type: Number, default: 0, min: 0 },
    materialityBasis: { type: String, default: "", trim: true },
    performanceMaterialityPaise: { type: Number, default: 0, min: 0 },
    trivialPaise: { type: Number, default: 0, min: 0 },

    areas: { type: [areaSchema], default: [] },
    exceptions: { type: [exceptionSchema], default: [] },

    // --- the reporting half (P3-14) ----------------------------------------
    tests: { type: [ledgerTestSchema], default: [] },
    reportAnswers: { type: [reportAnswerSchema], default: [] },

    /** Layer three: the opinion the firm will sign, and its UDIN. */
    opinion: {
      type: new mongoose.Schema(
        {
          type: { type: String, default: "", trim: true },
          /** Why it is modified, where it is. */
          basis: { type: String, default: "", trim: true },
          /** An emphasis of matter paragraph, where there is one. */
          emphasis: { type: String, default: "", trim: true },
          udin: { type: String, default: "", trim: true },
        },
        { _id: false },
      ),
      default: undefined,
    },

    /**
     * Layer two: the reviewer's own overall conclusion, recorded against a
     * fingerprint of what it was given about. Change a matter or the
     * opinion type and it goes stale — a judgement recorded is not a
     * judgement that still stands.
     */
    overall: {
      type: new mongoose.Schema(
        {
          text: { type: String, default: "" },
          signature: { type: String, default: "" },
          byId: { type: String, default: null },
          byName: { type: String, default: "" },
          at: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: undefined,
    },

    /**
     * The switches that restructure the auditor's report (P3-15).
     *
     * They are switches and not paragraphs because each one *adds or
     * removes a section* of the report under SA 700, 705, 706, 570, 701
     * and 720 — which is the thing a template with blanks gets wrong.
     * `lib/audit-studio/report700.js` turns them into the report; the
     * opinion type and its basis stay where they already are, on
     * `opinion`, so there is one answer to what the opinion is.
     */
    reportSwitches: {
      type: new mongoose.Schema(
        {
          /** A material uncertainty exists — its own section, never an emphasis. */
          goingConcern: { type: Boolean, default: false },
          /** A listed entity: key audit matters are reported (SA 701). */
          listed: { type: Boolean, default: false },
          /** The s.143(3) and CARO annexure section is required. */
          companiesAct: { type: Boolean, default: false },
          /** There is other information to report on (SA 720). */
          otherInformation: { type: Boolean, default: false },
          /** An other-matter paragraph, which is not an emphasis (SA 706). */
          otherMatter: { type: String, default: "", trim: true },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    /** What has been written into the report's open sections. */
    reportSections: {
      type: [
        new mongoose.Schema(
          {
            key: { type: String, required: true },
            body: { type: String, default: "" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    /** The version in force. A signed file is locked until an amendment. */
    signed: { type: signedReportSchema, default: undefined },
    signedHistory: { type: [signedReportSchema], default: [] },

    amending: { type: Boolean, default: false },
    amendmentReason: { type: String, default: "", trim: true },
    amendmentOpenedBy: { type: String, default: null },
    amendmentOpenedByName: { type: String, default: "" },
    amendmentOpenedAt: { type: Date, default: null },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

auditFileSchema.plugin(softDeletePlugin);
auditFileSchema.plugin(auditPlugin, {
  entityType: "AuditFile",
  clientIdField: "clientId",
});

auditFileSchema.index({ clientId: 1, createdAt: -1 });
auditFileSchema.index({ branchId: 1, stage: 1 });

export default mongoose.models.AuditFile ??
  mongoose.model("AuditFile", auditFileSchema);
