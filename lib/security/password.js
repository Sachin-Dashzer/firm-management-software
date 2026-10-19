// @ts-check

import { randomBytes } from "node:crypto";

/**
 * A one-time password a partner reads out loud (spec section 16).
 *
 * Four groups of four, from an alphabet with no 0/O, 1/I/l or 5/S in it,
 * because the whole point is that it survives being said down a phone and
 * typed by somebody in another office.
 *
 * It lives here, rather than beside the Team screen where it started,
 * because the go-live import creates people too, and two generators for
 * the same job is how one of them quietly gets weaker.
 */
export function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return [0, 4, 8, 12].map((at) => chars.slice(at, at + 4).join("")).join("-");
}
