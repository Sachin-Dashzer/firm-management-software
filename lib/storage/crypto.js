// @ts-check

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * The on-disk format for a stored file, shared by the PHP gateway and the
 * local driver so a vault written by one can be read by the other.
 *
 *   [ 12-byte IV ][ 16-byte GCM tag ][ ciphertext ]
 *
 * AES-256-GCM, with the file key as additional authenticated data: moving a
 * file to another key, or editing a byte of it, makes decryption fail rather
 * than return something plausible.
 *
 * `tests/gateway-format.test.js` pins the layout, which is how the PHP half
 * is checked without running PHP.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** @param {string} base64Key 32 bytes, base64 */
function keyFrom(base64Key) {
  const key = Buffer.from(String(base64Key ?? ""), "base64");
  if (key.length !== 32) {
    throw new Error("The storage encryption key must be 32 bytes, base64");
  }
  return key;
}

/**
 * @param {Buffer} plain
 * @param {string} fileKey used as additional authenticated data
 * @param {string} base64Key
 * @returns {Buffer}
 */
export function sealFile(plain, fileKey, base64Key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(fileKey, "utf8"));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

/**
 * @param {Buffer} stored
 * @param {string} fileKey
 * @param {string} base64Key
 * @returns {Buffer}
 */
export function openFile(stored, fileKey, base64Key) {
  if (stored.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("Stored file is too short to be valid");
  }
  const iv = stored.subarray(0, IV_BYTES);
  const tag = stored.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = stored.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(fileKey, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
