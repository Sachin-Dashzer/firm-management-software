// @ts-check

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * A typed-code gate in front of a dangerous reveal.
 *
 * This is **not** bot defence. The code is on the screen, so anything that
 * can read the screen can type it. What it is for is deliberateness: the
 * logins vault lists every portal password the firm holds, and a button that
 * decrypts one on a single click is a password shown by a mis-click, by a
 * stray Enter on a focused row, or by somebody leaning over a keyboard. Five
 * characters typed by hand is the smallest thing that makes a reveal an act
 * rather than an accident — and the audit entry it writes names a person who
 * meant it.
 *
 * The answer never travels in the token: the token is an expiry plus an HMAC
 * over the code, so a reply can be checked without the server keeping any
 * state between the two requests.
 *
 * ponytail: friction, not a captcha. If the threat ever becomes automation
 * rather than accident, swap `issueChallenge` for a real challenge service —
 * the two functions here are the whole interface.
 */

/** Five minutes: long enough to read, short enough not to be left open. */
const LIFE_MS = 5 * 60_000;

/** No 0/O, 1/I/L, 2/Z, 5/S, 8/B — a code is read aloud and mistyped. */
const ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";

function secret() {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (see .env.example)");
  }
  return value;
}

/**
 * @param {string} code
 * @param {number} expiry
 */
function sign(code, expiry) {
  return createHmac("sha256", secret())
    .update(`${code}.${expiry}`)
    .digest("hex");
}

/**
 * A fresh code and the token that will check the answer to it.
 * @param {number} [length]
 * @returns {{ code: string, token: string }}
 */
export function issueChallenge(length = 5) {
  const code = Array.from(
    { length },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
  const expiry = Date.now() + LIFE_MS;
  return { code, token: `${expiry}.${sign(code, expiry)}` };
}

/**
 * Was this the code that was shown, and is it still fresh?
 * @param {unknown} token
 * @param {unknown} answer
 */
export function verifyChallenge(token, answer) {
  if (typeof token !== "string" || typeof answer !== "string") return false;

  const [expiryText, signature] = token.split(".");
  const expiry = Number(expiryText);
  if (!signature || !Number.isFinite(expiry) || expiry < Date.now()) {
    return false;
  }

  const expected = sign(answer.trim().toUpperCase(), expiry);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
