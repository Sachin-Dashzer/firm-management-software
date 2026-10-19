// @ts-check

import { daysUntil, formatISTDate } from "../dates.js";
import { formatPaise } from "../money.js";

/**
 * The 9 AM digest and the Monday summary (spec section 12).
 *
 * Both are built here as plain text from plain data, so the whole of
 * "what does my email say" can be tested without a database. The job
 * fetches, this writes.
 *
 * A digest with nothing in it is not sent. An empty email every morning
 * teaches people to ignore the ones that matter.
 */

/** One line per engagement, the way a ledger would list it. */
function line(engagement, now) {
  const due = engagement.statutoryDue ?? engagement.internalDue ?? null;
  const when = due ? formatISTDate(due) : "no date";
  const late = due ? daysUntil(due, now) : null;
  const lateness =
    late === null
      ? ""
      : late < 0
        ? ` — ${-late} ${-late === 1 ? "day" : "days"} late`
        : late === 0
          ? " — today"
          : "";

  return `- ${engagement.clientName} · ${engagement.service} ${engagement.period} (${when})${lateness}`;
}

/**
 * What one person's morning email says.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.overdue    theirs, past its date
 * @param {Array<Record<string, any>>} input.dueToday   theirs, due today
 * @param {Array<Record<string, any>>} input.toReview   waiting on them
 * @param {Array<Record<string, any>>} [input.firmOverdue] partners only
 * @param {Date} now
 * @returns {{ empty: boolean, lines: string }}
 */
export function digestFor(
  { overdue = [], dueToday = [], toReview = [], firmOverdue = [] },
  now,
) {
  const blocks = [];

  if (overdue.length > 0) {
    blocks.push(
      `Overdue (${overdue.length}):\n${overdue.map((e) => line(e, now)).join("\n")}`,
    );
  }
  if (dueToday.length > 0) {
    blocks.push(
      `Due today (${dueToday.length}):\n${dueToday.map((e) => line(e, now)).join("\n")}`,
    );
  }
  if (toReview.length > 0) {
    blocks.push(
      `Waiting for your review (${toReview.length}):\n${toReview.map((e) => line(e, now)).join("\n")}`,
    );
  }
  // a partner's overdue list is the firm's, which is why they do not also
  // get one email per overdue job
  if (firmOverdue.length > 0) {
    const shown = firmOverdue.slice(0, 15);
    const more = firmOverdue.length - shown.length;
    blocks.push(
      `Overdue across the firm (${firmOverdue.length}):\n${shown
        .map(
          (e) =>
            `${line(e, now)}${e.assigneeName ? ` [${e.assigneeName}]` : ""}`,
        )
        .join("\n")}${more > 0 ? `\n…and ${more} more.` : ""}`,
    );
  }

  return { empty: blocks.length === 0, lines: blocks.join("\n\n") };
}

/**
 * The partners' Monday email.
 *
 * @param {object} counts
 * @param {number} counts.started      engagements created in the week
 * @param {number} counts.completed
 * @param {number} counts.overdue      open and past its date, now
 * @param {number} counts.awaitingReview
 * @param {number} counts.receivablePaise
 * @param {number} counts.overduePaise
 * @param {number} counts.unbilled     completed work not yet invoiced
 * @param {Array<{name: string, overdue: number}>} [counts.byPerson]
 * @returns {{ empty: boolean, lines: string }}
 */
export function weeklyFor(counts) {
  const lines = [
    "Last week",
    `- Work started: ${counts.started}`,
    `- Work completed: ${counts.completed}`,
    "",
    "Where things stand",
    `- Overdue now: ${counts.overdue}`,
    `- Awaiting review: ${counts.awaitingReview}`,
    `- Completed but not yet invoiced: ${counts.unbilled}`,
    "",
    "Money",
    `- Outstanding from clients: ${formatPaise(counts.receivablePaise)}`,
    `- Of which past due: ${formatPaise(counts.overduePaise)}`,
  ];

  if (counts.byPerson?.length) {
    lines.push("", "Overdue by person");
    for (const person of counts.byPerson) {
      lines.push(`- ${person.name}: ${person.overdue}`);
    }
  }

  return { empty: false, lines: lines.join("\n") };
}
