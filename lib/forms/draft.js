// @ts-check

/**
 * An unfinished form, kept for the person who was filling it in (P3-18b).
 *
 * Pure. What it decides is the one thing that matters about a draft: **what
 * is not in it.**
 *
 * A half-typed client record is the firm's data in a new place, and the
 * most sensitive fields on it are exactly the ones the system goes to
 * trouble over elsewhere — a PAN is encrypted on the client record, it is
 * redacted in the audit log (CLAUDE.md rule 7), and it has no business
 * sitting in plain text in a draft that nobody will remember exists. So a
 * draft keeps everything except those, and says so when it is handed back,
 * rather than quietly returning a form with the PAN box silently empty.
 *
 * One draft per person per kind, not a drafts library: the thing being
 * solved is "I was halfway through a client and the phone rang", not
 * version control.
 */

/** The kinds of form that can be kept. */
export const DRAFT_KINDS = ["client"];

/**
 * Fields a draft never holds, with the words the banner uses.
 *
 * `aadhaar` is the firm's own rule in the sharpest form: it is encrypted on
 * the record, never logged, and never left in a draft either.
 */
export const NOT_KEPT = {
  pan: "PAN",
  aadhaar: "Aadhaar",
};

/**
 * Everything worth keeping out of a submitted form, and what was left out.
 *
 * Empty values are dropped too — a draft of a blank form is noise, and a
 * restored form full of empty strings is indistinguishable from a fresh
 * one anyway.
 *
 * @param {Record<string, any>} values
 * @returns {{ payload: Record<string, any>, dropped: string[] }}
 */
export function scrubDraft(values) {
  /** @type {Record<string, any>} */
  const payload = {};
  /** @type {string[]} */
  const dropped = [];

  for (const [field, value] of Object.entries(values ?? {})) {
    if (field in NOT_KEPT) {
      if (String(value ?? "").trim()) dropped.push(NOT_KEPT[field]);
      continue;
    }
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    payload[field] = value;
  }

  return { payload, dropped };
}

/** Is there anything in it worth offering back? */
export function worthKeeping(payload) {
  return Object.keys(payload ?? {}).length > 0;
}

/**
 * How old the draft is, in the words the banner uses.
 *
 * @param {Date|string} at
 * @param {Date} [now]
 */
export function draftAge(at, now = new Date()) {
  const ms = now.getTime() - new Date(at).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
