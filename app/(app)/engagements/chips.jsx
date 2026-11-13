/**
 * The small status and ageing marks used on the engagement screen and, from
 * Step 5b, on the list, the board and the calendar.
 *
 * Colour follows spec section 15: green for filed, amber for waiting, red
 * pen for late. Every chip also says the thing in words, so nothing depends
 * on colour alone.
 */

export const STATUS_TONE = {
  Scheduled: "border-rule text-ink-muted",
  "Awaiting documents": "border-waiting bg-waiting-wash text-waiting",
  "In progress": "border-carbon bg-carbon-wash text-carbon",
  "Under review": "border-carbon bg-carbon-wash text-carbon",
  "Filed / delivered": "border-filed bg-filed-wash text-filed",
  Completed: "border-filed bg-filed-wash text-filed",
  "On hold": "border-waiting bg-waiting-wash text-waiting",
  Cancelled: "border-rule text-ink-muted line-through",
};

export function StatusChip({ status }) {
  return (
    <span
      className={`rounded-chip text-13 border px-2 py-0.5 ${
        STATUS_TONE[status] ?? "border-rule"
      }`}
    >
      {status}
    </span>
  );
}

/**
 * How a deadline reads in words, and the ink it reads in.
 *
 * Both were written inside `DueChip`. The engagement screen's head says the
 * same thing as a line of text rather than as a chip (13-11-2026), and two
 * copies of "3 days left" would be two places for the arithmetic to drift.
 */
export function dueWords(days) {
  if (days < 0)
    return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "today";
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

/** Red once it is past, amber on the last three days, otherwise quiet. */
export function dueTone(days) {
  return days < 0 ? "text-redpen" : days <= 3 ? "text-waiting" : "text-filed";
}

/** Days remaining, coloured green / amber / red (spec section 5). */
export function DueChip({ label, date, days }) {
  const tone =
    days < 0
      ? "border-redpen bg-redpen-wash text-redpen"
      : days <= 3
        ? "border-waiting bg-waiting-wash text-waiting"
        : "border-filed bg-filed-wash text-filed";

  return (
    <span className={`rounded-chip text-13 border px-2 py-0.5 ${tone}`}>
      {label} {date} · {dueWords(days)}
    </span>
  );
}

/**
 * The statutory date is still ahead, but an internal target has slipped
 * (P3-5).
 *
 * Amber and never red: red is Overdue, where acting is too late. This is the
 * list where acting still works, and the two must not look the same.
 */
export function AtRiskChip({ reason }) {
  if (!reason) return null;
  return (
    <span
      title={reason}
      className="rounded-chip border-waiting bg-waiting-wash text-waiting text-12 border px-2 py-0.5"
    >
      At risk
    </span>
  );
}

export function PriorityChip({ priority }) {
  if (priority === "Normal") return null;
  const tone = {
    Low: "border-rule text-ink-muted",
    High: "border-waiting bg-waiting-wash text-waiting",
    Urgent: "border-redpen bg-redpen-wash text-redpen",
  }[priority];
  return (
    <span className={`rounded-chip text-12 border px-2 py-0.5 ${tone}`}>
      {priority}
    </span>
  );
}
