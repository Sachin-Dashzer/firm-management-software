// @ts-check

/**
 * Set a user's password from the command line, for when nobody can sign in
 * yet. Everything else goes through Settings → Team.
 *
 *   node --env-file=.env.local scripts/set-password.js someone@phmgindia.com "new password"
 */

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import User from "../models/User.js";
import { hashPassword } from "../lib/crypto.js";
import { systemAudit } from "../lib/audit/system.js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error(
    'Usage: node --env-file=.env.local scripts/set-password.js email "new password"',
  );
  process.exit(1);
}

await connectDB();
const passwordHash = await hashPassword(password);
const result = await systemAudit((session) =>
  User.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      $set: {
        passwordHash,
        mustChangePassword: false,
        failedLogins: 0,
        lockedUntil: null,
        updatedBy: "script",
      },
    },
    { session },
  ),
);
console.log(result ? `Password set for ${result.email}` : `No user ${email}`);
await mongoose.disconnect();
