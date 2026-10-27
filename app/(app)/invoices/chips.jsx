/** Invoice statuses, coloured as spec section 15 asks. */
const TONE = {
  Draft: "border-rule text-ink-muted",
  Sent: "border-carbon bg-carbon-wash text-carbon",
  "Partially paid": "border-waiting bg-waiting-wash text-waiting",
  Paid: "border-filed bg-filed-wash text-filed",
  Overdue: "border-redpen bg-redpen-wash text-redpen",
  Disputed: "border-waiting bg-waiting-wash text-waiting",
  "Written off": "border-rule text-ink-muted",
  Cancelled: "border-rule text-ink-muted line-through",
};

export function InvoiceStatusChip({ status }) {
  return (
    <span
      className={`rounded-chip text-13 border px-2 py-0.5 ${TONE[status] ?? "border-rule"}`}
    >
      {status}
    </span>
  );
}
