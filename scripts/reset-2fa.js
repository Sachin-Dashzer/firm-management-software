// @ts-check

/**
 * Clear a user's 2FA from the command line, for when nobody can sign in to do
 * it from Settings → Team — typically because FIELD_ENCRYPTION_KEY was
 * replaced and the enrolled secret no longer decrypts. They scan a new QR
 * code at their next sign-in. Everything else goes through Settings → Team.
 *
 *   node --env-file=.env scripts/reset-2fa.js someone@phmgindia.com
 */

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import User from "../models/User.js";
import { ACTIONS, recordAudit } from "../lib/audit/index.js";
import { systemAudit } from "../lib/audit/system.js";

const [email] = process.argv.slice(2);
if (!email) {
  console.error(
    "Usage: node --env-file=.env scripts/reset-2fa.js email@example.com",
  );
  process.exit(1);
}

await connectDB();
const result = await systemAudit(async (session) => {
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      $set: {
        totpSecret: null,
        totpEnabledAt: null,
        lastTotpCounter: 0,
        updatedBy: "script",
      },
    },
    { session },
  );
  if (user) {
    await recordAudit(
      {
        action: ACTIONS.twoFactorReset,
        entityType: "User",
        entityId: String(user._id),
      },
      session,
    );
  }
  return user;
});
console.log(
  result
    ? `Two-factor cleared for ${result.email} — they scan a new QR code at the next sign-in.`
    : `No user ${email}`,
);
await mongoose.disconnect();
