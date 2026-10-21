"use server";

import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { verifyAuditChain } from "@/lib/audit";

/**
 * Re-hash the whole chain and report the first break, if any (spec section
 * 11). Step 7 runs the same check nightly from the job runner; this is the
 * on-demand version a partner can press before an inspection.
 */
export async function checkChain() {
  const actor = await requireUser();
  assertCan(actor, "view", "auditLog");

  const result = await verifyAuditChain();
  if (result.ok) {
    return {
      ok: `Checked ${result.checked.toLocaleString("en-IN")} entries. The chain is intact — nothing has been altered or removed.`,
    };
  }
  return {
    error: `Problem at entry #${result.seq}: ${result.problem}. ${result.checked.toLocaleString(
      "en-IN",
    )} entries before it are intact.`,
  };
}
