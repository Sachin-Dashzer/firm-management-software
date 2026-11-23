// @ts-check

/**
 * Folders for a client's files (owner, 23-11-2026).
 *
 * A folder is a label on the document record — its `kind` — not a place in
 * the vault. Nothing is created and nothing moves: filing a file under
 * "Bank statements" writes a word on its row, so a folder can be renamed,
 * emptied or abandoned without the bytes being touched, and a wrong answer
 * costs one rename rather than a file hunt.
 *
 * A folder therefore exists only because something is in it. There is no
 * list of folders to keep in step with the files, which is the usual way a
 * folder tree starts lying — twenty empty folders and the real work in
 * whichever one somebody reached first.
 */

const UNFILED = "Unfiled";

/** The folder a document is in, trimmed; `""` means it is unfiled. */
export function folderOf(document) {
  return String(document?.folder ?? document?.kind ?? "").trim();
}

/**
 * Every folder in use, A–Z. Blanks drop out: "unfiled" is the absence of a
 * folder, not one of them.
 *
 * @param {Array<{ folder?: string, kind?: string }>} documents
 * @returns {string[]}
 */
export function folderNames(documents) {
  return [...new Set(documents.map(folderOf).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * Documents grouped by folder, A–Z, with the unfiled ones last — they are
 * the pile still to be sorted, and a pile belongs at the bottom of the
 * list, not in the middle of the alphabet.
 *
 * @param {Array<{ folder?: string, kind?: string }>} documents
 * @returns {Array<{ folder: string, docs: any[] }>}
 */
export function groupByFolder(documents) {
  /** @type {Map<string, any[]>} */
  const map = new Map();
  for (const document of documents) {
    const folder = folderOf(document);
    if (!map.has(folder)) map.set(folder, []);
    map.get(folder)?.push(document);
  }

  return [...map.entries()]
    .map(([folder, docs]) => ({ folder, docs }))
    .sort((a, b) => {
      if (!a.folder) return 1;
      if (!b.folder) return -1;
      return a.folder.localeCompare(b.folder);
    });
}

export { UNFILED };
