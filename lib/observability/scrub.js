// @ts-check

/**
 * What may leave the building in an error report.
 *
 * Sentry is useful because it sends us what happened when a staff member hit
 * a crash. CLAUDE.md rule 7 says a PAN, an Aadhaar number, a password or a
 * document's contents may never be logged — and an error report is a log that
 * leaves India. So every event is put through this before it is sent: the
 * request body, cookies and headers are dropped wholesale, and anything that
 * still looks like a statutory identifier is written over.
 *
 * It is deliberately blunt. A report with a redacted field in it is still
 * useful; a report carrying a client's Aadhaar number is a breach.
 */

/** Fields whose value is never worth the risk, whatever it holds. */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|otp|totp|aadhaar|\bpan\b|cookie|authorization|credential|encrypt/i;

/** Statutory identifiers, by their shape. */
const PATTERNS = [
  // GSTIN first: it contains a PAN, so the PAN rule would cut it in half
  [/\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}\b/g, "[gstin]"],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, "[pan]"],
  [/\b[2-9][0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{4}\b/g, "[aadhaar]"],
];

/** @param {string} text */
export function redactText(text) {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, String(replacement));
  }
  return out;
}

/**
 * Walk anything and redact as we go. Depth-limited, because an event is a
 * graph we did not build and this must not be the thing that crashes.
 *
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function redactDeep(value, depth = 0) {
  if (depth > 8) return "[too deep]";
  if (typeof value === "string") return redactText(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => redactDeep(item, depth + 1));
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key)
      ? "[redacted]"
      : redactDeep(inner, depth + 1);
  }
  return out;
}

/**
 * Sentry's `beforeSend`. Returning null drops the event.
 *
 * @template {Record<string, any>} T
 * @param {T} event
 * @returns {T}
 */
export function scrubEvent(event) {
  if (!event || typeof event !== "object") return event;

  if (event.request) {
    // the body of a server action can hold anything a client typed
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (typeof event.request.url === "string") {
      event.request.url = event.request.url.split("?")[0];
    }
  }

  // who hit it is useful; how to reach them is not ours to send
  if (event.user) event.user = { id: event.user.id };

  return /** @type {T} */ (redactDeep(event));
}

/**
 * Sentry's `beforeBreadcrumb`. Console breadcrumbs are dropped outright:
 * they are whatever the app printed, which is not a list we control.
 *
 * @param {{ category?: string } & Record<string, any>} crumb
 */
export function scrubBreadcrumb(crumb) {
  if (!crumb) return null;
  if (crumb.category === "console") return null;
  return /** @type {any} */ (redactDeep(crumb));
}
