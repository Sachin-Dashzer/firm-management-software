// @ts-check

import { MAX_FOLDER_DEPTH, canHoldFolders } from "./paths.js";

/**
 * What a folder may be called, and where it may go (P3-48c).
 *
 * Pure, and separate from the actions that enforce it, for the usual two
 * reasons: it can be tested without a database, and the screen can ask the
 * same question the server will answer, so a control is never offered that
 * the server is about to refuse.
 */

/** Characters a file system, a URL or a person would trip over. */
const FORBIDDEN = /[/\\:*?"<>|]/;

/**
 * Names the drive uses for its own levels, which a person may not take.
 *
 * Two "Clients" folders at Home, one of them hand-made, is a drive nobody
 * can navigate — and the hand-made one would be the emptier of the two.
 */
const RESERVED = {
  root: ["my docs", "hq", "clients", "services"],
  client: ["permanent file", "services"],
};

export { MAX_FOLDER_DEPTH };

/**
 * Is this a name a folder may have?
 *
 * @param {string} name
 * @param {{ parentType?: string, siblings?: string[] }} [where]
 *   `siblings` are the live names already in that place, lower-cased by
 *   this function, not by the caller.
 * @returns {{ ok: true, name: string }|{ ok: false, error: string, suggest?: string }}
 */
export function checkName(name, { parentType = "folder", siblings = [] } = {}) {
  const trimmed = String(name ?? "").trim();

  if (!trimmed) return { ok: false, error: "A folder needs a name." };
  if (trimmed.length > 80) {
    return { ok: false, error: "A folder's name stops at 80 characters." };
  }
  if (FORBIDDEN.test(trimmed)) {
    return {
      ok: false,
      error: 'A folder name cannot contain / \\ : * ? " < > or |.',
    };
  }
  if (trimmed === "." || trimmed === "..") {
    return { ok: false, error: "That is not a name." };
  }
  if (trimmed.startsWith(".") || trimmed.endsWith(".")) {
    return {
      ok: false,
      error: "A folder name cannot start or end with a dot.",
    };
  }

  const key = trimmed.toLowerCase();
  if ((RESERVED[parentType] ?? []).includes(key)) {
    return {
      ok: false,
      error: `"${trimmed}" is the drive's own folder here. Choose another name.`,
    };
  }

  const taken = siblings.map((s) => String(s).trim().toLowerCase());
  if (taken.includes(key)) {
    return {
      ok: false,
      error: `"${trimmed}" is already here.`,
      suggest: suggestName(trimmed, siblings),
    };
  }

  return { ok: true, name: trimmed };
}

/**
 * The next free name beside one that is taken: "Bank statements (2)".
 *
 * @param {string} name
 * @param {string[]} siblings
 */
export function suggestName(name, siblings = []) {
  const base = String(name ?? "").trim();
  const taken = new Set(
    siblings.map((s) => String(s).trim().toLowerCase()).filter(Boolean),
  );
  if (!taken.has(base.toLowerCase())) return base;

  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})`;
}

/**
 * May a folder be made at all at this level, and would it be too deep?
 *
 * @param {{ type: string }} node the level it would be made in
 * @param {number} [depth] how many custom folders are already above it
 */
export function checkPlace(node, depth = 0) {
  if (!canHoldFolders(node?.type)) {
    return {
      ok: false,
      error:
        "Folders here come from the records. Add a client or a job instead.",
    };
  }
  if (depth >= MAX_FOLDER_DEPTH) {
    return {
      ok: false,
      error: `Folders stop at ${MAX_FOLDER_DEPTH} deep. Put it higher up.`,
    };
  }
  return { ok: true };
}

/**
 * May this folder move to that place?
 *
 * **A folder never changes whose papers it holds.** Not between zones, not
 * from one client to another, and not from somebody's own files into a
 * client's. Allowing it would mean a folder of working papers quietly
 * becoming a different client's record — and the files inside it carry that
 * client's id, so the move would either be a lie or a mass re-filing
 * nobody asked for. Moving *within* a client is free.
 *
 * @param {{ _id?: any, zone?: string, clientId?: any, ancestors?: any[] }} folder
 * @param {{ node: { type: string }, context: { zone?: string, clientId?: any, folderIds?: string[] } }} to
 * @param {number} [subtreeDepth] how deep the folder's own subtree goes
 */
export function checkMove(folder, to, subtreeDepth = 0) {
  const place = checkPlace(to.node, (to.context.folderIds ?? []).length);
  if (!place.ok) return place;

  if (String(folder.zone) !== String(to.context.zone)) {
    return {
      ok: false,
      error:
        "A folder cannot move between My Docs, HQ and a client. Whose papers it holds would change.",
    };
  }

  if (String(folder.clientId ?? "") !== String(to.context.clientId ?? "")) {
    return {
      ok: false,
      error: "A folder cannot move to another client.",
    };
  }

  const id = String(folder._id ?? "");
  const into = (to.context.folderIds ?? []).map(String);
  if (into.includes(id)) {
    return { ok: false, error: "A folder cannot be moved inside itself." };
  }

  if (into.length + 1 + subtreeDepth > MAX_FOLDER_DEPTH) {
    return {
      ok: false,
      error: `That would put folders more than ${MAX_FOLDER_DEPTH} deep.`,
    };
  }

  return { ok: true };
}

/**
 * The financial years a "+ FY Year" button may offer: this one, the six
 * before it, and the next.
 *
 * The next one is there because a firm collects papers for a year before it
 * ends; seven back because that is the retention period the vault keeps to.
 *
 * @param {string} currentFy e.g. "FY2026-27"
 * @param {string[]} [taken] years already showing, from jobs or folders
 */
export function fyChoices(currentFy, taken = []) {
  const match = /^FY(\d{4})-(\d{2})$/.exec(String(currentFy ?? ""));
  if (!match) return [];
  const start = Number(match[1]);
  const already = new Set(taken.map(String));

  const years = [];
  for (let year = start + 1; year >= start - 6; year -= 1) {
    const fy = `FY${year}-${String((year + 1) % 100).padStart(2, "0")}`;
    if (!already.has(fy)) years.push(fy);
  }
  return years;
}
