// @ts-check

import Counter from "../../models/Counter.js";

/**
 * Engagement codes (spec section 13): `NOI-GSTR3B-2026-10-0412`.
 *
 * Branch, service, period, then a running number from an atomic `$inc`
 * inside the caller's transaction — the same guarantee as client codes, so
 * two people creating October's GST work at once cannot collide. The series
 * runs per branch and financial year, which keeps the numbers short and
 * meaningful on a printed list.
 *
 * @param {string} branchCode   e.g. "NOI"
 * @param {string} serviceCode  e.g. "GSTR3B"
 * @param {string} periodCode   e.g. "2026-10"
 * @param {import("mongoose").ClientSession} session
 * @returns {Promise<string>}
 */
export async function nextEngagementCode(
  branchCode,
  serviceCode,
  periodCode,
  session,
) {
  const branch = String(branchCode ?? "").toUpperCase();
  const service = String(serviceCode ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(branch)) {
    throw new Error(`Not a branch code: ${branchCode}`);
  }
  if (!/^[A-Z0-9-]{2,16}$/.test(service)) {
    throw new Error(`Not a service code: ${serviceCode}`);
  }

  // the financial year the period sits in, so the series restarts each year
  const year = /^FY(\d{4})/.exec(periodCode)?.[1] ?? periodCode.slice(0, 4);

  const counter = await Counter.findOneAndUpdate(
    { _id: `engagement:${branch}:${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session },
  );

  return `${branch}-${service}-${periodCode}-${String(counter.seq).padStart(4, "0")}`;
}
