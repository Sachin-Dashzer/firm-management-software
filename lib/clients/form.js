// @ts-check

import { validateClient } from "./validate.js";

/**
 * Turning a client form into the change it means (spec section 3).
 *
 * This used to live inside the server action, and it had the worst kind of
 * bug in it: the edit screen has no Addresses section, so the form carried
 * no address rows, so the update set `addresses: []` and every save of an
 * edited client silently deleted their registered address. Nothing on
 * screen said so, and the activity feed read `[object Object] → [object
 * Object]` (QA 09-11-2026, #1 and #14).
 *
 * The rule that fixes it, and the reason this is a module of its own with
 * tests on it: **a form may only change what it actually carried.** Two
 * halves to that —
 *
 *  - a *section* the form does not have is left alone, while a section it
 *    has and submitted empty is cleared. Absence of rows cannot tell those
 *    apart, so a form declares its sections in a hidden `groups` field.
 *  - a *field* of a row the form does not ask about keeps its stored value.
 *    The edit screen asks a contact for a name, a designation, a mobile and
 *    an email, and knows nothing of their WhatsApp number — which replacing
 *    the array outright threw away.
 */

/** The repeated groups a client form can carry. */
export const ROW_GROUPS = ["contacts", "gstins", "addresses"];

/** The plain fields a client form can carry. */
const PLAIN_FIELDS = [
  "legalName",
  "tradeName",
  "entityType",
  "branchId",
  "pan",
  "tan",
  "cin",
  "udyam",
  "iec",
  "aadhaar",
  "status",
  "statusReason",
  "risk",
  "turnoverBand",
  "industry",
  "referralSource",
  "billingCycle",
  "creditDays",
  "invoiceEmail",
  "establishedOn",
  "proposedServices",
  "quotedAmount",
  "clientPartnerId",
  "relationshipManagerId",
  "groupId",
  "tags",
];

/**
 * Form fields arrive flat; contacts, GSTINs and addresses arrive as
 * repeated rows named `contacts.0.mobile`.
 *
 * @param {FormData} formData
 * @returns {Record<string, any>} only what the form carried
 */
export function readClientForm(formData) {
  const rows = (prefix) => {
    /** @type {Record<string, any>[]} */
    const out = [];
    for (const [key, raw] of formData.entries()) {
      const match = key.match(new RegExp(`^${prefix}\\.(\\d+)\\.(\\w+)$`));
      if (!match) continue;
      const [, index, field] = match;
      out[index] ??= {};
      out[index][field] = raw === "on" ? true : raw;
    }
    return out.filter(Boolean);
  };

  const plain = {};
  for (const key of PLAIN_FIELDS) {
    if (formData.has(key)) plain[key] = formData.get(key);
  }

  /** The entity-specific extras arrive as `profile.<key>`. */
  const profile = {};
  for (const [key, raw] of formData.entries()) {
    if (key.startsWith("profile.") && typeof raw === "string") {
      profile[key.slice("profile.".length)] = raw;
    }
  }

  /**
   * Which repeated sections this form has. The hidden `groups` field is
   * the form saying so; a prefixed key counts too, for the callers that
   * build their own FormData rather than rendering a form (the onboarding
   * wizard, the Excel import).
   */
  const declared = new Set(
    String(formData.get("groups") ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const keys = [...formData.keys()];
  /** @type {Record<string, any[]>} */
  const groups = {};
  for (const name of ROW_GROUPS) {
    if (declared.has(name) || keys.some((key) => key.startsWith(`${name}.`))) {
      groups[name] = rows(name);
    }
  }

  return {
    ...plain,
    ...(Object.keys(profile).length ? { profile } : {}),
    ...groups,
  };
}

/**
 * Put a submitted list back together with what is already stored.
 *
 * Rows are matched on the `_id` the form sends back, so a removed or
 * reordered row cannot inherit another row's hidden fields. A row with no
 * `_id` is new. Keeping the id also stops Mongoose minting a fresh one on
 * every save, which made an unchanged list look like a change.
 *
 * @param {any[]} [stored]
 * @param {Record<string, any>[]} submitted
 */
export function mergeRows(stored, submitted) {
  const byId = new Map(
    (stored ?? []).map((row) => {
      const plain =
        typeof row?.toObject === "function" ? row.toObject() : { ...row };
      return [String(plain._id ?? ""), plain];
    }),
  );

  return submitted.map((row) => ({
    ...(byId.get(String(row._id ?? "")) ?? {}),
    ...row,
  }));
}

/**
 * What an edit of an existing client means: the fields to `$set`, and
 * nothing else.
 *
 * @param {FormData} formData
 * @param {any} stored the client as it is now
 * @returns {{ errors: Record<string, string>, value: Record<string, any>, input: Record<string, any> }}
 */
export function clientUpdate(formData, stored) {
  const input = readClientForm(formData);
  const { errors, value } = validateClient(input, { partial: true });

  for (const name of ROW_GROUPS) {
    if (name in value) value[name] = mergeRows(stored?.[name], value[name]);
  }

  return { errors, value, input };
}
