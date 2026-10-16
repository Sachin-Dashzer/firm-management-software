// @ts-check

import { headers } from "next/headers";
import { withAudit } from "./index.js";
import { withAuditContext, contextFromRequest } from "./context.js";

/**
 * The wrapper every server action uses for a change.
 *
 * It does the two things that are easy to forget: attaches who is acting and
 * where from (for the IP and device columns spec section 11 wants), and opens
 * the transaction that the change and its audit entry share.
 *
 *   export async function renameClient(id, name) {
 *     const actor = await requireUser();
 *     assertCan(actor, "edit", "clients", { branchId });
 *     return audited(actor, async (session) => { ... });
 *   }
 *
 * @template T
 * @param {{ id: string, name?: string, role: string, branchIds?: string[] }|null} actor
 * @param {(session: import("mongoose").ClientSession) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function audited(actor, fn) {
  const context = contextFromRequest(actor, await headers());
  return withAuditContext(context, () => withAudit(fn));
}
