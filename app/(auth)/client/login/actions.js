"use server";

import { z } from "zod";
import { connectDB } from "@/lib/db";
import ClientUser from "@/models/ClientUser";
import { decryptField, encryptField, verifyPassword } from "@/lib/crypto";
import {
  newTotpSecret,
  signChallenge,
  totpQrDataUrl,
  readChallenge,
  verifyTotp,
} from "@/lib/twoFactor";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { isLocked, afterFailure, LOCK_MINUTES } from "@/lib/security/lockout";

/**
 * Step one of a client's sign-in (P2-9a).
 *
 * The staff flow's twin, with three differences that matter:
 *
 *  - it reads `clientUsers`, never `users`;
 *  - the challenge it signs is prefixed `client:`, so a portal challenge
 *    cannot be replayed against the staff provider even though both are
 *    signed with the same key;
 *  - 2FA is optional (the firm turns it on per account), so a password on
 *    its own can be enough — which is exactly why the lockout and the
 *    vague failure message matter more here, not less.
 */

const passwordStep = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const SAME_ANSWER = { error: "Email or password is not correct." };

/** Logged like a staff failure, so a run of attempts is visible. */
async function logFailedSignIn(email, id) {
  try {
    await audited(null, (session) =>
      recordAudit(
        {
          action: ACTIONS.loginFailed,
          entityType: "ClientUser",
          entityId: id ?? "unknown",
          note: `client portal, tried to sign in as ${email}`,
        },
        session,
      ),
    );
  } catch {
    // the sign-in answer matters more than the log line
  }
}

/**
 * @param {{ email: string, password: string }} input
 * @returns {Promise<{ error: string } | { challenge: string, needsCode: boolean, needsSetup?: boolean, qr?: string, secret?: string }>}
 */
export async function startClientSignIn(input) {
  const parsed = passwordStep.safeParse(input);
  if (!parsed.success) return SAME_ANSWER;
  const { email, password } = parsed.data;

  await connectDB();
  const person = await ClientUser.findOne({ email }).select(
    "+passwordHash +failedLogins +lockedUntil +totpSecret",
  );

  // the same work for a missing account as for a wrong password, so the
  // timing does not say which addresses exist
  if (!person) {
    await verifyPassword(password, "scrypt$16384$8$1$AAAA$AAAA");
    await logFailedSignIn(email, null);
    return SAME_ANSWER;
  }

  if (isLocked(person)) {
    return {
      // a client has nobody in the firm to ask by name, so this says what
      // to do rather than who to ask
      error: `Too many attempts. Please try again after ${LOCK_MINUTES} minutes, or contact the office for a new password.`,
    };
  }

  const ok = person.passwordHash
    ? await verifyPassword(password, person.passwordHash)
    : false;

  if (!ok) {
    await ClientUser.updateOne(
      { _id: person._id },
      { $set: afterFailure(person) },
    );
    await logFailedSignIn(email, String(person._id));
    return SAME_ANSWER;
  }

  if (!person.active) {
    await logFailedSignIn(email, String(person._id));
    return SAME_ANSWER;
  }

  const challenge = signChallenge(`client:${person._id}`);

  if (!person.totpRequired) return { challenge, needsCode: false };

  // 2FA has been turned on for this account but never set up: show the QR
  // now rather than letting the account work without what the firm asked
  // for. The same reasoning as the staff flow, and the same reuse of an
  // abandoned secret so a half-scanned entry is not orphaned.
  if (!person.totpEnabledAt) {
    let secret;
    try {
      secret = person.totpSecret ? decryptField(person.totpSecret) : null;
    } catch {
      secret = null;
    }
    if (!secret) {
      secret = newTotpSecret();
      await ClientUser.updateOne(
        { _id: person._id },
        { $set: { totpSecret: encryptField(secret), totpEnabledAt: null } },
      );
    }
    return {
      challenge,
      needsCode: true,
      needsSetup: true,
      qr: await totpQrDataUrl(secret, person.email),
      secret,
    };
  }

  return { challenge, needsCode: true };
}

/**
 * Turn 2FA on for a portal account that has just scanned the QR. Mirrors
 * `confirmTotpSetup` for staff; the session is still issued by Auth.js
 * afterwards, so a half-finished setup grants nothing.
 *
 * @param {{ challenge: string, code: string }} input
 */
export async function confirmClientTotpSetup({ challenge, code }) {
  const raw = readChallenge(String(challenge ?? ""));
  if (!raw || !raw.startsWith("client:")) {
    return { error: "That took too long. Please sign in again." };
  }

  await connectDB();
  const person = await ClientUser.findById(raw.slice("client:".length)).select(
    "+totpSecret +lastTotpCounter",
  );
  if (!person || !person.active || !person.totpSecret) {
    return { error: "That took too long. Please sign in again." };
  }

  const result = verifyTotp({
    secret: decryptField(person.totpSecret),
    email: person.email,
    code: String(code ?? ""),
    lastCounter: person.lastTotpCounter,
  });
  if (!result.ok) {
    return {
      error:
        result.reason === "reused"
          ? "That code has already been used. Wait for the next one."
          : "That code is not right. Check the app and try again.",
    };
  }

  await ClientUser.updateOne(
    { _id: person._id },
    { $set: { totpEnabledAt: new Date() } },
  );
  return { ok: true };
}
