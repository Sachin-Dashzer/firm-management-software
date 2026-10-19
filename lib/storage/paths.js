// @ts-check

import { randomUUID } from "node:crypto";

/**
 * Where a file lives in the vault (spec section 6: the storage path is
 * structured automatically).
 *
 *   clients/PHMG-NOI-0142/FY2026-27/GSTR3B/NOI-GSTR3B-2026-10-0412/<id>-sales.pdf
 *   clients/PHMG-NOI-0142/permanent/<id>-incorporation.pdf
 *
 * The folder names come from codes the app generates, never from anything a
 * person typed, and the file name is prefixed with a fresh id so two uploads
 * of "scan.pdf" cannot collide or overwrite each other. The whole key is
 * then checked against the same rule the gateway applies.
 */

/** Keep only what both the key rule and a cPanel filesystem are happy with. */
function clean(part, fallback = "x") {
  const safe = String(part ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "")
    .slice(0, 80);
  return safe || fallback;
}

/** The extension, lower-cased, or nothing. */
function extensionOf(filename) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(String(filename ?? ""));
  return match ? `.${match[1].toLowerCase()}` : "";
}

/**
 * @param {object} input
 * @param {string} input.clientCode   e.g. PHMG-NOI-0142
 * @param {string} input.filename     what the person called it
 * @param {string} [input.fy]         e.g. FY2026-27
 * @param {string} [input.serviceCode]
 * @param {string} [input.engagementCode]
 * @param {boolean} [input.permanent] the client's permanent file
 * @returns {string}
 */
export function buildFileKey({
  clientCode,
  filename,
  fy,
  serviceCode,
  engagementCode,
  permanent = false,
}) {
  const stem = clean(
    String(filename ?? "file").replace(/\.[A-Za-z0-9]{1,8}$/, ""),
    "file",
  );
  const name = `${randomUUID()}-${stem}${extensionOf(filename)}`;

  const folders = permanent
    ? ["clients", clean(clientCode, "unfiled"), "permanent"]
    : [
        "clients",
        clean(clientCode, "unfiled"),
        clean(fy, "no-year"),
        clean(serviceCode, "general"),
        clean(engagementCode, "loose"),
      ];

  return [...folders, name].join("/");
}

/** The name to show, with the id prefix taken back off. */
export function displayName(key) {
  const last =
    String(key ?? "")
      .split("/")
      .pop() ?? "";
  return last.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/,
    "",
  );
}
