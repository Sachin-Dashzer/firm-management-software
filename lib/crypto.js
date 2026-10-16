// @ts-check

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * Two jobs, both using Node's own crypto so there is no third-party
 * dependency on the security path:
 *
 *  1. Passwords: scrypt, a password hashing function (slow on purpose).
 *     Stored as scrypt$N$r$p$salt$hash — the parameters travel with the hash,
 *     so they can be raised later without invalidating old passwords.
 *  2. Sensitive fields: AES-256-GCM (spec section 16) for portal passwords,
 *     bank details, Aadhaar and TOTP secrets. GCM authenticates the
 *     ciphertext, so tampering fails loudly instead of decrypting to rubbish.
 */

const scryptAsync = promisify(scrypt);

// cost parameters: ~100ms per hash on a laptop, raise N when hardware improves
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/**
 * @param {string} password
 * @returns {Promise<string>} the full hash string to store
 */
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 10) {
    throw new Error("Password must be at least 10 characters");
  }
  const salt = randomBytes(16);
  const hash = /** @type {Buffer} */ (
    await scryptAsync(password.normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT)
  );
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/**
 * Constant-time check of a password against a stored hash.
 * Returns false rather than throwing on a malformed hash, so a corrupt
 * record cannot be told apart from a wrong password.
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored).split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = /** @type {Buffer} */ (
      await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
        N: Number(N),
        r: Number(r),
        p: Number(p),
      })
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** @returns {Buffer} the 32-byte master key from the environment */
function masterKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is not set. See .env.example; generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

/**
 * Encrypt a sensitive string for storage.
 * @param {string} plaintext
 * @returns {string} v1:<iv>:<authTag>:<ciphertext>, all base64
 */
export function encryptField(plaintext) {
  const iv = randomBytes(12); // 96-bit nonce, the size GCM is defined for
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a field written by {@link encryptField}. Throws if the value was
 * tampered with or the key is wrong.
 * @param {string} payload
 * @returns {string}
 */
export function decryptField(payload) {
  const [version, ivB64, tagB64, ctB64] = String(payload).split(":");
  if (version !== "v1") throw new Error("Unknown encrypted field version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return (
    decipher.update(Buffer.from(ctB64, "base64"), undefined, "utf8") +
    decipher.final("utf8")
  );
}

/** Mask all but the last 4 characters, for Aadhaar and similar (spec 16). */
export function maskAllButLast4(value) {
  const s = String(value ?? "");
  return s.length <= 4 ? s : "X".repeat(s.length - 4) + s.slice(-4);
}
