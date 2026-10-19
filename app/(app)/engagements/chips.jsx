/**
 * The small status and ageing marks used on the engagement screen and, from
 * Step 5b, on the list, the board and the calendar.
 *
 * Colour follows spec section 15: green for filed, amber for waiting, red
 * pen for late. Every chip also says the thing in words, so nothing depends
 * on colour alone.
 */

const STATUS_TONE = {
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
      className={`rounded-ledger text-13 border px-2 py-0.5 ${
        STATUS_TONE[status] ?? "border-rule"
      }`}
    >
      {status}
    </span>
  );
}

/** Days remaining, coloured green / amber / red (spec section 5). */
export function DueChip({ label, date, days }) {
  const tone =
    days < 0
      ? "border-redpen bg-redpen-wash text-redpen"
      : days <= 3
        ? "border-waiting bg-waiting-wash text-waiting"
        : "border-filed bg-filed-wash text-filed";

  const when =
    days < 0
      ? `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`
      : days === 0
        ? "today"
        : `${days} ${days === 1 ? "day" : "days"} left`;

  return (
    <span className={`rounded-ledger text-13 border px-2 py-0.5 ${tone}`}>
      {label} {date} · {when}
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
    <span className={`rounded-ledger text-12 border px-2 py-0.5 ${tone}`}>
      {priority}
    </span>
  );
}
