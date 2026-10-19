// @ts-check

import ClientAccess from "../models/ClientAccess.js";
import { connectDB } from "../lib/db.js";
import { systemAudit } from "../lib/audit/system.js";

/**
 * Switch off Client Access Grants that have reached their end date.
 *
 * **This job does not enforce anything.** `accessFor()` already refuses a
 * grant whose `expiresAt` has passed, at the moment it reads it, so a cron
 * that fails for a week cannot leave anybody's access open past its date.
 * What this does is tidy up: it marks the row inactive so the access review
 * on the client's Team and access tab shows what is live rather than a list
 * somebody has to date-check by eye.
 *
 * One `save()` per grant rather than an `updateMany`, because the audit
 * plugin cannot say which records a bulk update touched — and "when did
 * Ananya stop being able to see this client" is exactly the question an ICAI
 * confidentiality review asks.
 *
 * @param {{ now?: Date, limit?: number }} [options]
 */
export async function expireGrants(options = {}) {
  await connectDB();

  const now = options.now ?? new Date();
  const limit = options.limit ?? 200;

  const lapsed = await ClientAccess.find({
    active: true,
    expiresAt: { $ne: null, $lte: now },
  }).limit(limit);

  const expired = [];
  const failed = [];

  for (const grant of lapsed) {
    try {
      await systemAudit(async (session) => {
        grant.active = false;
        grant.revokedAt = grant.expiresAt;
        grant.updatedBy = null;
        await grant.save({ session });
      });
      expired.push(String(grant._id));
    } catch (err) {
      failed.push({ id: String(grant._id), error: err.message });
    }
  }

  return { expired: expired.length, failed, more: lapsed.length === limit };
}

export default expireGrants;
