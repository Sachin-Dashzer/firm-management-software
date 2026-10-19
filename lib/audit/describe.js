// @ts-check

import { formatISTDateTime } from "../dates.js";

/**
 * Turning a log entry into a sentence a partner can read without being told
 * what a field name means (spec section 11: "Riya changed status from In
 * progress to Under review").
 */

const ENTITY_WORDS = {
  Client: "client",
  Engagement: "engagement",
  Invoice: "invoice",
  Payment: "payment",
  Document: "document",
  User: "team member",
  Branch: "branch",
  ServiceTemplate: "service template",
  TimeEntry: "time entry",
  ClientAccess: "client access grant",
  ClientService: "client service subscription",
};

/** Field names as people say them. Anything missing falls back to the name. */
const FIELD_WORDS = {
  legalName: "legal name",
  tradeName: "trade name",
  entityType: "entity type",
  creditDays: "credit period",
  clientPartnerId: "client partner",
  assigneeId: "assignee",
  reviewerId: "reviewer",
  branchId: "branch",
  branchIds: "branches",
  statutoryDue: "statutory due date",
  internalDue: "internal target date",
  billingStatus: "billing status",
  passwordHash: "password",
  totpSecret: "two-factor secret",
  mustChangePassword: "forced password change",
  reportingTo: "reporting CA",
  capacityHours: "capacity",
  invoicePrefix: "invoice prefix",
  active: "active flag",
  sections: "sections opened",
  expiresAt: "expiry",
  grantedBy: "granted by",
  revokedBy: "revoked by",
  revokedAt: "revoked on",
  reason: "reason",
};

/** Sentences for the actions that are not simple field edits. */
const ACTION_SENTENCES = {
  delete: (who, what) => `${who} deleted the ${what}`,
  restore: (who, what) => `${who} restored the ${what}`,
  status_change: (who, what) => `${who} changed the status of the ${what}`,
  reassign: (who, what) => `${who} reassigned the ${what}`,
  document_upload: (who, what) => `${who} uploaded a ${what}`,
  document_view: (who, what) => `${who} viewed a ${what}`,
  document_download: (who, what) => `${who} downloaded a ${what}`,
  document_delete: (who, what) => `${who} deleted a ${what}`,
  credential_reveal: (who) => `${who} revealed a stored portal password`,
  invoice_issue: (who, what) => `${who} issued the ${what}`,
  invoice_cancel: (who, what) => `${who} cancelled the ${what}`,
  payment_entry: (who) => `${who} recorded a payment`,
  write_off: (who, what) => `${who} wrote off the ${what}`,
  login: (who) => `${who} signed in`,
  login_failed: (who) => `${who} failed to sign in`,
  logout: (who) => `${who} signed out`,
  password_reset: (who, what) => `${who} reset the password of the ${what}`,
  two_factor_reset: (who, what) =>
    `${who} reset two-factor authentication for the ${what}`,
  role_change: (who, what) => `${who} changed the role of the ${what}`,
  export: (who, what) => `${who} exported ${what} data`,
};

/** @param {string} field */
export function fieldLabel(field) {
  if (FIELD_WORDS[field]) return FIELD_WORDS[field];
  // camelCase and dotted sub-paths into words: contacts.0.mobile -> contacts mobile
  return field
    .replace(/\.\d+\./g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/Id$/, "")
    .toLowerCase();
}

/** @param {unknown} value */
export function valueLabel(value) {
  if (value === null || value === undefined || value === "") return "nothing";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "nothing";
  if (typeof value === "object") return "a new value";
  const text = String(value);
  // ISO timestamps read badly in a feed
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return formatISTDateTime(new Date(text));
  }
  return text;
}

/**
 * One entry as a sentence, plus the per-field lines beneath it.
 *
 * @param {object} entry an auditLogs document
 * @returns {{ headline: string, changes: string[], when: string }}
 */
export function describeEntry(entry) {
  const who = entry.userName || "Someone";
  const what = ENTITY_WORDS[entry.entityType] ?? entry.entityType.toLowerCase();
  const diff = entry.diff ?? {};
  const fields = Object.keys(diff);

  let headline;
  if (ACTION_SENTENCES[entry.action]) {
    headline = ACTION_SENTENCES[entry.action](who, what);
  } else if (entry.action === "create") {
    headline = `${who} created the ${what}`;
  } else if (fields.length === 1) {
    const [from, to] = diff[fields[0]];
    headline = `${who} changed ${fieldLabel(fields[0])} from ${valueLabel(
      from,
    )} to ${valueLabel(to)}`;
  } else {
    headline = `${who} updated ${fields.length} fields on the ${what}`;
  }

  // on a create, listing every field set is noise; the headline says it all
  const changes =
    entry.action === "create" || fields.length <= 1
      ? []
      : fields.map(
          (f) =>
            `${fieldLabel(f)}: ${valueLabel(diff[f][0])} → ${valueLabel(diff[f][1])}`,
        );

  return {
    headline: entry.note ? `${headline} — ${entry.note}` : headline,
    changes,
    when: formatISTDateTime(new Date(entry.ts)),
  };
}
