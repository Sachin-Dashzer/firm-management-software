// @ts-check

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who is doing this, and from where.
 *
 * The audit plugin runs deep inside Mongoose, far from the server action that
 * knows the signed-in user. Threading an actor through every function call
 * would mean every one of them could forget. Instead the request stores the
 * actor here once, and the plugin reads it back — Node's own AsyncLocalStorage
 * keeps it tied to this request and invisible to every other one.
 *
 * @typedef {object} AuditContext
 * @property {string|null} userId
 * @property {string} userName
 * @property {string} role
 * @property {string|null} branchId
 * @property {string} ip
 * @property {string} userAgent
 * @property {import("mongoose").ClientSession} [session] the open transaction
 */

/**
 * **One store for the whole process, held on `globalThis`** — the same trick
 * `lib/db.js` uses for the connection, and for a sharper reason (P3-22b).
 *
 * Next.js bundles server code per route, and this module is duplicated into
 * several of those bundles: the build has four copies of it. A plain
 * module-scope store would therefore be four different stores, while the
 * Mongoose model is registered **once** per process by whichever route
 * touched it first — so the audit plugin reads the store belonging to that
 * route's copy, and a server action in another route writes to a different
 * one. The plugin then sees no transaction and refuses the change
 * (CLAUDE.md rule 2 doing its job), and which routes break depends on the
 * order the first requests arrive in.
 *
 * It was found by recording a payment after opening `/billing`: "Audit entry
 * for create Payment was written outside a transaction", on a path that had
 * worked for weeks. Nothing about payments was wrong — the two halves were
 * simply looking at different stores.
 *
 * @type {AsyncLocalStorage<AuditContext>}
 */
const storage = (globalThis._phmgAuditStore ??= new AsyncLocalStorage());

/** A job runner or seed script acting with nobody signed in. */
export const SYSTEM = {
  userId: null,
  userName: "System",
  role: "system",
  branchId: null,
  ip: "",
  userAgent: "",
};

/**
 * Run `fn` with this actor attached to everything it does.
 * @template T
 * @param {Partial<AuditContext>} context
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function withAuditContext(context, fn) {
  return storage.run({ ...SYSTEM, ...context }, fn);
}

/** @returns {AuditContext} the current actor, or System when there is none */
export function auditContext() {
  return storage.getStore() ?? SYSTEM;
}

/**
 * Attach the open transaction to the current context, so the audit plugin
 * writes its entry inside the same transaction as the change.
 * @param {import("mongoose").ClientSession|undefined} session
 */
export function setAuditSession(session) {
  const store = storage.getStore();
  if (store) store.session = session;
}

/**
 * Build a context from a Next.js request: the signed-in user plus the headers
 * spec section 11 wants recorded (IP address, device/browser).
 *
 * @param {{ id: string, name?: string, role: string, branchIds?: string[] }|null} user
 * @param {Headers} headers
 * @returns {Partial<AuditContext>}
 */
export function contextFromRequest(user, headers) {
  return {
    userId: user?.id ?? null,
    userName: user?.name ?? "Unknown",
    role: user?.role ?? "",
    branchId: user?.branchIds?.[0] ?? null,
    // Vercel puts the real client address in x-forwarded-for; the first entry
    // is the client, the rest are proxies
    ip: (headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
    userAgent: headers.get("user-agent") ?? "",
  };
}
