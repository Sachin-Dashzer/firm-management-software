// @ts-check

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";

/**
 * Mandatory TOTP two-factor for every staff account (spec section 16).
 *
 * Sign-in runs in two parts so the password is never held in the browser while
 * the user fetches a code from their phone:
 *
 *   1. The password is checked on the server, which returns a *challenge*: a
 *      short-lived HMAC-signed string naming the user. No session yet.
 *   2. The challenge plus the 6-digit code are exchanged for a session.
 *
 * A challenge on its own is useless without a valid code, and it expires in
 * five minutes.
 */

const ISSUER = "PHMG & Associates";
const PERIOD = 30; // seconds per code
const DIGITS = 6;
const WINDOW = 1; // accept the previous and next code: phone clocks drift
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Testing escape hatch: with AUTH_SKIP_2FA=true the second step is skipped
 * and the password alone signs you in.
 *
 * **It is ignored in production, whatever the environment says.** 2FA is
 * mandatory for staff (spec section 16), and a firm's entire client list
 * sits behind these accounts. A flag that turns the second factor off is
 * the right tool while the owner is trying the system out on a laptop and
 * an open door on the real deployment — and the version of this that
 * trusted the variable everywhere is why the go-live audit opened with
 * "the password alone signs anybody in".
 *
 * So the hatch stays for development and cannot reach production. The
 * refusal is logged once rather than silently: somebody who set the flag on
 * purpose should find out why it did nothing. `scripts/doctor.js` fails on
 * it as well, from `twoFactorConfig()` below, so the two cannot disagree.
 */
export function skip2fa() {
  if (process.env.AUTH_SKIP_2FA !== "true") return false;

  if (inProduction()) {
    warnOnce(
      "AUTH_SKIP_2FA=true was ignored: two-factor sign-in is mandatory in production (spec section 16). Remove the variable from this deployment's environment.",
    );
    return false;
  }

  return true;
}

/** Is this the real deployment, rather than a preview or a laptop? */
function inProduction() {
  return (
    process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")
  );
}

/** One line per process, not one per sign-in attempt. */
let warned = false;
/** @param {string} message */
function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.error(message);
}

/**
 * What `doctor` reports about the second factor, so the check and the
 * behaviour come from the same place.
 *
 * @returns {{ ok: boolean, skipping: boolean, ignored: boolean, reason?: string }}
 */
export function twoFactorConfig() {
  const asked = process.env.AUTH_SKIP_2FA === "true";
  const production = inProduction();

  if (asked && production) {
    return {
      ok: false,
      skipping: false,
      ignored: true,
      reason:
        "AUTH_SKIP_2FA=true is set on a production deployment. It is being ignored, so sign-in is still safe — but remove it, because it means the firm's real environment is configured to skip two-factor.",
    };
  }

  if (asked) {
    return {
      ok: false,
      skipping: true,
      ignored: false,
      reason:
        "AUTH_SKIP_2FA is on: the password alone signs anybody in. Right for trying the system out, wrong for go-live. Remove it before the firm relies on this.",
    };
  }

  return { ok: true, skipping: false, ignored: false };
}

/** @returns {string} a new base32 TOTP secret */
export function newTotpSecret() {
  return new Secret({ size: 20 }).base32;
}

/**
 * @param {string} secret base32
 * @param {string} email the account the code belongs to
 */
function totpFor(secret, email) {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1", // what Google Authenticator and Authy implement
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

/**
 * The otpauth:// URI an authenticator app scans.
 * @param {string} secret
 * @param {string} email
 */
export function totpUri(secret, email) {
  return totpFor(secret, email).toString();
}

/**
 * That URI as a PNG data URL, for the setup screen.
 * @param {string} secret
 * @param {string} email
 * @returns {Promise<string>}
 */
export function totpQrDataUrl(secret, email) {
  return QRCode.toDataURL(totpUri(secret, email), {
    margin: 1,
    width: 220,
    color: { dark: "#1b2233ff", light: "#fffdf8ff" },
  });
}

/**
 * Check a code. Rejects a code from a time step that has already been used,
 * so someone who shoulder-surfs a code cannot replay it.
 *
 * @param {object} args
 * @param {string} args.secret base32 secret
 * @param {string} args.email
 * @param {string} args.code what the user typed
 * @param {number} [args.lastCounter] the newest time step already accepted
 * @returns {{ ok: boolean, counter?: number, reason?: string }}
 */
export function verifyTotp({ secret, email, code, lastCounter = 0 }) {
  const clean = String(code ?? "").replace(/\D/g, "");
  if (clean.length !== DIGITS) return { ok: false, reason: "format" };

  const delta = totpFor(secret, email).validate({
    token: clean,
    window: WINDOW,
  });
  if (delta === null) return { ok: false, reason: "wrong" };

  const counter = Math.floor(Date.now() / 1000 / PERIOD) + delta;
  if (counter <= lastCounter) return { ok: false, reason: "reused" };
  return { ok: true, counter };
}

/** @returns {Buffer} */
function challengeKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (see .env.example)");
  return Buffer.from(secret);
}

/**
 * A signed, five-minute token saying "this person proved their password".
 * @param {string} userId
 * @returns {string}
 */
export function signChallenge(userId) {
  const body = `${userId}.${Date.now()}.${randomBytes(8).toString("hex")}`;
  const mac = createHmac("sha256", challengeKey()).update(body).digest("hex");
  return `${body}.${mac}`;
}

/**
 * Read a challenge back, or null if it is forged, altered or expired.
 * @param {string} challenge
 * @returns {string | null} the user id
 */
export function readChallenge(challenge) {
  try {
    const parts = String(challenge).split(".");
    if (parts.length !== 4) return null;
    const [userId, issuedAt, nonce, mac] = parts;
    const body = `${userId}.${issuedAt}.${nonce}`;
    const expected = createHmac("sha256", challengeKey())
      .update(body)
      .digest("hex");
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() - Number(issuedAt) > CHALLENGE_TTL_MS) return null;
    return userId;
  } catch {
    return null;
  }
}
