// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A folder somebody made (P3-48).
 *
 * **Only folders a person made are stored here.** The drive's own
 * levels — Clients, each client, Services, each service, the financial
 * years that come from jobs, each job — are not rows. They are computed
 * from `Client`, `ServiceTemplate` and `Engagement` on every request, so
 * there is nothing to keep in step: rename a client and the folder is
 * renamed; move a job to another year and its folder moves with it; delete
 * the job and the folder goes. A table of copies would have to be taught
 * each of those, and would be wrong the first time somebody edited a record
 * from a screen that had not been taught.
 *
 * A folder is also not a place in the vault. `Document.fileKey` is built the
 * same way it always was, from the client code, the year, the service and
 * the job, so renaming or moving a folder is one small write and never
 * moves a byte on BigRock.
 *
 * **Context is inherited from where the folder is made** (`clientId`,
 * `serviceTemplateId`, `fy`, `engagementId`), which is what makes an upload
 * into it a lookup rather than a guess: whatever the folder belongs to, the
 * file put in it belongs to as well.
 */

const folderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },

    /**
     * `fy` is a folder for a financial year somebody made before the job
     * existed, so papers have somewhere to wait (§4, "+ FY Year"). It shows
     * as the same node as a year the jobs imply, and merges with it.
     */
    kind: { type: String, enum: ["custom", "fy"], default: "custom" },

    /** Which of the three zones it is in; see `lib/documents/zones.js`. */
    zone: {
      type: String,
      enum: ["personal", "firm", "client"],
      required: true,
    },

    /**
     * Where it hangs. A folder inside another folder has `parentId`; one
     * sitting directly on a computed level has `parentId: null` and names
     * that level in `anchor` — `hq`, `my`, or a path like
     * `clients/c-<id>/svc/s-<id>/fy-2025-26/e-<id>`.
     */
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    anchor: { type: String, required: true, trim: true },

    /** zone "personal": whose it is, and the only person who may see it. */
    ownerId: { type: String, default: null },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    serviceTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceTemplate",
      default: null,
    },
    fy: { type: String, default: "", trim: true },
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engagement",
      default: null,
    },
    /** Copied from the client, so a CA's branch scope can filter on it. */
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    /**
     * Every custom folder above this one, nearest last. Written out rather
     * than walked, so deleting a folder can find its whole subtree in one
     * query instead of one query per level.
     */
    ancestors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Folder" }],
    depth: { type: Number, default: 0 },

    /**
     * The name lower-cased, for the "already exists" check. Two folders
     * called "Bank statements" and "bank statements" in one place are one
     * folder spelled two ways, and somebody will file half the year in each.
     */
    nameKey: { type: String, required: true },

    /**
     * The folder this went to the bin with (P3-48c).
     *
     * Deleting a folder sends everything under it down too, and restoring
     * must bring back exactly that and nothing else — a file somebody
     * deleted on its own last week is still deleted, and would otherwise
     * come back because it happens to sit in the same folder.
     */
    deletedWithFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true,
    },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

folderSchema.plugin(softDeletePlugin);
folderSchema.plugin(auditPlugin, {
  entityType: "Folder",
  clientIdField: "clientId",
});

/**
 * The siblings of a folder, for listing a level and for the uniqueness
 * check. Not a unique index: a unique index cannot tell a live folder from
 * one in the recycle bin, and "Bank statements" must be creatable again
 * after the old one is deleted. The check is made inside the transaction
 * that creates the row (P3-48c), which is where two people racing is
 * actually decided.
 */
folderSchema.index({ anchor: 1, parentId: 1, nameKey: 1, deletedAt: 1 });
folderSchema.index({ clientId: 1 });
folderSchema.index({ engagementId: 1 });
folderSchema.index({ ownerId: 1, zone: 1 });
folderSchema.index({ ancestors: 1 });

export default mongoose.models.Folder ?? mongoose.model("Folder", folderSchema);
