// @ts-check

import mongoose from "mongoose";
// relative, not the @/ alias: the models load this through their audit plugin
// under plain Node too (scripts/seed.js, the Playwright tests)
import AuditLog from "../../models/AuditLog.js";
import Counter from "../../models/Counter.js";
import { connectDB } from "../db.js";
import { auditContext, setAuditSession } from "./context.js";
import { hashEntry, verifyChain, GENESIS } from "./hash.js";

/**
 * The one way data changes in this app (spec section 11).
 *
 * A change and its audit entry are written in a single MongoDB transaction,
 * so the two cannot come apart: if the audit write fails the change is rolled
 * back, and there is no path that writes data without a log. Never write
 * around this module.
 *
 * Usage:
 *
 *   await withAudit(async (session) => {
 *     const client = await Client.create([{ ... }], { session });
 *     return client[0];
 *   });
 *
 * Models carrying the audit plugin write their own entries. Call
 * `recordAudit` directly only for things that are not a document change —
 * a document download, a credential reveal, a login, a report export.
 */

export const AUDIT_COUNTER_ID = "auditLogs";

/** The actions used across the app, so screens can filter on a known list. */
export const ACTIONS = {
  create: "create",
  update: "update",
  softDelete: "delete",
  restore: "restore",
  statusChange: "status_change",
  reassign: "reassign",
  documentUpload: "document_upload",
  documentView: "document_view",
  documentDownload: "document_download",
  documentDelete: "document_delete",
  credentialReveal: "credential_reveal",
  invoiceIssue: "invoice_issue",
  invoiceCancel: "invoice_cancel",
  paymentEntry: "payment_entry",
  writeOff: "write_off",
  login: "login",
  loginFailed: "login_failed",
  logout: "logout",
  passwordReset: "password_reset",
  twoFactorReset: "two_factor_reset",
  roleChange: "role_change",
  export: "export",
  /** A DPDP deletion request actioned: see lib/dpdp (spec section 16). */
  redact: "redact",
};

/**
 * Run work inside a transaction, with the audit entries it produces.
 *
 * `session.withTransaction` retries by itself when MongoDB reports a
 * transient conflict — which is exactly what two people saving at the same
 * moment look like, because they both touch the audit counter.
 *
 * @template T
 * @param {(session: import("mongoose").ClientSession) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withAudit(fn) {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    /** @type {T} */
    let result;
    await session.withTransaction(async () => {
      setAuditSession(session);
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (/Transaction numbers are only allowed|replica set/i.test(err.message)) {
      throw new Error(
        "Audited writes need a replica set, which MongoDB Atlas provides by default (spec section 13). Check MONGODB_URI points at the Atlas cluster.",
      );
    }
    throw err;
  } finally {
    setAuditSession(undefined);
    await session.endSession();
  }
}

/**
 * Append one entry. Must be inside a transaction: pass the session from
 * `withAudit`, or omit it when one is already on the audit context.
 *
 * @param {object} entry
 * @param {string} entry.action one of ACTIONS
 * @param {string} entry.entityType e.g. "Client"
 * @param {string} entry.entityId
 * @param {string|null} [entry.clientId] the client this concerns, if any
 * @param {Record<string, [unknown, unknown]>} [entry.diff]
 * @param {string} [entry.note]
 * @param {import("mongoose").ClientSession} [session]
 * @returns {Promise<object>} the stored entry
 */
export async function recordAudit(entry, session) {
  const context = auditContext();
  const inTransaction = session ?? context.session;
  if (!inTransaction) {
    throw new Error(
      `Audit entry for ${entry.action} ${entry.entityType} was written outside a transaction. Wrap the change in withAudit().`,
    );
  }

  // One atomic step hands out the next sequence number and the hash of the
  // entry before it. Because every audited write touches this one document,
  // the chain cannot fork: concurrent transactions conflict and retry.
  const counter = await Counter.findOneAndUpdate(
    { _id: AUDIT_COUNTER_ID },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session: inTransaction },
  );

  const candidate = {
    seq: counter.seq,
    ts: new Date(),
    userId: context.userId,
    userName: context.userName,
    role: context.role,
    branchId: context.branchId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: String(entry.entityId),
    clientId: entry.clientId ? String(entry.clientId) : null,
    diff: entry.diff ?? {},
    note: entry.note ?? "",
    ip: context.ip,
    userAgent: context.userAgent,
    prevHash: counter.lastHash || GENESIS,
  };

  const hash = hashEntry(candidate);
  const [stored] = await AuditLog.create([{ ...candidate, hash }], {
    session: inTransaction,
  });

  await Counter.updateOne(
    { _id: AUDIT_COUNTER_ID },
    { $set: { lastHash: hash } },
    { session: inTransaction },
  );

  return stored;
}

/**
 * Check the chain for tampering. Walks entries in sequence order, recomputes
 * every hash and reports the first break. A nightly job calls this from
 * Step 7; a partner can also run it from the audit screen.
 *
 * @param {{ fromSeq?: number, limit?: number }} [options]
 */
export async function verifyAuditChain({ fromSeq = 1, limit = 50000 } = {}) {
  await connectDB();

  let expectedPrevHash = GENESIS;
  if (fromSeq > 1) {
    const previous = await AuditLog.findOne({ seq: fromSeq - 1 })
      .select("hash")
      .lean();
    if (!previous) {
      return {
        ok: false,
        checked: 0,
        seq: fromSeq - 1,
        problem: `entry #${fromSeq - 1} is missing`,
      };
    }
    expectedPrevHash = previous.hash;
  }

  const entries = await AuditLog.find({ seq: { $gte: fromSeq } })
    .sort({ seq: 1 })
    .limit(limit)
    .lean();

  return verifyChain(entries, { expectedFirstSeq: fromSeq, expectedPrevHash });
}

export { hashEntry, verifyChain, GENESIS } from "./hash.js";
export { buildDiff, diffForCreate } from "./diff.js";
export {
  withAuditContext,
  auditContext,
  contextFromRequest,
  SYSTEM,
} from "./context.js";
