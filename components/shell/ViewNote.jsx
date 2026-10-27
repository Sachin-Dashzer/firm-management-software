import { FIRM_WIDE_NOTE } from "@/lib/access/view";

/**
 * Two one-line notes that stop the branch selector from lying (P3-7).
 *
 * `FirmWide` goes on screens the view does not apply to — the service
 * catalog, the firm's settings, the registers. Without it a reader who
 * thinks a filter is on reads a complete list as a partial one, and the
 * selector gets blamed for both.
 *
 * `OutsideView` goes on a record opened from outside the current view, by a
 * link or a search. Silently showing a Ludhiana job while the top bar says
 * Noida is how somebody comes to distrust the selector altogether.
 */

export function FirmWide() {
  return <p className="text-12 text-ink-muted">{FIRM_WIDE_NOTE}</p>;
}

/** @param {{ note: string|null }} props */
export function OutsideView({ note }) {
  if (!note) return null;
  return (
    <p className="rounded-ledger border-rule bg-surface text-13 text-ink-muted border px-3 py-2">
      {note}
    </p>
  );
}
