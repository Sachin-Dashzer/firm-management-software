"use client";

/**
 * "Are you sure?" as an inline panel rather than a modal.
 *
 * Asked for by the QA run of 09-11-2026 (#23): the Issue button on an
 * invoice took the next number in a statutory series on a single click,
 * and that cannot be undone — only cancelled with a credit note. A thing
 * that cannot be undone should be asked about once.
 *
 * Inline, not a dialog, for two reasons. It matches the way this app
 * already asks for a reason before a credit note or a write-off, so the
 * screen does not acquire a second idiom; and an inline panel needs no
 * focus trap, no portal and no scroll lock to be reachable by keyboard.
 *
 * @param {object} props
 * @param {string} props.question   the decision, as a question
 * @param {string} [props.detail]   what it commits them to
 * @param {string} props.confirmLabel
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {boolean} [props.pending]
 */
export default function Confirm({
  question,
  detail,
  confirmLabel,
  onConfirm,
  onCancel,
  pending = false,
}) {
  return (
    <div
      role="group"
      aria-label={question}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
      className="rounded-ledger border-carbon bg-carbon-wash flex flex-col gap-2 border p-3"
    >
      <p className="text-14 font-medium">{question}</p>
      {detail && <p className="text-13 text-ink-muted">{detail}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          autoFocus
          disabled={pending}
          onClick={onConfirm}
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
        >
          {pending ? "Working…" : confirmLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-control border-rule bg-surface text-14 h-9 border px-3 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
