// @ts-check

/**
 * Turning a change into `{ field: [before, after] }` for the audit log
 * (spec section 11).
 *
 * Two rules shape this:
 *   - Never write PAN, Aadhaar, passwords, bank details or 2FA secrets into
 *     the log (CLAUDE.md rule 7). The log records *that* such a field
 *     changed, never what it changed to.
 *   - Never write bookkeeping noise. `updatedAt` changing on every save would
 *     bury the one field a partner is looking for.
 */

/** Recorded as changed, never with their values. */
const REDACTED = new Set([
  "pan",
  "aadhaar",
  "aadhar",
  "password",
  "passwordhash",
  "totpsecret",
  "bankaccount",
  "accountnumber",
  "ifsc",
  "portalpassword",
  "username",
  "tokenhash",
  "secret",
]);

/** Never worth a line in the activity feed. */
const IGNORED = new Set([
  "_id",
  "__v",
  "updatedat",
  "updatedby",
  "createdat",
  "schemaversion",
  "lasttotpcounter",
  "failedlogins",
  "lockeduntil",
]);

const REDACTED_MARK = "•••";
const MAX_VALUE_CHARS = 500;

/** @param {string} field */
function isRedacted(field) {
  const name = field.toLowerCase();
  return (
    REDACTED.has(name) ||
    name.endsWith("password") ||
    name.endsWith("secret") ||
    name.includes("credential")
  );
}

/** @param {string} field */
function isIgnored(field) {
  return IGNORED.has(field.toLowerCase());
}

/**
 * Make a value safe and small enough to store in a log entry.
 * @param {unknown} value
 */
function forLog(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length > MAX_VALUE_CHARS
      ? `[${Array.isArray(value) ? `${value.length} items` : "large value"}]`
      : JSON.parse(text);
  }
  if (typeof value === "string" && value.length > MAX_VALUE_CHARS) {
    return `${value.slice(0, MAX_VALUE_CHARS)}…`;
  }
  return value;
}

/** Deep-ish equality: good enough for Mongoose documents turned into objects. */
function same(a, b) {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return String(a?.valueOf?.() ?? a) === String(b?.valueOf?.() ?? b);
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  // null and undefined both mean "not set"
  return (a ?? null) === (b ?? null);
}

/**
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @returns {Record<string, [unknown, unknown]>} only the fields that changed
 */
export function buildDiff(before = {}, after = {}) {
  /** @type {Record<string, [unknown, unknown]>} */
  const diff = {};
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const field of fields) {
    if (isIgnored(field)) continue;
    if (same(before[field], after[field])) continue;

    diff[field] = isRedacted(field)
      ? [REDACTED_MARK, REDACTED_MARK]
      : [forLog(before[field]), forLog(after[field])];
  }
  return diff;
}

/**
 * The same thing for a brand-new record: every set field, as `[null, value]`.
 * @param {Record<string, unknown>} doc
 */
export function diffForCreate(doc = {}) {
  return buildDiff({}, doc);
}
