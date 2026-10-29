// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";

/**
 * A small thing somebody has to do that is not a job (P3-22c).
 *
 * Ring the client, chase the bank, check the challan. The firm has been
 * keeping these on paper and in heads, and they are the commonest way work
 * is lost — not a GST return that a hundred screens watch, but the one
 * phone call nobody made.
 *
 * **It is deliberately not an engagement.** An engagement is one service
 * for one client for one period, with a fee, a tier, a reviewer and an
 * audit trail of its own; a to-do is a line with a date and a name on it.
 * Forcing the first shape onto the second is how a to-do list becomes
 * something nobody uses.
 *
 * **It is also not an Issue.** Issues (P3-6) are computed live from the
 * records and there is nothing to tick off, which is the whole point of
 * that screen. This is the opposite: a thing a person wrote down, which
 * only a person can say is finished. The two live apart on purpose.
 *
 * A finished to-do is **kept, not removed**: "did anybody ring them?" is a
 * question asked a week later, and `doneBy` answers it.
 */
const todoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },

    /** Whose it is. Defaults to whoever wrote it. */
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /**
     * The branch it belongs to, so a CA reads their own branch's and the
     * query never has to join through the owner (spec section 2).
     */
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    /** IST midnight, or null: plenty of to-dos have no date at all. */
    dueDate: { type: Date, default: null },

    /** Which client it is about, where it is about one. */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    doneBy: { type: String, default: null },
    doneByName: { type: String, default: "" },

    note: { type: String, trim: true, default: "", maxlength: 500 },

    createdBy: { type: String, default: null },
    createdByName: { type: String, default: "" },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

todoSchema.plugin(softDeletePlugin);
todoSchema.plugin(auditPlugin, {
  entityType: "Todo",
  clientIdField: "clientId",
});

/** "What is on my list" — the only question this collection is asked. */
todoSchema.index({ ownerId: 1, done: 1, dueDate: 1 });
todoSchema.index({ branchId: 1, done: 1, dueDate: 1 });
todoSchema.index({ clientId: 1, done: 1 });

export default mongoose.models.Todo ?? mongoose.model("Todo", todoSchema);
