// @ts-check

/**
 * Nothing is ever hard-deleted from this app (spec section 2, rule 3).
 *
 * This plugin adds `deletedAt` / `deletedBy` to a schema and makes every
 * ordinary query skip deleted records, so forgetting the filter cannot leak a
 * deleted client into a list. Pass `{ withDeleted: true }` as a query option
 * to see them anyway (the recycle bin and the audit screens do).
 *
 * The audit entry for a delete is written by the audit plugin in Step 2; this
 * plugin only handles the flag.
 */

/** Queries that should hide deleted records unless asked otherwise. */
const READ_HOOKS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "countDocuments",
  "distinct",
];

/** @param {import("mongoose").Schema} schema */
export function softDeletePlugin(schema) {
  schema.add({
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
    schemaVersion: { type: Number, default: 1 },
  });

  schema.index({ deletedAt: 1 });

  for (const hook of READ_HOOKS) {
    schema.pre(hook, function hideDeleted() {
      if (this.getOptions?.().withDeleted) return;
      const filter = this.getFilter();
      // an explicit deletedAt in the query wins, so the bin can ask for them
      if (!("deletedAt" in filter)) this.where({ deletedAt: null });
    });
  }

  schema.pre("aggregate", function hideDeletedInAggregate() {
    this.pipeline().unshift({ $match: { deletedAt: null } });
  });

  /**
   * Soft delete this document.
   * @param {string} userId who is deleting it
   */
  schema.methods.softDelete = function softDelete(userId) {
    this.deletedAt = new Date();
    this.deletedBy = userId;
    return this.save();
  };

  /** @param {string} userId */
  schema.methods.restore = function restore(userId) {
    this.deletedAt = null;
    this.deletedBy = null;
    this.updatedBy = userId;
    return this.save();
  };
}
