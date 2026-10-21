// @ts-check

import NotificationRule from "../../models/NotificationRule.js";
import { connectDB } from "../db.js";
import { TEMPLATES } from "./templates.js";

/**
 * Every notification rule, with the timing spec section 12 asks for
 * (spec section 12: "each rule can be switched on or off and its timing
 * changed in settings").
 *
 * The defaults live here, in code, and the `notificationRules` collection
 * holds only the firm's changes. Two reasons: a fresh database behaves
 * exactly as the spec describes without a seed step, and a rule nobody has
 * touched cannot be half-configured.
 *
 * `when` is for the settings screen, so a partner reads "2 days before"
 * rather than a field name.
 *
 * @typedef {object} Rule
 * @property {string} key          same key as the message template
 * @property {boolean} enabled
 * @property {"immediate"|"before"|"daily"|"repeat"|"time"} when
 * @property {number[]} [daysBefore]
 * @property {number} [everyDays]
 * @property {number} [maxReminders]
 * @property {string} [atIST]
 * @property {string} to           who gets it, in words
 * @property {string} [subject]    the firm's wording, if any
 * @property {string} [body]
 */

/** @type {Record<string, Rule>} */
export const RULE_DEFAULTS = {
  // --- the five that happen the moment they happen (Step 9a) --------------
  engagementAssigned: {
    key: "engagementAssigned",
    enabled: true,
    when: "immediate",
    to: "The person it was assigned to",
  },
  engagementForReview: {
    key: "engagementForReview",
    enabled: true,
    when: "immediate",
    to: "The reviewer",
  },
  engagementReworked: {
    key: "engagementReworked",
    enabled: true,
    when: "immediate",
    to: "The person who did the work",
  },
  invoiceIssued: {
    key: "invoiceIssued",
    enabled: true,
    when: "immediate",
    to: "The client",
  },
  paymentReceived: {
    key: "paymentReceived",
    enabled: true,
    when: "immediate",
    to: "The client",
  },
  paymentReceivedInternal: {
    key: "paymentReceivedInternal",
    enabled: true,
    when: "immediate",
    to: "The client partner",
  },

  // --- the timed ones (Step 9b) -------------------------------------------
  internalDueSoon: {
    key: "internalDueSoon",
    enabled: true,
    when: "before",
    daysBefore: [2],
    to: "The person it is assigned to",
  },
  statutoryDueSoon: {
    key: "statutoryDueSoon",
    enabled: true,
    when: "before",
    daysBefore: [5, 1],
    to: "Assignee, reviewer and the client partner",
  },
  engagementOverdue: {
    key: "engagementOverdue",
    enabled: true,
    when: "daily",
    to: "Assignee and reviewer. Partners see overdue work in their digest instead of one email per job",
  },
  documentsPending: {
    key: "documentsPending",
    enabled: true,
    when: "repeat",
    everyDays: 3,
    maxReminders: 4,
    to: "The client's contact",
  },
  invoiceReminder: {
    key: "invoiceReminder",
    enabled: true,
    when: "repeat",
    daysBefore: [3],
    everyDays: 7,
    to: "The client",
  },
  dailyDigest: {
    key: "dailyDigest",
    enabled: true,
    when: "time",
    atIST: "09:00",
    to: "Every member of staff",
  },
  weeklySummary: {
    key: "weeklySummary",
    enabled: true,
    when: "time",
    atIST: "09:00",
    to: "Partners, on a Monday",
  },
  documentRequest: {
    key: "documentRequest",
    enabled: true,
    when: "immediate",
    to: "The client's contact, when the firm asks for documents",
  },

  // --- the DSC register (P2-7) --------------------------------------------
  /**
   * A certificate about to lapse. **Internal**: the firm cannot renew a
   * client's certificate for them, but being the one to notice is the
   * service — and client email is off by default anyway.
   */
  dscExpiring: {
    key: "dscExpiring",
    enabled: true,
    when: "before",
    daysBefore: [30, 7],
    to: "The client partner and the client's own CA",
  },

  // --- the client portal (P2-9b) ------------------------------------------
  /**
   * The one rule triggered from outside the firm. It cannot be switched
   * off from the settings screen in good conscience — a client's request
   * that reached nobody is worse than no portal — but it is listed like
   * every other rule so the firm can see it exists and reword it.
   */
  clientChangeRequest: {
    key: "clientChangeRequest",
    enabled: true,
    when: "event",
    to: "The client partner and the relationship manager",
  },
};

/**
 * The rules, with the firm's changes folded in.
 *
 * Cached for a minute. These are read on every notification, and they
 * change a handful of times a year — but a minute means a partner who
 * switches a rule off does not then watch it fire for an hour.
 *
 * @type {{ at: number, rules: Record<string, Rule> | null }}
 */
let cache = { at: 0, rules: null };

export const RULE_CACHE_MS = 60_000;

/** Called by the settings screen, so a save takes effect at once. */
export function clearRuleCache() {
  cache = { at: 0, rules: null };
}

/**
 * @param {{ fresh?: boolean }} [options]
 * @returns {Promise<Record<string, Rule>>}
 */
export async function loadRules(options = {}) {
  if (!options.fresh && cache.rules && Date.now() - cache.at < RULE_CACHE_MS) {
    return cache.rules;
  }

  await connectDB();
  const rows = await NotificationRule.find({}).lean();
  const rules = mergeRules(rows);

  cache = { at: Date.now(), rules };
  return rules;
}

/**
 * Fold stored rows onto the defaults. Pure, so the tests can check the
 * folding without a database.
 *
 * @param {Array<Record<string, any>>} rows
 * @returns {Record<string, Rule>}
 */
export function mergeRules(rows = []) {
  const merged = Object.fromEntries(
    Object.entries(RULE_DEFAULTS).map(([key, rule]) => [key, { ...rule }]),
  );

  for (const row of rows) {
    const base = merged[row.key];
    // a row for a rule that no longer exists in the code is ignored rather
    // than resurrected
    if (!base) continue;

    if (typeof row.enabled === "boolean") base.enabled = row.enabled;
    if (row.daysBefore?.length) base.daysBefore = row.daysBefore;
    if (row.everyDays) base.everyDays = row.everyDays;
    if (row.maxReminders) base.maxReminders = row.maxReminders;
    if (row.atIST) base.atIST = row.atIST;
    if (row.subject) base.subject = row.subject;
    if (row.body) base.body = row.body;
  }

  return merged;
}

/**
 * The wording overrides in the shape `compose()` wants.
 * @param {Record<string, Rule>} rules
 */
export function overridesFrom(rules) {
  return Object.fromEntries(
    Object.values(rules)
      .filter((rule) => rule.subject || rule.body)
      .map((rule) => [rule.key, { subject: rule.subject, body: rule.body }]),
  );
}

/** Rule plus its template, for the settings screen. */
export function rulesForDisplay(rules) {
  return Object.values(rules).map((rule) => {
    const template = TEMPLATES[rule.key];
    return {
      ...rule,
      audience: template?.audience ?? "team",
      what: template?.what ?? "",
      defaultSubject: template?.subject ?? "",
      defaultBody: template?.body ?? "",
      placeholders: [
        ...new Set(
          `${template?.subject ?? ""} ${template?.body ?? ""}`.match(
            /\{(\w+)\}/g,
          ) ?? [],
        ),
      ],
      timing: describeTiming(rule),
    };
  });
}

/** @param {Rule} rule */
export function describeTiming(rule) {
  const days = (list) =>
    list
      .map((d) => `${d} ${d === 1 ? "day" : "days"}`)
      .join(" and ")
      .concat(" before");

  switch (rule.when) {
    case "immediate":
      return "Straight away";
    case "before":
      return days(rule.daysBefore ?? []);
    case "daily":
      return "Every day until it is dealt with";
    case "repeat": {
      const parts = [];
      if (rule.daysBefore?.length) parts.push(days(rule.daysBefore));
      if (rule.key === "invoiceReminder") parts.push("on the due date");
      if (rule.everyDays) parts.push(`then every ${rule.everyDays} days`);
      if (rule.maxReminders) parts.push(`at most ${rule.maxReminders} times`);
      return parts.join(", ");
    }
    case "time":
      return rule.key === "weeklySummary"
        ? `Mondays at ${rule.atIST} IST`
        : `Daily at ${rule.atIST} IST`;
    default:
      return "";
  }
}
