// @ts-check

import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

/**
 * Signed tickets: the only way anything reaches the file gateway
 * (spec section 14).
 *
 * A ticket says what may be done, to which file, how big it may be, and for
 * how long. The app signs it with a secret shared only with the gateway, so
 * the browser can upload straight to BigRock without the app ever trusting
 * what the browser claims.
 *
 * The wire format is fixed, because the other half of it is PHP:
 *
 *   payload   = base64url(JSON.stringify(ticket))
 *   signature = HMAC-SHA256(secret, payload), lower-case hex
 *   url       = <gateway>/<script>?t=<payload>&s=<signature>
 *
 * `tests/gateway-format.test.js` pins this, so the PHP side can be checked
 * against it without a server.
 *
 * @typedef {object} Ticket
 * @property {string} k    the file key
 * @property {"put"|"get"|"del"} op
 * @property {number} exp  unix seconds
 * @property {string} n    a nonce, so two tickets are never identical
 * @property {number} [max]   largest size accepted, bytes
 * @property {string[]} [types] MIME types accepted
 * @property {string} [name]  download filename
 * @property {string} [mime]  download content type
 * @property {boolean} [inline]  show in the browser rather than download
 * @property {boolean} [restore] move back out of the recycle folder
 * @property {boolean} [purge]   erase from the recycle folder
 */

/** @param {Buffer|string} value */
function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** @param {string} value */
function fromBase64url(value) {
  return Buffer.from(
    value.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

/** The shared secret, which must match the gateway's config file exactly. */
export function sharedSecret() {
  const secret = process.env.STORAGE_SHARED_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "STORAGE_SHARED_SECRET is missing or too short (see .env.example)",
    );
  }
  return secret;
}

/**
 * @param {Omit<Ticket, "exp"|"n"> & {exp?: number, n?: string}} ticket
 * @param {{ secret?: string, ttlSeconds?: number, now?: number }} [options]
 * @returns {{ payload: string, signature: string }}
 */
export function signTicket(ticket, options = {}) {
  const secret = options.secret ?? sharedSecret();
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const full = {
    ...ticket,
    exp: ticket.exp ?? now + (options.ttlSeconds ?? 300),
    n: ticket.n ?? randomUUID(),
  };
  const payload = base64url(JSON.stringify(full));
  return {
    payload,
    signature: createHmac("sha256", secret).update(payload).digest("hex"),
  };
}

/**
 * Check a ticket the way the PHP gateway does. Used by the local storage
 * driver, so development exercises the same rules as BigRock.
 *
 * @param {string} payload
 * @param {string} signature
 * @param {string} operation
 * @param {{ secret?: string, now?: number }} [options]
 * @returns {{ ok: true, ticket: Ticket }|{ ok: false, error: string, status: number }}
 */
export function verifyTicket(payload, signature, operation, options = {}) {
  const secret = options.secret ?? sharedSecret();
  const now = options.now ?? Math.floor(Date.now() / 1000);

  if (!payload || !signature) {
    return { ok: false, error: "Missing ticket", status: 401 };
  }

  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const given = Buffer.from(String(signature));
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return { ok: false, error: "Bad signature", status: 401 };
  }

  /** @type {Ticket} */
  let ticket;
  try {
    ticket = JSON.parse(fromBase64url(payload));
  } catch {
    return { ok: false, error: "Unreadable ticket", status: 400 };
  }

  if (ticket.op !== operation) {
    return {
      ok: false,
      error: "Ticket is not for this operation",
      status: 403,
    };
  }
  if (!(Number(ticket.exp) > now)) {
    return { ok: false, error: "Ticket has expired", status: 401 };
  }
  if (!isSafeKey(ticket.k)) {
    return { ok: false, error: "Bad file key", status: 400 };
  }

  return { ok: true, ticket };
}

/**
 * The same rule the gateway applies: a key is a relative path we built
 * ourselves, and anything that could climb out of the vault is refused
 * rather than cleaned up.
 * @param {string} key
 */
export function isSafeKey(key) {
  if (typeof key !== "string" || key === "" || key.length > 400) return false;
  if (key.includes("\0") || key.includes("..")) return false;
  if (key.startsWith("/") || key.startsWith(".")) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key);
}
