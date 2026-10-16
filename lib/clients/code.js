// @ts-check

import Counter from "../../models/Counter.js";

/**
 * Client codes (spec section 3): PHMG-NOI-0142, one running series per branch.
 *
 * The number comes from an atomic `$inc` inside the caller's transaction, so
 * two people onboarding a client at the same moment cannot be handed the same
 * code. Codes are never reused, even if a client is later deleted — a code in
 * an old engagement letter must always point at the same client.
 *
 * @param {string} branchCode e.g. "NOI"
 * @param {import("mongoose").ClientSession} session
 * @returns {Promise<string>}
 */
export async function nextClientCode(branchCode, session) {
  const code = String(branchCode ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`Not a branch code: ${branchCode}`);
  }

  const counter = await Counter.findOneAndUpdate(
    { _id: `client:${code}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session },
  );

  return `PHMG-${code}-${String(counter.seq).padStart(4, "0")}`;
}
