// @ts-check

import { withAuditContext, SYSTEM } from "./context.js";
import { withAudit } from "./index.js";

/**
 * The seed script, the job runner and the test fixtures write with nobody
 * signed in — but they still write, so they still need the transaction every
 * audited change runs in (spec section 11). This is `audited()` for code that
 * has no request and no actor: the entries are attributed to System.
 *
 * @template T
 * @param {(session: import("mongoose").ClientSession) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function systemAudit(fn) {
  return withAuditContext(SYSTEM, () => withAudit(fn));
}
