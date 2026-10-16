// @ts-check

import { recordAudit, ACTIONS } from "../../lib/audit/index.js";
import { buildDiff, diffForCreate } from "../../lib/audit/diff.js";
import { auditContext } from "../../lib/audit/context.js";

/**
 * Attached to every collection, this plugin writes the audit entry for a
 * change in the same transaction as the change itself (spec section 11), so a
 * change can never land without its log.
 *
 * It covers the paths the app actually uses: `save` (create and edit),
 * `findOneAndUpdate`, and the `softDelete` / `restore` methods from the
 * soft-delete plugin. `updateMany` is *not* covered — it cannot report which
 * documents it touched or what they looked like before — so bulk changes must
 * loop, which is what the bulk actions in Step 5 will do.
 *
 * @param {import("mongoose").Schema} schema
 * @param {{ entityType: string, clientIdField?: string }} options
 */
export function auditPlugin(schema, { entityType, clientIdField } = {}) {
  if (!entityType) throw new Error("auditPlugin needs an entityType");

  /** @param {any} doc */
  const clientIdOf = (doc) => {
    if (!doc) return null;
    if (entityType === "Client") return doc._id ?? null;
    if (clientIdField) return doc[clientIdField] ?? null;
    return doc.clientId ?? null;
  };

  // --- create and edit through document.save() -----------------------------

  schema.pre("save", function captureBefore(next) {
    // modifiedPaths() is empty after save, so remember what changed now
    this.$locals.auditWasNew = this.isNew;
    this.$locals.auditBefore = this.isNew
      ? {}
      : Object.fromEntries(
          this.modifiedPaths().map((path) => [path, this.get(path)]),
        );
    this.$locals.auditChangedPaths = this.modifiedPaths();
    next();
  });

  schema.post("save", async function writeEntry(doc) {
    const wasNew = doc.$locals.auditWasNew;
    const paths = doc.$locals.auditChangedPaths ?? [];

    const after = Object.fromEntries(paths.map((p) => [p, doc.get(p)]));
    const diff = wasNew
      ? diffForCreate(doc.toObject({ depopulate: true }))
      : buildDiff(doc.$locals.auditBefore ?? {}, after);

    // an update that changed nothing visible is not worth an entry
    if (!wasNew && Object.keys(diff).length === 0) return;

    // softDelete() and restore() go through save(); they are their own
    // actions, not ordinary edits
    const action = wasNew
      ? ACTIONS.create
      : paths.includes("deletedAt")
        ? doc.deletedAt
          ? ACTIONS.softDelete
          : ACTIONS.restore
        : ACTIONS.update;

    await recordAudit(
      {
        action,
        entityType,
        entityId: doc._id,
        clientId: clientIdOf(doc),
        diff,
      },
      auditContext().session,
    );
  });

  // --- edit through Model.findOneAndUpdate() -------------------------------

  schema.pre("findOneAndUpdate", async function captureBefore() {
    // `lean` would skip the schema's getters; the plain object is enough here
    this._auditBefore = await this.model
      .findOne(this.getFilter())
      .session(this.getOptions().session ?? null)
      .lean();
  });

  schema.post("findOneAndUpdate", async function writeEntry(result) {
    if (!result) return; // nothing matched, nothing to log

    const before = this._auditBefore ?? {};
    const after =
      typeof result.toObject === "function" ? result.toObject() : result;
    const diff = buildDiff(before, after);
    if (Object.keys(diff).length === 0) return;

    const deleted = Boolean(after.deletedAt) && !before.deletedAt;
    const restored = Boolean(before.deletedAt) && !after.deletedAt;

    await recordAudit(
      {
        action: deleted
          ? ACTIONS.softDelete
          : restored
            ? ACTIONS.restore
            : ACTIONS.update,
        entityType,
        entityId: after._id,
        clientId: clientIdOf(after),
        diff,
      },
      this.getOptions().session ?? auditContext().session,
    );
  });

  /**
   * `findOneAndUpdate` must return the updated document for the hook above to
   * log it, so make that the default rather than relying on every caller.
   */
  schema.pre("findOneAndUpdate", function returnTheNewOne() {
    if (this.getOptions().new === undefined) this.setOptions({ new: true });
  });
}
