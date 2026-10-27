// @ts-check

/**
 * The inbox: one list of everything the system has told somebody, and the
 * two rules that keep it readable (P3-17a).
 *
 * Pure. The queries live in the page; what is here is which group a
 * notification belongs to and whether it is showing today.
 *
 * **Snooze rather than dismiss.** There is no "clear" that loses the thing
 * — the same stance as Issues (P3-6), for a different reason: a
 * notification is a nudge about something real, and a nudge you can throw
 * away is a nudge people throw away. Snoozing says *not now* and names the
 * morning it comes back.
 */

/** The groups, in the order the filter shows them. */
export const INBOX_KINDS = [
  "Mentions",
  "Announcements",
  "My work",
  "Review",
  "Clients",
  "Money",
  "Registers",
  "Digests",
];

/**
 * Which group a message belongs to, by its template key.
 *
 * Unknown keys land in "My work" rather than an "Other" bucket nobody
 * filters by: a message with no home should still be in front of the
 * person it was sent to.
 *
 * @param {string} type the template key the notification was written with
 */
export function kindOf(type) {
  switch (type) {
    case "mentioned":
      return "Mentions";
    case "announcement":
      return "Announcements";
    case "clientReplied":
      return "Clients";
    case "engagementForReview":
    case "engagementReworked":
      return "Review";
    case "invoiceIssued":
    case "invoiceReminder":
    case "paymentReceived":
    case "paymentReceivedInternal":
      return "Money";
    case "dscExpiring":
      return "Registers";
    case "dailyDigest":
    case "weeklySummary":
      return "Digests";
    case "checklistAnswer":
    case "checklistReplacement":
    case "documentRequest":
    case "documentsPending":
    case "clientChangeRequest":
    case "messageToClient":
      return "Clients";
    default:
      return "My work";
  }
}

/**
 * Is this row in the list right now?
 *
 * @param {{snoozedUntil?: Date|string|null}} row
 * @param {Date} [now]
 */
export function showing(row, now = new Date()) {
  if (!row.snoozedUntil) return true;
  return new Date(row.snoozedUntil).getTime() <= now.getTime();
}

/** The snooze choices, in hours, as the buttons offer them. */
export const SNOOZE_CHOICES = [
  { key: "3h", label: "3 hours", hours: 3 },
  { key: "tomorrow", label: "Tomorrow", hours: 24 },
  { key: "week", label: "Next week", hours: 24 * 7 },
];

/**
 * @param {string} key
 * @param {Date} [now]
 * @returns {Date|null} null when the key is not one of the three
 */
export function snoozeUntil(key, now = new Date()) {
  const choice = SNOOZE_CHOICES.find((row) => row.key === key);
  if (!choice) return null;
  return new Date(now.getTime() + choice.hours * 3_600_000);
}

/**
 * Who a comment names, matched against the team.
 *
 * Lifted out of `addEngagementComment`, where it had never been tested and
 * was looser than it looked: it matched on `startsWith`, so `@pri` reached
 * Priya and `@a` reached everybody whose name began with an A. A mention
 * now has to be the person's first name or their whole name without
 * spaces, and **an ambiguous one reaches everybody it fits** — two Priyas
 * means both are told, which is right: the alternative is silently picking
 * one and leaving the other out of a conversation they were named in.
 *
 * @param {string} body
 * @param {Array<{_id?: any, id?: any, name: string}>} people
 * @returns {Array<{_id?: any, id?: any, name: string}>}
 */
export function mentionsIn(body, people) {
  const handles = new Set(
    [...String(body ?? "").matchAll(/@([\p{L}][\p{L}.]*)/gu)].map((match) =>
      match[1].toLowerCase().replace(/\.$/, ""),
    ),
  );
  if (handles.size === 0) return [];

  return people.filter((person) => {
    const full = person.name.toLowerCase().replace(/\s+/g, "");
    const first = person.name.toLowerCase().split(/\s+/)[0];
    return handles.has(full) || handles.has(first);
  });
}
