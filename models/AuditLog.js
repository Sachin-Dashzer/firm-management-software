// @ts-check

import mongoose from "mongoose";

/**
 * The append-only audit trail (spec section 11).
 *
 * Nothing in the application may edit or delete an entry — not even a partner
 * — so the usual update and delete paths are blocked here, and Atlas should
 * also give the app's database user only `find` and `insert` on this
 * collection (see docs/DEPLOY.md, an owner task before go-live). The app-level
 * block stops our own code; the database-level one stops anything else.
 *
 * `seq`, `prevHash` and `hash` form a chain: each entry hashes the entry
 * before it, so removing or altering a row in the database is detectable
 * (see lib/audit/hash.js and verifyAuditChain).
 */
const auditLogSchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true },
    ts: { type: Date, required: true, default: () => new Date() },

    // who
    userId: { type: String, default: null }, // null for system jobs
    userName: { type: String, default: "" }, // kept as text: users get renamed
    role: { type: String, default: "" },
    branchId: { type: String, default: null },

    // what
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    clientId: { type: String, default: null },

    /**
     * Field-level before and after, as `{ field: [old, new] }`.
     * Sensitive values are never stored here — see lib/audit/diff.js.
     */
    diff: { type: mongoose.Schema.Types.Mixed, default: {} },

    /** Free-text context, e.g. the reason for an on-hold or a write-off. */
    note: { type: String, default: "" },

    // where from
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },

    // tamper evidence
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { timestamps: false, minimize: false },
);

// the indexes spec section 13 asks for, plus the chain order
auditLogSchema.index({ seq: 1 }, { unique: true });
auditLogSchema.index({ entityType: 1, entityId: 1, ts: -1 });
auditLogSchema.index({ userId: 1, ts: -1 });
auditLogSchema.index({ clientId: 1, ts: -1 });
auditLogSchema.index({ action: 1, ts: -1 });

/** Refuse every path that could change or remove an entry. */
const FORBIDDEN = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
];

for (const op of FORBIDDEN) {
  auditLogSchema.pre(op, function refuse() {
    throw new Error(`auditLogs is append-only: ${op} is not allowed`);
  });
}

auditLogSchema.pre("save", function refuseEdit() {
  if (!this.isNew) throw new Error("auditLogs entries cannot be edited");
});

export default mongoose.models.AuditLog ??
  mongoose.model("AuditLog", auditLogSchema);
