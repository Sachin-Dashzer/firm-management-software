// @ts-check

import { istParts, istHour, istWeekday, startOfISTDay } from "../dates.js";

/**
 * What stands between an automated rule and the firm's clients (P3-10).
 *
 * `lib/mailer/guard.js` already answers "may this message leave the
 * building at all" — a blunt switch, on or off. This answers a different
 * question: a rule has decided to write to nine clients this morning;
 * should that happen now, wait for a partner, or wait until business hours.
 *
 * The risk is specific and it is not a bug the firm can quietly fix. A
 * chaser that goes out at 2am, or goes to a client who sent the documents
 * yesterday, or goes for the fifth time this month, is a letter the client
 * has already read. So:
 *
 *  - an untrusted rule **queues** for a partner, with the first real message
 *    as the preview and the whole recipient list visible
 *  - a **trusted** rule sends without the queue — but a send above 25
 *    clients queues anyway, trusted or not, because that is the size at
 *    which a mistake stops being retrievable
 *  - **quiet hours** (21:00–08:00 IST, and Sundays) defer rather than queue:
 *    nobody needs to approve what only needs to wait
 *  - at most **four** automated messages to one client in a calendar month
 *  - a **firm-wide pause** stops everything automated
 *
 * Everything here is pure: given a batch and a clock, it says what should
 * happen. The job does the fetching, and the screen shows the queue.
 */

/** Above this, a partner looks at it whatever the rule's standing. */
export const ALWAYS_APPROVE_OVER = 25;

/** How many automated messages one client may get in a calendar month. */
export const MONTHLY_CAP = 4;

export const QUIET_FROM_HOUR = 21;
export const QUIET_UNTIL_HOUR = 8;

/**
 * Rules that may wake somebody at night, because the deadline will not
 * wait for office hours. Statutory notices only; a chaser never qualifies.
 */
const URGENT_RULES = ["noticeDeadline"];

/** @typedef {"send"|"queue"|"defer"|"paused"} Verdict */

/**
 * Is it a time the firm writes to clients?
 *
 * Sundays are out as well as nights. A reminder that arrives on a Sunday
 * evening is read on Monday anyway, and reads as though nobody is minding
 * the shop.
 *
 * @param {Date} now
 */
export function inQuietHours(now) {
  if (istWeekday(now) === 0) return true;
  const hour = istHour(now);
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

/** The first moment after the quiet period that this batch may go. */
export function quietUntil(now) {
  const hour = istHour(now);
  const day = startOfISTDay(now);
  // tonight's batch goes tomorrow morning; this morning's goes at eight
  const base =
    istWeekday(now) === 0 || hour >= QUIET_FROM_HOUR
      ? new Date(day.getTime() + 86_400_000)
      : day;
  const next = new Date(base.getTime() + QUIET_UNTIL_HOUR * 3_600_000);
  // and if that lands on a Sunday too, the Monday
  return istWeekday(next) === 0 ? new Date(next.getTime() + 86_400_000) : next;
}

/**
 * The calendar-month key a cap is counted against, in IST.
 * @param {Date} date
 */
export function capMonth(date) {
  const { year, month } = istParts(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * What should happen to one batch.
 *
 * @param {object} input
 * @param {string} input.rule
 * @param {number} input.recipients  how many clients it would write to
 * @param {boolean} [input.trusted]  a partner has marked this rule trusted
 * @param {boolean} [input.paused]   the firm-wide switch
 * @param {Date} input.now
 * @returns {{ verdict: Verdict, why: string, until?: Date }}
 */
export function decideBatch({
  rule,
  recipients,
  trusted = false,
  paused = false,
  now,
}) {
  if (recipients === 0) {
    return { verdict: "send", why: "Nothing to send." };
  }

  if (paused) {
    return {
      verdict: "paused",
      why: "Automatic messages to clients are paused for the whole firm.",
    };
  }

  const urgent = URGENT_RULES.includes(rule);

  if (!urgent && inQuietHours(now)) {
    return {
      verdict: "defer",
      why: "Outside the hours the firm writes to clients (21:00–08:00, and Sundays).",
      until: quietUntil(now),
    };
  }

  if (recipients > ALWAYS_APPROVE_OVER) {
    return {
      verdict: "queue",
      why: `${recipients} clients is above the ${ALWAYS_APPROVE_OVER} a rule may send to on its own, so a partner approves it whether the rule is trusted or not.`,
    };
  }

  if (trusted) {
    return {
      verdict: "send",
      why: "A partner has marked this rule trusted, and it is within the limits.",
    };
  }

  return {
    verdict: "queue",
    why: "This rule is not trusted yet, so a partner sees it before it goes.",
  };
}

/**
 * Drop the recipients a cap has already used up.
 *
 * Counted per client per calendar month, not per rule: four letters from
 * four different rules is still four letters, and the client counts them,
 * not the rules.
 *
 * @param {Array<{clientId?: string|null}>} items
 * @param {Map<string, number>} counts  clientId → messages already this month
 * @returns {{ keep: any[], capped: any[] }}
 */
export function applyMonthlyCap(items, counts) {
  const keep = [];
  const capped = [];
  // a running tally, so one batch cannot spend the allowance twice
  const spent = new Map();

  for (const item of items) {
    const key = String(item.clientId ?? "");
    if (!key) {
      keep.push(item);
      continue;
    }
    const used = (counts.get(key) ?? 0) + (spent.get(key) ?? 0);
    if (used >= MONTHLY_CAP) {
      capped.push(item);
      continue;
    }
    spent.set(key, (spent.get(key) ?? 0) + 1);
    keep.push(item);
  }

  return { keep, capped };
}

/**
 * Is each message in an approved batch still wanted, at the moment it would
 * go out?
 *
 * Two different answers, and the difference matters:
 *
 *  - the reason has **gone** — the documents arrived and were accepted, the
 *    invoice was paid — so the message cancels itself. Chasing somebody for
 *    something they have already done is the single worst thing an
 *    automated system does to a relationship
 *  - the reason is **unresolved but in hand** — a document arrived and
 *    nobody has checked it yet. That *holds* the message rather than
 *    cancelling it: if the firm turns out to have been sent the wrong month,
 *    the chase is still owed
 *
 * @param {object} item            one recipient's message
 * @param {object|null} context    the live record behind it
 * @returns {{ state: "send"|"cancel"|"hold", why: string }}
 */
export function stillWanted(item, context) {
  if (!context) {
    return { state: "cancel", why: "What this was about no longer exists." };
  }

  if (item.rule === "documentsPending") {
    const items = context.checklist ?? [];
    const mine = item.about?.itemIds?.length
      ? items.filter((row) => item.about.itemIds.includes(String(row._id)))
      : items.filter((row) => row.side === "client" && row.mandatory);

    const outstanding = mine.filter(
      (row) => !["Accepted", "Verified", "Not required"].includes(row.status),
    );
    if (outstanding.length === 0) {
      return {
        state: "cancel",
        why: "The documents arrived and were accepted, so the chaser is not sent.",
      };
    }

    const unchecked = outstanding.filter((row) =>
      ["Received", "Format checked"].includes(row.status),
    );
    if (unchecked.length === outstanding.length) {
      return {
        state: "hold",
        why: "Something arrived and nobody has checked it yet. Held, not cancelled: if it is the wrong month the chase is still owed.",
      };
    }

    return { state: "send", why: "" };
  }

  if (item.rule === "invoiceReminder") {
    const outstanding =
      (context.totalPaise ?? 0) -
      (context.paidPaise ?? 0) -
      (context.tdsCreditedPaise ?? 0);
    if (outstanding <= 0) {
      return { state: "cancel", why: "The invoice was paid." };
    }
    if (context.status === "Cancelled") {
      return { state: "cancel", why: "The invoice was cancelled." };
    }
    return { state: "send", why: "" };
  }

  return { state: "send", why: "" };
}
