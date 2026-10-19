"use server";

import { z } from "zod";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { decryptField, encryptField, verifyPassword } from "@/lib/crypto";
import {
  newTotpSecret,
  signChallenge,
  totpQrDataUrl,
  readChallenge,
  verifyTotp,
  skip2fa,
} from "@/lib/twoFactor";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";

/**
 * Failed sign-ins are logged (spec section 11), with the email that was
 * tried, so a run of attempts against one account is visible. A log failure
 * must never turn a wrong password into a server error, so this swallows.
 */
async function logFailedSignIn(email, userId) {
  try {
    await audited(null, (session) =>
      recordAudit(
        {
          action: ACTIONS.loginFailed,
          entityType: "User",
          entityId: userId ?? "unknown",
          note: `tried to sign in as ${email}`,
        },
        session,
      ),
    );
  } catch {
    // the sign-in answer matters more than the log line
  }
}

/**
 * Step one of sign-in: check the password, then hand back a challenge.
 *
 * Deliberately vague on failure. "No account with that email" tells an
 * attacker which addresses are worth attacking, so a wrong email, a wrong
 * password and an inactive account all give the same answer.
 */

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

const passwordStep = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const SAME_ANSWER = { error: "Email or password is not correct." };

/**
 * @param {{ email: string, password: string }} input
 * @returns {Promise<{ error: string } | { challenge: string, needsSetup: boolean, qr?: string }>}
 */
export async function startSignIn(input) {
  const parsed = passwordStep.safeParse(input);
  if (!parsed.success) return SAME_ANSWER;
  const { email, password } = parsed.data;

  await connectDB();
  const user = await User.findOne({ email }).select(
    "+passwordHash +failedLogins +lockedUntil +totpSecret",
  );

  // Hash a throwaway password anyway when there is no such user, so a missing
  // account does not answer faster than a wrong password.
  if (!user) {
    await verifyPassword(password, "scrypt$16384$8$1$AAAA$AAAA");
    await logFailedSignIn(email, null);
    return SAME_ANSWER;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      error: `Too many attempts. Try again after ${LOCK_MINUTES} minutes, or ask a partner to reset your password.`,
    };
  }

  const ok = user.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false;

  if (!ok) {
    const failed = (user.failedLogins ?? 0) + 1;
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          failedLogins: failed,
          lockedUntil:
            failed >= LOCK_AFTER
              ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
              : null,
        },
      },
    );
    await logFailedSignIn(email, String(user._id));
    return SAME_ANSWER;
  }

  if (!user.active) {
    await logFailedSignIn(email, String(user._id));
    return SAME_ANSWER;
  }

  const challenge = signChallenge(String(user._id));

  if (skip2fa()) return { challenge, needsSetup: false, skip2fa: true };

  // First sign-in: 2FA is mandatory, so set it up now rather than letting the
  // account work without it. The secret is stored encrypted but not yet
  // enabled; it only counts once a code from it has been accepted.
  if (!user.totpSecret) {
    const secret = newTotpSecret();
    await User.updateOne(
      { _id: user._id },
      { $set: { totpSecret: encryptField(secret), totpEnabledAt: null } },
    );
    return {
      challenge,
      needsSetup: true,
      qr: await totpQrDataUrl(secret, user.email),
      secret,
    };
  }

  return { challenge, needsSetup: !user.totpEnabledAt };
}

/**
 * Turn 2FA on for a first-time user: the same code check as signing in, but it
 * also stamps `totpEnabledAt`. The session itself is still issued by Auth.js
 * afterwards, so a half-finished setup grants nothing.
 *
 * @param {{ challenge: string, code: string }} input
 * @returns {Promise<{ error: string } | { ok: true }>}
 */
export async function confirmTotpSetup({ challenge, code }) {
  const userId = readChallenge(String(challenge ?? ""));
  if (!userId) return { error: "That took too long. Please sign in again." };

  await connectDB();
  const user = await User.findById(userId).select(
    "+totpSecret +lastTotpCounter",
  );
  if (!user || !user.active || !user.totpSecret) {
    return { error: "That took too long. Please sign in again." };
  }

  const result = verifyTotp({
    secret: decryptField(user.totpSecret),
    email: user.email,
    code: String(code ?? ""),
    lastCounter: user.lastTotpCounter,
  });
  if (!result.ok) {
    return {
      error:
        result.reason === "reused"
          ? "That code has already been used. Wait for the next one."
          : "That code is not right. Check the app and try again.",
    };
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { totpEnabledAt: new Date() } },
  );
  return { ok: true };
}
