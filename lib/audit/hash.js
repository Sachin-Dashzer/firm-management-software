// @ts-check

import { createHash } from "node:crypto";

/**
 * The tamper-evidence chain (spec section 11).
 *
 * Each entry hashes its own contents together with the hash of the entry
 * before it. Change one old entry and its hash changes; every later entry
 * then fails to match the `prevHash` it recorded, so the break is visible and
 * its position is known. Delete an entry and the sequence numbers show a gap.
 *
 * This does not make tampering impossible — someone with write access to the
 * database could recompute the whole chain — but it cannot be done quietly,
 * which is what an audit trail is for.
 */

export const GENESIS = "0".repeat(64);

/**
 * Serialise an entry the same way every time, whatever order the keys arrive
 * in, so the hash of the same entry never differs between two machines.
 * @param {unknown} value
 * @returns {string}
 */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}

/**
 * The fields that are hashed. Anything not listed here is not protected, so
 * everything that matters for "who did what to which record" is included.
 *
 * @param {object} entry
 * @returns {string} 64-character hex digest
 */
export function hashEntry(entry) {
  const payload = canonical({
    seq: entry.seq,
    ts: entry.ts instanceof Date ? entry.ts.toISOString() : entry.ts,
    userId: entry.userId ?? null,
    userName: entry.userName ?? "",
    role: entry.role ?? "",
    branchId: entry.branchId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    clientId: entry.clientId ?? null,
    diff: entry.diff ?? {},
    note: entry.note ?? "",
    ip: entry.ip ?? "",
    userAgent: entry.userAgent ?? "",
    prevHash: entry.prevHash,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Walk a run of entries in sequence order and report the first break.
 *
 * @param {object[]} entries ordered by `seq` ascending
 * @param {{ expectedFirstSeq?: number, expectedPrevHash?: string }} [from]
 *   where this run is expected to start, when checking a slice rather than
 *   the whole collection
 * @returns {{ ok: true, checked: number, lastHash: string }
 *          | { ok: false, checked: number, seq: number|null, problem: string }}
 */
export function verifyChain(entries, from = {}) {
  let expectedSeq = from.expectedFirstSeq ?? 1;
  let prevHash = from.expectedPrevHash ?? GENESIS;
  let checked = 0;

  for (const entry of entries) {
    if (entry.seq !== expectedSeq) {
      return {
        ok: false,
        checked,
        seq: entry.seq,
        problem: `missing entries: expected #${expectedSeq}, found #${entry.seq}`,
      };
    }
    if (entry.prevHash !== prevHash) {
      return {
        ok: false,
        checked,
        seq: entry.seq,
        problem: `entry #${entry.seq} does not follow the one before it`,
      };
    }
    if (hashEntry(entry) !== entry.hash) {
      return {
        ok: false,
        checked,
        seq: entry.seq,
        problem: `entry #${entry.seq} has been altered since it was written`,
      };
    }
    prevHash = entry.hash;
    expectedSeq += 1;
    checked += 1;
  }

  return { ok: true, checked, lastHash: prevHash };
}
