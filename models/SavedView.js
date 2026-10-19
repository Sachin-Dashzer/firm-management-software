// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A saved filter (spec section 10: "saved filters per user, e.g. Ludhiana
 * GST overdue, so common lookups are one click").
 *
 * The view stores the query string, not a copy of the filter fields. The
 * screens already turn a URL into a query and the URL is the thing being
 * saved — so a new filter on a list needs no change here, and a saved view
 * can never hold a filter the list no longer understands without it simply
 * being ignored.
 *
 * A view is private unless a partner shares it with the firm. Scope is
 * never saved: the view says *what* to look at, the signed-in person's
 * role still decides how much of it they see.
 */
const savedViewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },

    /** Which list or report it belongs to, e.g. "engagements", "overdue". */
    screen: { type: String, required: true, trim: true },

    /** The filters, exactly as they appear in the URL. */
    search: { type: String, default: "", trim: true, maxlength: 1000 },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ownerName: { type: String, default: "" },

    /** Shared views are the firm's; only a Partner may make one. */
    shared: { type: Boolean, default: false },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

savedViewSchema.plugin(softDeletePlugin);
savedViewSchema.plugin(auditPlugin, { entityType: "SavedView" });

savedViewSchema.index({ screen: 1, ownerId: 1, name: 1 });
savedViewSchema.index({ screen: 1, shared: 1 });

export default mongoose.models.SavedView ??
  mongoose.model("SavedView", savedViewSchema);
