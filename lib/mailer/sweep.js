// @ts-check

import { daysUntil, formatISTDate, startOfISTDay } from "../dates.js";
import { formatPaise } from "../money.js";
import { dueReminder } from "../practice/dsc.js";
import { promiseHolds } from "../billing/promise.js";

/**
 * Which reminders are due today (spec section 12).
 *
 * Every function here is pure: given a record and a date, it says what
 * should go out. No database, no sending. That is deliberate — this is
 * date arithmetic about deadlines and money, the kind of thing that is
 * either right or quietly wrong for a year, so it is all testable without
 * a database or a mailbox.
 *
 * Each reminder carries a `dedupeKey`. The job stores it on the message
 * log under a unique index, which is what stops the same client being
 * chased twice for the same thing — belt as well as braces, since the
 * sweep also checks before sending.
 */

/** Statuses that mean the work has left the building: no more chasing. */
const FILED = ["Filed / delivered", "Completed", "Cancelled"];
const CLOSED = ["Completed", "Cancelled"];

/** The IST day, as a stamp for the "once a day" keys. */
const stamp = (date) => formatISTDate(date);

/**
 * @typedef {object} Reminder
 * @property {string} rule        template / rule key
 * @property {string} dedupeKey   without the recipient; the job adds that
 * @property {Array<string|null|undefined>} userIds   staff to tell
 * @property {Array<{email: string, clientName?: string}>} [emails] clients
 * @property {Record<string, any>} values
 * @property {object} about
 */

/**
 * The reminders one engagement earns today.
 *
 * @param {object} input
 * @param {Record<string, any>} input.engagement
 * @param {string} [input.clientName]
 * @param {string} [input.clientPartnerId]
 * @param {Record<string, any>} rules
 * @param {Date} now
 * @returns {Reminder[]}
 */
export function engagementReminders(
  { engagement, clientName, clientPartnerId },
  rules,
  now,
) {
  if (CLOSED.includes(engagement.status)) return [];

  const out = [];
  const base = {
    client: clientName || "the client",
    service: engagement.templateSnapshot?.name ?? "work",
    period: engagement.periodLabel || engagement.period,
    code: engagement.code ?? "",
    link: `/engagements/${engagement._id}`,
  };
  const about = {
    entityType: "Engagement",
    entityId: engagement._id,
    clientId: engagement.clientId,
    href: `/engagements/${engagement._id}`,
  };

  // --- our own target date, two days out ----------------------------------
  const internal = rules.internalDueSoon;
  if (internal?.enabled && engagement.internalDue) {
    const left = daysUntil(engagement.internalDue, now);
    if ((internal.daysBefore ?? []).includes(left)) {
      out.push({
        rule: "internalDueSoon",
        dedupeKey: `internalDueSoon:${engagement._id}:${left}`,
        userIds: [engagement.assigneeId],
        values: {
          ...base,
          days: left,
          daysWord: left === 1 ? "tomorrow" : `in ${left} days`,
          date: formatISTDate(engagement.internalDue),
        },
        about,
      });
    }
  }

  // --- the statutory date, where it has not been filed --------------------
  const statutory = rules.statutoryDueSoon;
  if (
    statutory?.enabled &&
    engagement.statutoryDue &&
    !FILED.includes(engagement.status)
  ) {
    const left = daysUntil(engagement.statutoryDue, now);
    if ((statutory.daysBefore ?? []).includes(left)) {
      out.push({
        rule: "statutoryDueSoon",
        dedupeKey: `statutoryDueSoon:${engagement._id}:${left}`,
        userIds: [
          engagement.assigneeId,
          engagement.reviewerId,
          clientPartnerId,
        ],
        values: {
          ...base,
          days: left,
          daysWord: left === 1 ? "tomorrow" : `in ${left} days`,
          date: formatISTDate(engagement.statutoryDue),
          status: engagement.status,
        },
        about,
      });
    }
  }

  // --- overdue, every day until it is dealt with --------------------------
  const overdue = rules.engagementOverdue;
  const due = engagement.statutoryDue ?? engagement.internalDue ?? null;
  if (overdue?.enabled && due && !FILED.includes(engagement.status)) {
    const left = daysUntil(due, now);
    if (left < 0) {
      out.push({
        rule: "engagementOverdue",
        // one a day, whoever runs the sweep and however often
        dedupeKey: `engagementOverdue:${engagement._id}:${stamp(now)}`,
        userIds: [engagement.assigneeId, engagement.reviewerId],
        values: {
          ...base,
          days: -left,
          daysWord: `${-left} ${-left === 1 ? "day" : "days"}`,
          date: formatISTDate(due),
          which: engagement.statutoryDue ? "statutory" : "internal",
          status: engagement.status,
        },
        about,
      });
    }
  }

  return out;
}

/**
 * Chasing a client for documents: every three days, four times at most
 * (spec section 12).
 *
 * The clock starts at the last reminder, or at the request itself, so a
 * link emailed on Monday is chased on Thursday whatever else happened.
 *
 * @param {object} input
 * @param {Record<string, any>} input.request
 * @param {string[]} input.outstanding   item names still not received
 * @param {{email: string, clientName?: string}} [input.contact]
 * @param {Record<string, any>} rules
 * @param {Date} now
 * @returns {Reminder[]}
 */
export function documentReminders(
  { request, outstanding, contact },
  rules,
  now,
) {
  const rule = rules.documentsPending;
  if (!rule?.enabled || !contact?.email) return [];
  if (request.revokedAt || request.deletedAt) return [];
  if (outstanding.length === 0) return [];

  const sent = request.reminderCount ?? 0;
  if (sent >= (rule.maxReminders ?? 4)) return [];

  const since = request.lastReminderAt ?? request.sentAt ?? request.createdAt;
  if (!since) return [];
  if (-daysUntil(since, now) < (rule.everyDays ?? 3)) return [];

  return [
    {
      rule: "documentsPending",
      dedupeKey: `documentsPending:${request._id}:${sent + 1}`,
      userIds: [],
      emails: [contact],
      values: {
        clientName: contact.clientName ?? "",
        items: outstanding.map((name) => `- ${name}`).join("\n"),
        count: outstanding.length,
        // the link is minted by the job: only the hash of the old one is kept
        link: "",
        nth: sent + 1,
      },
      about: {
        entityType: "DocRequest",
        entityId: request._id,
        clientId: request.clientId,
      },
    },
  ];
}

/**
 * The lead nobody has rung (owner request, 04-11-2026).
 *
 * The potential register keeps a follow-up date, and a date on a screen is
 * only kept by somebody who opens the screen. This is the nudge: the day
 * itself, then one every `everyDays`, `maxReminders` in all, and then it
 * stops — the row still says how late it is for whoever looks.
 *
 * **Which nudge is worked out from how late the call is, not from a
 * counter on the row.** So a sweep that did not run on the day still sends
 * that nudge the next morning, because the key for it has not been used;
 * a sweep that runs twice in a day sends nothing twice, because the key
 * collides with the unique index. Nothing to store and nothing to get out
 * of step — unlike `documentsPending` above, which has to keep a count on
 * the request because a client's chaser mints a fresh link each time.
 *
 * It goes to **whoever wrote the lead down** and nobody else: they are the
 * one who knows what was said, and a lead has no partner on it and no file
 * to put it in. Nothing here ever writes to the lead themselves.
 *
 * @param {object} input
 * @param {Record<string, any>} input.potential
 * @param {Record<string, any>} rules
 * @param {Date} now
 * @returns {Reminder[]}
 */
export function potentialReminders({ potential }, rules, now) {
  const rule = rules.potentialFollowUp;
  if (!rule?.enabled) return [];
  /* a live conversation only: a converted or dropped row keeps whatever
     date it had, and nobody rings a client back off the lead register */
  if (potential.status !== "Talking" || !potential.followUpOn) return [];
  if (!potential.createdBy) return [];

  const late = -daysUntil(potential.followUpOn, now);
  if (late < 0) return [];

  const every = Math.max(1, rule.everyDays ?? 3);
  const most = Math.max(1, rule.maxReminders ?? 3);
  const nudge = Math.min(Math.floor(late / every), most - 1);

  const reach = [potential.mobile, potential.email]
    .filter(Boolean)
    .join(" · ");

  return [
    {
      rule: "potentialFollowUp",
      dedupeKey: `potentialFollowUp:${potential._id}:${nudge}`,
      userIds: [String(potential.createdBy)],
      values: {
        /* `lead`, not `name`: `compose` merges the recipient over the
           values, so `{name}` is whoever is being written to */
        lead: potential.name,
        date: formatISTDate(potential.followUpOn),
        daysWord:
          late === 0
            ? "today"
            : late === 1
              ? "since yesterday"
              : `${late} days ago`,
        /* both always say something: `fill` leaves an empty placeholder
           standing as `{contact}` rather than printing nothing */
        contact: reach || "No number or email on the row.",
        remarks: potential.remarks || "No remarks on the row.",
        link: "/potentials?due=now",
      },
      about: {
        entityType: "Potential",
        entityId: potential._id,
        href: "/potentials?due=now",
      },
    },
  ];
}

/**
 * Invoice payment reminders: three days before, on the due date, then
 * every seven days (spec section 12).
 *
 * @param {object} input
 * @param {Record<string, any>} input.invoice
 * @param {{email: string, clientName?: string}} [input.contact]
 * @param {Record<string, any>} rules
 * @param {Date} now
 * @returns {Reminder[]}
 */
export function invoiceReminders({ invoice, contact }, rules, now) {
  const rule = rules.invoiceReminder;
  if (!rule?.enabled || !contact?.email) return [];
  if (!invoice.dueDate || !invoice.number) return [];
  if (["Draft", "Paid", "Cancelled", "Written off"].includes(invoice.status)) {
    return [];
  }

  const outstanding = Math.max(
    0,
    (invoice.totalPaise ?? 0) -
      (invoice.paidPaise ?? 0) -
      (invoice.tdsCreditedPaise ?? 0),
  );
  if (outstanding === 0) return [];

  /**
   * A client who has said when they will pay is not chased until the day
   * after they said it (P3-3). Chasing somebody who gave you a date is how
   * a payment date becomes an argument.
   *
   * It expires by itself: this reads the date rather than a flag anybody has
   * to clear, so the day after the promise passes the ordinary cadence picks
   * up again where it left off.
   */
  if (promiseHolds(invoice, now)) return [];

  const left = daysUntil(invoice.dueDate, now);
  const every = rule.everyDays ?? 7;

  let occasion = null;
  if ((rule.daysBefore ?? []).includes(left)) occasion = `in${left}`;
  else if (left === 0) occasion = "due";
  else if (left < 0 && -left % every === 0) occasion = `over${-left}`;

  if (!occasion) return [];

  return [
    {
      rule: "invoiceReminder",
      dedupeKey: `invoiceReminder:${invoice._id}:${occasion}`,
      userIds: [],
      emails: [contact],
      values: {
        clientName: contact.clientName ?? "",
        number: invoice.number,
        amount: formatPaise(outstanding),
        date: formatISTDate(invoice.dueDate),
        whenLine:
          left > 0
            ? `It falls due in ${left} ${left === 1 ? "day" : "days"}, on ${formatISTDate(invoice.dueDate)}.`
            : left === 0
              ? "It falls due today."
              : `It was due on ${formatISTDate(invoice.dueDate)}, ${-left} days ago.`,
      },
      about: {
        entityType: "Invoice",
        entityId: invoice._id,
        clientId: invoice.clientId,
      },
    },
  ];
}

/**
 * A digital signature certificate about to lapse (P2-7).
 *
 * The firm cannot renew a client's certificate for them, so this goes to the
 * firm's own people: being the one who noticed is the service. It fires on
 * the notice periods the firm sets and once more on the day itself, and then
 * stops — a daily email about a certificate that has already lapsed is noise,
 * and the register shows it in red for as long as it stays there.
 *
 * @param {object} input
 * @param {Record<string, any>} input.dsc
 * @param {string} [input.clientName]
 * @param {Array<string|null|undefined>} [input.userIds] who to tell
 * @param {Record<string, any>} rules
 * @param {Date} now
 * @returns {Reminder[]}
 */
export function dscReminders({ dsc, clientName, userIds = [] }, rules, now) {
  const rule = rules.dscExpiring;
  if (!rule?.enabled || !dsc.validTill) return [];

  const left = dueReminder(dsc, rule.daysBefore ?? [], now);
  if (left === null) return [];

  return [
    {
      rule: "dscExpiring",
      dedupeKey: `dscExpiring:${dsc._id}:${left}`,
      userIds,
      values: {
        client: clientName || "the client",
        holder: dsc.holderName,
        holderRole: dsc.holderRole || "signatory",
        certClass: dsc.certClass || "DSC",
        date: formatISTDate(dsc.validTill),
        days: left,
        whenLine:
          left === 0
            ? "It expires today."
            : `It expires in ${left} ${left === 1 ? "day" : "days"}, on ${formatISTDate(dsc.validTill)}.`,
        link: "/practice/dsc",
      },
      about: {
        entityType: "Dsc",
        entityId: dsc._id,
        clientId: dsc.clientId,
        href: "/practice/dsc",
      },
    },
  ];
}

/**
 * One reminder becomes one message per recipient, each with its own key —
 * the message log is per recipient, so the key has to be too.
 *
 * @param {Reminder} reminder
 * @param {Array<{id?: string, email?: string, name?: string}>} people
 */
export function perRecipient(reminder, people) {
  return people
    .filter((person) => person && (person.id || person.email))
    .map((person) => ({
      ...reminder,
      person,
      dedupeKey: `${reminder.dedupeKey}:${person.id ?? person.email}`,
    }));
}

/** Exported for the job's query, and so one list defines "still open". */
export const SWEEP_OPEN_STATUSES = { $nin: CLOSED };
export const NOT_FILED_STATUSES = { $nin: FILED };

/** The start of today in IST, for the queries. */
export const today = (now = new Date()) => startOfISTDay(now);
