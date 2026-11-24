// @ts-check

import { formatISTDate } from "../dates.js";

/**
 * The one shape a file takes on the way to a screen (P3-48b).
 *
 * Here rather than in either caller because the job's Files tab, the job's
 * folder in the drive and every other level of the drive all draw the same
 * row, and two shapes for one row is how a column quietly goes blank on one
 * screen and not the other.
 */

/**
 * @param {any} d a lean `Document`
 * @param {{ linked?: boolean, from?: string, folderPath?: string }} [about]
 *   `linked` means the file really lives somewhere else — a checklist item
 *   answered from the client's permanent file points at the PAN card, which
 *   belongs to the client for ever and not to this job. A row that does not
 *   say so is one somebody deletes while tidying up.
 */
export function fileRow(
  d,
  { linked = false, from = "", folderPath = "" } = {},
) {
  return {
    id: String(d._id),
    name: d.name,
    size: d.size ?? 0,
    mime: d.mime ?? "",
    checklistItemId: d.checklistItemId ? String(d.checklistItemId) : null,
    versions: (d.versions ?? []).length,
    uploadedByName: d.uploadedByName ?? "",
    origin: d.origin === "firm" ? "firm" : "client",
    isPermanent: Boolean(d.isPermanent),
    /** Yesterday's label folder, until P3-48c migrates it into `folderId`. */
    folder: (d.kind ?? "").trim(),
    sharedWithClient: Boolean(d.sharedWithClient),
    /** Erased on a DPDP request: the row stays, the file does not. */
    redacted: Boolean(d.redactedAt),
    uploadedOn: d.createdAt ? formatISTDate(d.createdAt) : "",
    at: d.createdAt ? new Date(d.createdAt).toISOString() : "",
    linked,
    from,
    folderPath,
  };
}

/**
 * One letter written from a template, in the shape the Letters and Files
 * tabs already draw.
 *
 * Not a file: `GeneratedDoc` holds the words and renders the PDF on demand,
 * so a letter has no `fileKey` and no download link of its own. It is still
 * a document used in the job, which is why it travels with the files.
 *
 * @param {any} d a lean `GeneratedDoc`
 * @param {{ id: string }} actor
 */
export function letterRow(d, actor) {
  return {
    id: String(d._id),
    templateId: d.templateId ? String(d.templateId) : "",
    checklistItemId: d.checklistItemId ? String(d.checklistItemId) : "",
    name: d.templateName,
    final: d.state === "final",
    version: d.templateVersion,
    udin: d.udin,
    byName: d.createdBy === actor.id ? "you" : "a colleague",
    issuedByName: d.issuedByName,
    issuedOn: d.issuedAt ? formatISTDate(d.issuedAt) : "",
    edited: Boolean(d.edited),
    editedByName: d.editedByName ?? "",
    sentOn: d.sentAt ? formatISTDate(d.sentAt) : "",
    sentTo: d.sentTo ?? [],
    at: d.createdAt ? new Date(d.createdAt).toISOString() : "",
  };
}

/**
 * A file's size in the words a person uses for it.
 *
 * Here beside the row it belongs to, because the drive's list and the
 * client's own list both print it and two formatters would eventually
 * disagree about where the decimal point goes.
 *
 * @param {number} [bytes]
 */
export function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
