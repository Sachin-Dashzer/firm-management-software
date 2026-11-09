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
  /**
   * A lead who is due a call (owner request, 04-11-2026).
   *
   * The potential register holds a follow-up date, and a date on a screen
   * is only kept by somebody who opens the screen. This is the nudge: on
   * the day, then every three days, three times in all — and then it stops
   * and leaves the row saying "nine days late" for whoever looks.
   *
   * **Internal.** It goes to the person who wrote the lead down and nobody
   * else: they are the one who knows what was said, and a lead is not a
   * client — there is no partner on it and no file to put it in. Nothing
   * is ever sent to the lead themselves by this rule.
   */
  potentialFollowUp: {
    key: "potentialFollowUp",
    enabled: true,
    when: "repeat",
    everyDays: 3,
    maxReminders: 3,
    to: "Whoever wrote the lead down",
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
  /**
   * Being named in a conversation is immediate, or it is pointless — but
   * there is no longer a conversation to be named in (QA 09-11-2026, #22).
   *
   * The owner had the comment threads taken off the job screen on
   * 03-11-2026, and this rule stayed behind: Settings → Automation offered
   * a switch for something nothing in the app can cause, and the QA run
   * reasonably asked where the comment box had gone. `retired` keeps the
   * rule and its wording — comments already written are still on the
   * record, and the panel can come back in an afternoon — while taking it
   * off the screens the firm reads.
   */
  mentioned: {
    key: "mentioned",
    enabled: true,
    when: "immediate",
    to: "Whoever was named in the comment",
    retired:
      "There is no comment box on a job any more, so nothing can trigger this.",
  },
  /**
   * The two Notify messages. They are rules like everything else, so the
   * firm can switch off staff-to-client mail from one screen — but they
   * are *sent by a person*, not by a sweep, so switching one off stops a
   * channel rather than silencing a reminder.
   */
  messageToTeam: {
    key: "messageToTeam",
    enabled: true,
    when: "immediate",
    to: "The colleagues the sender picked",
  },
  messageToClient: {
    key: "messageToClient",
    enabled: true,
    when: "immediate",
    to: "The client contacts the sender picked",
  },
  /** The two halves of a job's conversation with its client (P3-17b). */
  clientThreadMessage: {
    key: "clientThreadMessage",
    enabled: true,
    when: "immediate",
    to: "The client's contacts",
  },
  /**
   * A document the firm has issued, emailed to the client (03-11-2026).
   *
   * It needs a rule like every other client-facing message, or the firm
   * cannot switch it off: `notify` only consults `rules[template]` when
   * there is one, and the Notifications screen only lists what is here.
   * A client-facing email with no off switch is not something to ship.
   */
  clientDocument: {
    key: "clientDocument",
    enabled: true,
    when: "immediate",
    to: "The client's contacts",
  },
  clientReplied: {
    key: "clientReplied",
    enabled: true,
    when: "immediate",
    to: "Whoever is on the job, and the client partner",
  },
  announcement: {
    key: "announcement",
    enabled: true,
    when: "immediate",
    to: "Everybody the announcement is addressed to",
  },
  documentRequest: {
    key: "documentRequest",
    enabled: true,
    when: "immediate",
    to: "The client's contact, when the firm asks for documents",
  },
  /**
   * The quotation a new client gets at the end of onboarding (06-11-2026).
   *
   * Listed here because every client-facing message needs an off switch
   * and somewhere the firm can reword it — and because a firm that would
   * rather quote by hand should be able to stop this one without stopping
   * anything else onboarding does.
   */
  quotation: {
    key: "quotation",
    enabled: true,
    when: "immediate",
    to: "The new client's contacts who have an email address",
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
 * What is off until the firm says otherwise (owner's decision, 06-11-2026).
 *
 * The firm is going live with the **self-firing** rules switched off and
 * will turn them on one at a time, once each has been watched for a week:
 * the due-soon and overdue chasers, the document and invoice reminders,
 * the digests, DSC expiry, the potential follow-up. Nobody asks for any of
 * them, which is exactly why they are the ones to watch.
 *
 * Everything a **person** sets off stays on — a document somebody presses
 * send on, a message somebody writes, the bell that says work has been
 * assigned to you or that you were mentioned. Switching those off would
 * not be turning automation down, it would be breaking a button and
 * emptying the inbox, so the two are kept apart here.
 *
 * It is read off `when` rather than kept as a list of keys, so a rule
 * added later is off if it sweeps and on if a person triggers it, without
 * anybody having to remember this decision.
 *
 * This is only the **default**. A partner switching a rule on from
 * Settings → Automation writes a row, and a row wins over this, so
 * nothing here takes a control away from the firm.
 */
const SELF_FIRING = ["before", "daily", "repeat", "time"];

/** @param {Rule} rule */
export const firesItself = (rule) => SELF_FIRING.includes(rule.when);

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
 * The go-live hold is applied first and the firm's own rows after it, in
 * that order on purpose: a rule that fires by itself is off until
 * somebody turns it on, and a rule a partner has switched on from the
 * screen runs.
 *
 * @param {Array<Record<string, any>>} rows
 * @returns {Record<string, Rule>}
 */
export function mergeRules(rows = []) {
  const merged = Object.fromEntries(
    Object.entries(RULE_DEFAULTS).map(([key, rule]) => [
      key,
      { ...rule, enabled: rule.enabled && !firesItself(rule) },
    ]),
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
  // a rule nothing in the app can trigger is not a setting (#22)
  return Object.values(rules)
    .filter((rule) => !RULE_DEFAULTS[rule.key]?.retired)
    .map((rule) => {
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
      if (rule.key === "potentialFollowUp") parts.push("on the day");
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
