// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import {
  STATUSES,
  BILLING_STATUSES,
  PRIORITIES,
} from "../lib/engagements/status.js";
import { SCOPES } from "../lib/engagements/scope.js";

/**
 * One service, for one client, for one period (spec section 5).
 *
 * The template is copied in at creation as `templateSnapshot`, and the tasks
 * and checklists are copies too, not references: editing the service catalog
 * next month must not reach back into work already under way (spec section
 * 13). That is also why the checklist lives here rather than being read
 * through the template.
 */

const taskSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /**
     * Copied from the template's step when the engagement was created, like
     * everything else here — so editing the catalog cannot change who may
     * tick a step on work already under way. Empty means inherit
     * `templateSnapshot.minExecRole`, which is what every task created before
     * P2-4 has.
     */
    minRole: { type: String, default: "" },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    doneBy: { type: String, default: null },
  },
  { _id: true },
);

/**
 * What the client said back about one requested document (P3-2).
 *
 * The commonest delay on a job is not a client ignoring a request — it is a
 * client who cannot produce the thing, or who sent the wrong month because
 * nobody told them which month, or whose accountant has the file. Before
 * this, all three were a phone call nobody recorded.
 */
const clientReplySchema = new mongoose.Schema(
  {
    /** "cannot" · "delegated" · "question" */
    kind: { type: String, enum: ["cannot", "delegated", "question"] },
    /** Why they cannot produce it. Optional: sometimes there is no reason. */
    note: { type: String, default: "", trim: true },
    /** Who they say will send it instead, and how to reach them. */
    delegateName: { type: String, default: "", trim: true },
    delegateContact: { type: String, default: "", trim: true },
    /** Their question, and the firm's answer once somebody gives one. */
    question: { type: String, default: "", trim: true },
    answer: { type: String, default: "", trim: true },
    answeredBy: { type: String, default: null },
    answeredAt: { type: Date, default: null },
    at: { type: Date, default: () => new Date() },
    byName: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const checklistItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    side: { type: String, enum: ["client", "firm"], required: true },
    mandatory: { type: Boolean, default: true },

    /**
     * Requested → Received → Format checked → Accepted, or Replacement
     * requested, or Not required (P3-2, spec section 6).
     *
     * `Verified` is the old name for `Accepted` and stays in the enum so
     * rows written before P3-2 keep validating; `lib/migration/checklist.js`
     * renames them. Nothing writes it any more.
     *
     * A format check passing is **not** acceptance. The automatic check can
     * say a spreadsheet has the right columns; it cannot say the file is the
     * right client's, for the right month, complete and legible. A person
     * accepts, and the two states are kept apart so the system never claims
     * the second when it only did the first.
     */
    status: {
      type: String,
      enum: [
        "Pending",
        "Requested",
        "Received",
        "Format checked",
        "Accepted",
        "Replacement requested",
        "Not required",
        "Verified",
      ],
      default: "Pending",
    },

    requestedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null },

    /**
     * How many times the client has sent something for this item (P3-2).
     *
     * A replacement is a **new submission**, and acceptance is tied to the
     * number — so an item accepted at submission 1 and re-uploaded as
     * submission 2 is not still accepted, and the earlier format check does
     * not carry over to a file it never saw.
     */
    submissionCount: { type: Number, default: 0, min: 0 },
    acceptedSubmission: { type: Number, default: null },
    acceptedBy: { type: String, default: null },
    acceptedByName: { type: String, default: "", trim: true },

    /** Why the firm sent it back. The client is shown these words. */
    rejectReason: { type: String, default: "", trim: true },
    /** Why the firm decided it was not needed after all. */
    notRequiredReason: { type: String, default: "", trim: true },

    clientReply: { type: clientReplySchema, default: null },

    /** Files attach here in Step 6; the tick works without them. */
    documentIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Document" }],
      default: [],
    },
  },
  { _id: true },
);

const reviewItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    checked: { type: Boolean, default: false },
    checkedAt: { type: Date, default: null },
  },
  { _id: true },
);

/**
 * What an audit engagement is, beyond the work of doing it (P2-8a).
 *
 * Only audit and assurance services carry this; the filing panel shows it
 * for those and nothing else. The signing member is **not** here: a UDIN is
 * recorded against a member in the register (P2-7), and a second copy of
 * that fact would be free to disagree with the first.
 */
const assuranceSchema = new mongoose.Schema(
  {
    auditType: { type: String, default: "", trim: true },
    appointmentDate: { type: Date, default: null },
    reportDate: { type: Date, default: null },
    /** SA 700 / SA 705: Unmodified, Qualified, Adverse or Disclaimer. */
    opinion: { type: String, default: "", trim: true },
    /** Required by `checkAssurance()` for anything but an unmodified one. */
    qualificationNote: { type: String, default: "", trim: true },
  },
  { _id: false },
);

/**
 * A fee somebody asked to be let off, and what a partner decided (P3-4).
 *
 * Both names are kept on purpose: a waiver carrying one name cannot be told
 * apart from somebody waiving their own client's fee, which is the thing a
 * peer reviewer looks for. A declined request is kept too — the asking
 * happened, and the answer is part of why the fee was charged.
 */
const waiverSchema = new mongoose.Schema(
  {
    reason: { type: String, default: "", trim: true },
    requestedBy: { type: String, default: null },
    requestedByName: { type: String, default: "" },
    requestedAt: { type: Date, default: null },
    approvedBy: { type: String, default: null },
    approvedByName: { type: String, default: "" },
    approvedAt: { type: Date, default: null },
    declinedBy: { type: String, default: null },
    declinedByName: { type: String, default: "" },
    declinedAt: { type: Date, default: null },
    declineReason: { type: String, default: "", trim: true },
  },
  { _id: false },
);

/**
 * A reviewer's approval of one version of the work (P3-5).
 *
 * `version` is what makes it an approval of something rather than a tick:
 * change the work afterwards and the engagement's version moves past this
 * one, so the approval stops counting without anybody having to remember to
 * withdraw it.
 */
const reviewApprovalSchema = new mongoose.Schema(
  {
    approvedBy: { type: String, default: null },
    approvedByName: { type: String, default: "" },
    approvedAt: { type: Date, default: null },
    version: { type: Number, default: 1 },
  },
  { _id: false },
);

/**
 * The client's confirmation of the figures (P3-5).
 *
 * The client, not the firm, owes the tax. `evidence` is mandatory and says
 * where the confirmation can be found, because this record's whole purpose
 * is to answer a dispute two years later.
 */
const clientConfirmationSchema = new mongoose.Schema(
  {
    /** Who at the client confirmed — a person, not the company. */
    who: { type: String, default: "", trim: true },
    when: { type: Date, default: null },
    /** Where it can be found: "WhatsApp from Jaspal, 25 Oct 4:10 pm". */
    evidence: { type: String, default: "", trim: true },
    version: { type: Number, default: 1 },
    recordedBy: { type: String, default: null },
    recordedByName: { type: String, default: "" },
    recordedAt: { type: Date, default: null },
  },
  { _id: false },
);

const statusEventSchema = new mongoose.Schema(
  {
    from: { type: String, default: "" },
    to: { type: String, required: true },
    at: { type: Date, default: () => new Date() },
    byId: { type: String, default: null },
    byName: { type: String, default: "" },
    reason: { type: String, default: "", trim: true },
  },
  { _id: false },
);

/**
 * A filing record that was wrong and has been replaced (P3-1).
 *
 * Kept rather than overwritten, because the acknowledgement number the firm
 * reported last month is a fact about what was reported, even once it turns
 * out to have been the wrong number. A correction adds a row here; it never
 * edits one.
 */
const filingHistorySchema = new mongoose.Schema(
  {
    filedOn: { type: Date, default: null },
    ackNo: { type: String, default: "", trim: true },
    dueDateAtFiling: { type: Date, default: null },
    reason: { type: String, required: true, trim: true },
    correctedAt: { type: Date, default: () => new Date() },
    correctedBy: { type: String, default: null },
    correctedByName: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * One statutory filing inside an engagement (P3-1).
 *
 * October GST is one engagement with two of these: GSTR-1 due on the 11th
 * and GSTR-3B due on the 20th. They finish independently, which is the whole
 * point — before this, the engagement held one `ackNo` and one `filedOn`, so
 * a client whose GSTR-1 went in on time and whose GSTR-3B went in nine days
 * late could only be recorded as one or the other, and whichever was stored
 * was a false statement about the other return.
 *
 * `dueDateAtFiling` is the date that was in force on the day this was filed.
 * It is captured once, at filing, and never recomputed: an extension
 * announced in December must not retroactively make a November filing
 * punctual, and withdrawing one must not make it late. `dueDate` stays live
 * so the firm can see the position as it stands today; the pair of them is
 * how the punctuality report tells the truth about both.
 */
const milestoneSchema = new mongoose.Schema(
  {
    /** "GSTR-1", "GSTR-3B", "AOC-4" — the name the law uses. */
    name: { type: String, required: true, trim: true },

    /**
     * Which milestone of the rule this came from, so an extension recorded
     * against GSTR-3B moves this row and leaves GSTR-1 alone.
     */
    ruleKey: { type: String, default: "", trim: true },

    /** Live: moves if the firm records an extension. Null means not known. */
    dueDate: { type: Date, default: null },

    filedOn: { type: Date, default: null },
    /** Frozen at filing. See the note above — this is the honest one. */
    dueDateAtFiling: { type: Date, default: null },

    /** ARN, token number, SRN. Mandatory to record a filing at all. */
    ackNo: { type: String, default: "", trim: true },

    /**
     * The acknowledgement itself, by id rather than by name — a document can
     * be renamed and the link has to survive it. Null is a real state the
     * client is shown as "Filed — proof pending", not a gap to hide.
     */
    proofDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },

    /**
     * Which version of the work went in. A change after approval raises the
     * engagement's version (P3-5), and this says what was actually filed.
     */
    versionFiled: { type: Number, default: null, min: 1 },

    filedBy: { type: String, default: null },
    filedByName: { type: String, default: "" },

    history: { type: [filingHistorySchema], default: [] },
  },
  { _id: true },
);

/**
 * The month's GST preparation, from the sheet the client sent (P3-12).
 *
 * The raw rows are **not** kept here: they are in the uploaded document,
 * which is the client's own file and the thing a reviewer wants to open. What
 * is kept is what was found in it and what was worked out from it, so the
 * screen does not have to re-read a spreadsheet to tell anybody where the
 * month stands.
 *
 * Every figure in `computation` is indicative, and `lib/gst/compute.js`
 * returns the sentence that says so with them.
 */
const gstPrepSchema = new mongoose.Schema(
  {
    /** The workbook the client filled in. */
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    fileName: { type: String, default: "", trim: true },
    uploadedAt: { type: Date, default: null },
    uploadedBy: { type: String, default: null },
    uploadedByName: { type: String, default: "" },

    /** How many rows came in on each sheet. */
    counts: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Sheets the workbook did not have at all. */
    missingSheets: { type: [String], default: [] },
    /**
     * What is wrong with it, as the client is told. Kept so the correction
     * loop is a record rather than a conversation: what we sent back, and
     * whether the next file fixed it.
     */
    issues: { type: mongoose.Schema.Types.Mixed, default: [] },
    /** Each upload is a submission, like a checklist item (P3-2). */
    submissionCount: { type: Number, default: 0, min: 0 },
    sentBackAt: { type: Date, default: null },
    sentBackCount: { type: Number, default: 0, min: 0 },

    computation: { type: mongoose.Schema.Types.Mixed, default: null },
    computedAt: { type: Date, default: null },
  },
  { _id: false },
);

const engagementSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },

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
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    /** Sortable period code from lib/engagements/period.js, e.g. "2026-10". */
    period: { type: String, required: true, trim: true },
    periodLabel: { type: String, default: "", trim: true },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },

    status: { type: String, enum: STATUSES, default: "Scheduled" },
    priority: { type: String, enum: PRIORITIES, default: "Normal" },
    tags: { type: [String], default: [] },

    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /**
     * From the due-date master, and only ever from a rule the firm has
     * verified (spec section 8, CLAUDE.md rule 8). Null means "not known
     * yet", never "none".
     *
     * Since P3-1 this is **derived**: the governing milestone's date — the
     * earliest one still unfiled, or the last one once everything is in. It
     * is what every list, calendar, digest and report already reads, and it
     * still answers the question they ask. See `milestones` below.
     */
    statutoryDue: { type: Date, default: null },
    internalDue: { type: Date, default: null },

    /**
     * Event-based deadlines (spec section 8): the AGM date for an ROC
     * filing, the date printed on a notice. The due-date rule counts from
     * this rather than from the calendar.
     */
    eventDate: { type: Date, default: null },
    eventName: { type: String, default: "", trim: true },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completedBy: { type: String, default: null },

    /**
     * The statutory filings this engagement owes (P3-1).
     *
     * One row for most work, two for monthly GST and for ROC annual filing.
     * This is where a filing is recorded and the only place it is recorded;
     * `ackNo`, `filedOn` and `statutoryDue` below are derived from it.
     */
    milestones: { type: [milestoneSchema], default: [] },

    /**
     * Derived from `milestones` and maintained by
     * `lib/engagements/milestones.js` — never written by hand (P3-1).
     *
     * They are kept because forty files read `statutoryDue` and sixteen read
     * `filedOn`, and every one of them wants the same thing it always wanted:
     * when is this due, and when did it go in. Rewriting them all to walk an
     * array would have been a large change for no gain, so the array is the
     * truth and these three are a view of it, written in exactly one place.
     *
     * `filedOn` is when the *last* milestone went in, so "when was this job
     * filed" still answers correctly. Anything that needs to know about one
     * return rather than the job reads `milestones` directly.
     */
    ackNo: { type: String, default: "", trim: true },
    filedOn: { type: Date, default: null },

    /**
     * Not derived, and not a filing: a UDIN belongs to a report the firm
     * signed, is recorded against a member in the register (P2-7), and has
     * nothing to do with which return went in on which day.
     */
    udin: { type: String, default: "", trim: true },

    /** Audit and assurance work only; empty on everything else. */
    assurance: { type: assuranceSchema, default: () => ({}) },

    /** Monthly GST work only; empty on everything else (P3-12). */
    gstPrep: { type: gstPrepSchema, default: undefined },

    feePaise: { type: Number, default: 0, min: 0 },
    billingStatus: {
      type: String,
      enum: BILLING_STATUSES,
      default: "Unbilled",
    },

    /**
     * How this job is paid for (P3-4): billable, covered by a retainer, or
     * waived. It runs alongside `billingStatus` rather than inside it for the
     * same reason billing runs alongside the pipeline — "waived" and "billed"
     * are answers to different questions, and one column cannot hold both.
     *
     * Everything created before P3-4 defaults to billable, which is what it
     * was, so no engagement changes meaning on the way in.
     */
    scope: { type: String, enum: SCOPES, default: "billable" },
    /** Why it is not separately chargeable. Required for retainer and waived. */
    scopeReason: { type: String, default: "", trim: true },
    waiver: { type: waiverSchema, default: undefined },

    /**
     * Which version of the work this is (P3-5). It starts at 1 and rises
     * every time something changes after an approval — which is also how
     * `milestones.versionFiled` says which version actually went in.
     */
    version: { type: Number, default: 1, min: 1 },
    review: { type: reviewApprovalSchema, default: undefined },
    clientConfirmation: { type: clientConfirmationSchema, default: undefined },

    tasks: { type: [taskSchema], default: [] },
    checklist: { type: [checklistItemSchema], default: [] },
    reviewChecklist: { type: [reviewItemSchema], default: [] },
    reviewNotes: { type: String, default: "", trim: true },
    /** How many times this came back from review; feeds the CA dashboard. */
    reworkCount: { type: Number, default: 0, min: 0 },

    statusHistory: { type: [statusEventSchema], default: [] },

    /**
     * What the service looked like when this engagement was created: name,
     * code, version, level, roles, turnaround, UDIN rule. Everything the
     * engagement needs to describe itself without reading the catalog.
     */
    templateSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },

    /**
     * Spec section 13 asks every collection for this and the engagement
     * never had one. 1 is an engagement from before P3-1, whose filing sat
     * in `ackNo` and `filedOn` with no milestone behind it; 2 has
     * `milestones`. `backfillMilestones()` moves a 1 to a 2.
     */
    schemaVersion: { type: Number, default: 2 },
  },
  { timestamps: true },
);

engagementSchema.plugin(softDeletePlugin);
engagementSchema.plugin(auditPlugin, { entityType: "Engagement" });

// the indexes spec section 13 asks for
engagementSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
engagementSchema.index({ assigneeId: 1, status: 1, internalDue: 1 });
engagementSchema.index({ clientId: 1, period: 1 });
engagementSchema.index({ statutoryDue: 1 });
engagementSchema.index({ branchId: 1, status: 1 });
engagementSchema.index({ reviewerId: 1, status: 1 });
// the tier filter on the list, and the A-tier safety report
engagementSchema.index({ "templateSnapshot.level": 1, status: 1 });
// the three practice books, which read one category at a time (P2-8a)
engagementSchema.index({ "templateSnapshot.category": 1, statutoryDue: 1 });
// the compliance grid asks "which milestones are unfiled and overdue" (P3-1)
engagementSchema.index({ "milestones.dueDate": 1, "milestones.filedOn": 1 });
// one engagement per client, service and period: the duplicate guard for
// recurring work, and what Step 7's generator relies on
engagementSchema.index(
  { clientId: 1, serviceTemplateId: 1, period: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

/** Is the work late? Statutory first, internal otherwise. */
engagementSchema.virtual("dueDate").get(function dueDate() {
  return this.statutoryDue ?? this.internalDue ?? null;
});

export default mongoose.models.Engagement ??
  mongoose.model("Engagement", engagementSchema);
