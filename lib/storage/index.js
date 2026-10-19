// @ts-check

import { signTicket, isSafeKey } from "./tickets.js";

/**
 * The one way the app touches stored files (spec section 14).
 *
 * Four calls, two drivers. `bigrock` is the PHP gateway on the firm's
 * hosting; `local` writes to a folder on this machine through the app's own
 * route, using the same tickets and the same encrypted format, so
 * development and the tests exercise the real rules. Swapping in S3 later
 * means writing a third driver, not touching a screen.
 *
 *   getUploadTicket(...)  → where the browser should POST the file
 *   getDownloadLink(...)  → a short-lived link to read one
 *   remove(key, ...)      → move to the recycle folder, restore, or purge
 *   exists(key)           → is it really there
 */

/** 25 MB unless the firm says otherwise. */
export const MAX_UPLOAD_BYTES = Number(
  process.env.STORAGE_MAX_BYTES || 25 * 1024 * 1024,
);

/**
 * What the firm actually receives and produces. The gateway checks the
 * bytes, not the extension, so a renamed executable is refused.
 */
export const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
];

/** Types a browser may render rather than download. */
export const PREVIEWABLE = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function driverName() {
  const named = process.env.STORAGE_DRIVER;
  if (named) return named;
  return process.env.STORAGE_GATEWAY_URL ? "bigrock" : "local";
}

/** Where the gateway lives. The local driver uses the app's own route. */
function gatewayBase() {
  if (driverName() === "local") {
    const app = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return `${app.replace(/\/$/, "")}/api/storage/local`;
  }
  const base = process.env.STORAGE_GATEWAY_URL;
  if (!base) throw new Error("STORAGE_GATEWAY_URL is not set");
  return base.replace(/\/$/, "");
}

/** The local driver answers every verb on one route. */
function endpoint(script) {
  return driverName() === "local"
    ? gatewayBase()
    : `${gatewayBase()}/${script}`;
}

function url(script, ticket, ttlSeconds) {
  const { payload, signature } = signTicket(ticket, { ttlSeconds });
  return `${endpoint(script)}?t=${payload}&s=${signature}`;
}

/**
 * A ten-minute ticket to upload one file (spec section 14).
 * @param {object} input
 * @param {string} input.key
 * @param {number} [input.maxBytes]
 * @param {string[]} [input.types]
 */
export function getUploadTicket({ key, maxBytes, types } = {}) {
  if (!isSafeKey(key)) throw new Error(`Unsafe file key: ${key}`);
  return {
    url: url(
      "upload.php",
      {
        k: key,
        op: "put",
        max: maxBytes ?? MAX_UPLOAD_BYTES,
        types: types ?? ALLOWED_TYPES,
      },
      600,
    ),
    field: "file",
    maxBytes: maxBytes ?? MAX_UPLOAD_BYTES,
  };
}

/**
 * A five-minute link to read one file. The caller has already checked
 * permissions and written the audit entry.
 * @param {object} input
 * @param {string} input.key
 * @param {string} [input.name]
 * @param {string} [input.mime]
 * @param {boolean} [input.inline] render in the browser instead of downloading
 */
export function getDownloadLink({ key, name, mime, inline = false } = {}) {
  if (!isSafeKey(key)) throw new Error(`Unsafe file key: ${key}`);
  return url(
    "download.php",
    {
      k: key,
      op: "get",
      name,
      mime,
      inline: inline && PREVIEWABLE.includes(mime ?? ""),
    },
    300,
  );
}

/**
 * Move a file to the recycle folder, bring it back, or erase it.
 * Erasing is only ever done by the 90-day purge.
 * @param {string} key
 * @param {{ restore?: boolean, purge?: boolean }} [options]
 */
export async function remove(key, options = {}) {
  if (!isSafeKey(key)) throw new Error(`Unsafe file key: ${key}`);

  // the local driver is this same process: call it rather than making the
  // app fetch itself over HTTP
  if (driverName() === "local") {
    const { removeLocal } = await import("./local.js");
    return removeLocal(key, options);
  }

  const target = url(
    "delete.php",
    { k: key, op: "del", restore: options.restore, purge: options.purge },
    120,
  );
  const response = await fetch(target, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Gateway refused the delete (${response.status})`);
  }
  return response.json();
}

/** @param {string} key */
export async function exists(key) {
  if (!isSafeKey(key)) return false;

  if (driverName() === "local") {
    const { existsLocal } = await import("./local.js");
    return existsLocal(key);
  }

  const response = await fetch(getDownloadLink({ key }), { method: "HEAD" });
  return response.ok;
}
