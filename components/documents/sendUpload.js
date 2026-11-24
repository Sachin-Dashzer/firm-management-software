"use client";

import {
  confirmUpload,
  requestUpload,
} from "../../app/(app)/documents/actions";

/**
 * The three steps of an upload, in one place (P3-48d).
 *
 * Ask the app where the file may go, send the bytes straight to the gateway,
 * then record what the gateway says it stored. Both uploaders in this app —
 * the one on a checklist item and the work drive's queue — run exactly this,
 * because the order is the safety: a failed upload leaves no row, and a row
 * never points at bytes that are not there.
 *
 * The gateway POST goes through `XMLHttpRequest` rather than `fetch` for one
 * reason: `fetch` cannot report **upload** progress, and a person dropping
 * two hundred scans on a Noida broadband connection needs to see that
 * something is happening.
 *
 * @param {File} file
 * @param {object} where the fields `requestUpload` and `confirmUpload` take
 * @param {{ onProgress?: (fraction: number) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<{ ok: string, id: string }|{ error: string }>}
 */
export async function sendUpload(file, where, options = {}) {
  const ticket = await requestUpload({
    ...where,
    filename: file.name,
    mime: file.type,
    size: file.size,
  });
  if (ticket?.error) return { error: ticket.error };
  if (options.signal?.aborted) return { error: "Cancelled." };

  const body = new FormData();
  body.append(ticket.field, file);

  /** @type {any} */
  let stored;
  try {
    stored = await post(ticket.url, body, options);
  } catch (err) {
    return { error: err.message };
  }

  const saved = await confirmUpload({
    ...where,
    key: ticket.key,
    fy: ticket.fy,
    filename: file.name,
    name: where.name || file.name,
    mime: stored.mime || file.type,
    size: stored.size ?? file.size,
    checksum: stored.checksum,
  });
  if (saved?.error) return { error: saved.error };
  return { ok: saved.ok, id: saved.id };
}

/** The gateway POST, with progress and a cancel that really stops it. */
function post(url, body, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    });

    request.addEventListener("load", () => {
      let payload = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }
      if (request.status >= 200 && request.status < 300 && payload) {
        resolve(payload);
      } else {
        reject(new Error(payload?.error ?? "The gateway refused the file."));
      }
    });

    request.addEventListener("error", () =>
      reject(new Error("The gateway could not be reached.")),
    );
    request.addEventListener("abort", () => reject(new Error("Cancelled.")));

    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(body);
  });
}
