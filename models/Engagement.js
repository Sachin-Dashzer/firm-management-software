// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import {
  STATUSES,
  BILLING_STATUSES,
  PRIORITIES,
} from "../lib/engagements/status.js";

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
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    doneBy: { type: String, default: null },
  },
  { _id: true },
);

const checklistItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    side: { type: String, enum: ["client", "firm"], required: true },
    mandatory: { type: Boolean, default: true },
    /** Pending → Requested → Received → Verified (spec section 6). */
    status: {
      type: String,
      enum: ["Pending", "Requested", "Received", "Verified"],
      default: "Pending",
    },
    requestedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null },
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

    /** Captured when the return is filed or the report issued. */
    ackNo: { type: String, default: "", trim: true },
    udin: { type: String, default: "", trim: true },

    feePaise: { type: Number, default: 0, min: 0 },
    billingStatus: {
      type: String,
      enum: BILLING_STATUSES,
      default: "Unbilled",
    },

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
