// @ts-check

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tokens for the client upload links (spec section 6).
 *
 * The link is the only credential, so the token is long and random, and only
 * its hash is kept — a stolen copy of the database contains no working
 * links. Looking one up is a hash lookup, not a scan, and the comparison is
 * constant-time so a near-miss tells an attacker nothing about how near.
 */

/** Seven days, per spec section 6. */
export const REQUEST_DAYS = Number(process.env.DOC_REQUEST_DAYS || 7);

/** 32 random bytes as url-safe text: far beyond guessing. */
export function newRequestToken() {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** @param {string} token */
export function hashRequestToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

/**
 * @param {string} token what the visitor presented
 * @param {string} storedHash
 */
export function tokenMatches(token, storedHash) {
  const given = Buffer.from(hashRequestToken(token));
  const want = Buffer.from(String(storedHash ?? ""));
  return given.length === want.length && timingSafeEqual(given, want);
}

/** @param {Date} [from] */
export function requestExpiry(from = new Date()) {
  return new Date(from.getTime() + REQUEST_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The full link to give the client.
 * @param {string} token
 */
export function requestLink(token) {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${base}/upload/${token}`;
}
