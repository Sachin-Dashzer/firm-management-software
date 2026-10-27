// @ts-check

import Counter from "../../models/Counter.js";
import Branch from "../../models/Branch.js";
import { financialYearLabel } from "../dates.js";

/**
 * Certificate numbers: `NOI/CERT/26-27/0001` (P3-15).
 *
 * One series per branch per financial year, taken from an atomic `$inc`
 * inside the caller's transaction, exactly like invoice numbers
 * (`lib/billing/number.js`) — but for a different reason, and the
 * difference is worth saying.
 *
 * An invoice number is handed out when the invoice is **issued**, because a
 * statutory series must not gap. A certificate's number is handed out when
 * the **draft is started**, because the register's purpose is to answer
 * "what have we been asked to certify", and a draft abandoned halfway is
 * part of that answer. Nothing is hard-deleted here either (CLAUDE.md rule
 * 3), so an abandoned draft stays visible in its series rather than leaving
 * a hole nobody can explain.
 *
 * @param {string} branchId
 * @param {import("mongoose").ClientSession} session
 * @returns {Promise<string>}
 */
export async function nextCertificateNumber(branchId, session) {
  if (!session) {
    throw new Error(
      "A certificate number must be taken inside the transaction that writes the certificate.",
    );
  }

  const branch = await Branch.findById(branchId)
    .select("code")
    .session(session);
  if (!branch) throw new Error("That branch no longer exists.");

  // 2026-27 is printed 26-27, as on an invoice
  const fy = financialYearLabel(new Date()).slice(2);
  const series = `${branch.code}/CERT/${fy}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: `certificate:${branch.code}:${fy}` },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true, session },
  );

  return `${series}/${String(counter.seq).padStart(4, "0")}`;
}
