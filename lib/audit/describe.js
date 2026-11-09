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
  /**
   * The collections the later phases added. Without a word here the log
   * said "firmsettings" and "docrequest", which is the field name leaking
   * onto a screen a partner reads (P3-22d).
   */
  FirmSettings: "firm's own record",
  DueDateRule: "due-date rule",
  DocTemplate: "document template",
  GeneratedDoc: "generated document",
  NotificationRule: "reminder rule",
  DocRequest: "document request",
  ClientGroup: "client group",
  ClientUser: "client portal account",
  ClientCredential: "portal login",
  Notice: "notice matter",
  Certificate: "certificate",
  Udin: "UDIN",
  Dsc: "DSC",
  AuditFile: "audit file",
  Sample: "sample",
  TrialBalance: "trial balance",
  Leave: "leave",
  Todo: "to-do",
  Potential: "potential client",
  Procedure: "procedure",
  Announcement: "announcement",
  SendBatch: "batch of client messages",
  PeriodReason: "reason a period was never created",
  Incident: "incident",
  HeldChange: "change a client asked for",
  SavedView: "saved view",
  FormDraft: "unfinished form",
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
  feePaise: "agreed fee",
  scope: "how it is paid for",
  scopeReason: "reason it is not separately chargeable",
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
  /* the two values are the point of a status change, and the feed left
     them out (QA 09-11-2026, #14) */
  status_change: (who, what, diff) => {
    const pair = diff?.status;
    return pair
      ? `${who} moved the ${what} from ${valueLabel(pair[0])} to ${valueLabel(pair[1])}`
      : `${who} changed the status of the ${what}`;
  },
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

/**
 * The one field of a row a person would recognise it by
 * (QA 09-11-2026, #14).
 *
 * A client's contacts and GSTINs are stored as lists of objects, and the
 * feed printed them with `join`, so an edited client read
 * `[object Object] → [object Object]`. In order of how identifying they
 * are: a GSTIN is the row, a person is their name, an address is its
 * first line.
 */
const ROW_NAMES = [
  "gstin",
  "number",
  "name",
  "title",
  "label",
  "code",
  "line1",
  "email",
  "mobile",
];

/** @param {unknown} row */
function rowLabel(row) {
  if (row === null || row === undefined) return "";
  if (typeof row !== "object") return String(row);
  for (const key of ROW_NAMES) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }
  return "one entry";
}

/** @param {unknown} value */
export function valueLabel(value) {
  if (value === null || value === undefined || value === "") return "nothing";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) {
    const named = value.map(rowLabel).filter(Boolean);
    return named.length ? named.join(", ") : "nothing";
  }
  if (typeof value === "object") return rowLabel(value);
  const text = String(value);
  // ISO timestamps read badly in a feed
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return formatISTDateTime(new Date(text));
  }
  return text;
}

/**
 * One field's change, in words (QA 09-11-2026, #14).
 *
 * A list says what joined it and what left it, because that is the thing
 * somebody reading the feed wants to know — "GSTIN registrations: added
 * 09AABCA1234C1ZD" rather than two unreadable lists side by side.
 *
 * @param {string} field
 * @param {unknown} before
 * @param {unknown} after
 */
export function changeLine(field, before, after) {
  if (Array.isArray(before) || Array.isArray(after)) {
    const was = (Array.isArray(before) ? before : []).map(rowLabel);
    const now = (Array.isArray(after) ? after : []).map(rowLabel);
    const added = now.filter((row) => row && !was.includes(row));
    const gone = was.filter((row) => row && !now.includes(row));

    const parts = [];
    if (added.length) parts.push(`added ${added.join(", ")}`);
    if (gone.length) parts.push(`removed ${gone.join(", ")}`);
    if (parts.length === 0) parts.push("details edited");
    return `${fieldLabel(field)}: ${parts.join("; ")}`;
  }

  return `${fieldLabel(field)}: ${valueLabel(before)} → ${valueLabel(after)}`;
}

/**
 * Did this field actually change anything a person can see?
 *
 * `nothing → nothing` is a field that went from null to "" or back, which
 * is a change to the database and not to the firm's records. It is noise
 * in a feed somebody is reading to find the one line that matters (#14).
 *
 * @param {[unknown, unknown]} pair
 */
function worthSaying(pair = [undefined, undefined]) {
  return changeLine("x", pair[0], pair[1]) !== "x: nothing → nothing";
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
  // a field that went from nothing to nothing is not a change (#14)
  const fields = Object.keys(diff).filter((field) => worthSaying(diff[field]));

  let headline;
  if (ACTION_SENTENCES[entry.action]) {
    headline = ACTION_SENTENCES[entry.action](who, what, diff);
  } else if (entry.action === "create") {
    headline = `${who} created the ${what}`;
  } else if (fields.length === 1) {
    const [from, to] = diff[fields[0]];
    /* "changed status from In progress to Under review" is the sentence
       spec section 11 asks for, and it only reads that way for a single
       value; a list says what joined it and what left it instead (#14) */
    headline =
      Array.isArray(from) || Array.isArray(to)
        ? `${who} changed ${changeLine(fields[0], from, to)}`
        : `${who} changed ${fieldLabel(fields[0])} from ${valueLabel(
            from,
          )} to ${valueLabel(to)}`;
  } else if (fields.length === 0) {
    /* "updated 0 fields" was what this said. An entry with nothing in it
       is usually a save that changed nothing; `empty` lets the feed leave
       it out rather than print a line that says nothing (#14). */
    headline = `${who} saved the ${what} without changing anything`;
  } else {
    headline = `${who} updated ${fields.length} fields on the ${what}`;
  }

  // on a create, listing every field set is noise; the headline says it all
  const changes =
    entry.action === "create" || fields.length <= 1
      ? []
      : fields.map((field) => changeLine(field, ...diff[field]));

  return {
    headline: entry.note ? `${headline} — ${entry.note}` : headline,
    changes,
    when: formatISTDateTime(new Date(entry.ts)),
    /** Nothing happened that is worth a line in a feed. */
    empty:
      fields.length === 0 &&
      !entry.note &&
      !ACTION_SENTENCES[entry.action] &&
      entry.action !== "create",
  };
}
