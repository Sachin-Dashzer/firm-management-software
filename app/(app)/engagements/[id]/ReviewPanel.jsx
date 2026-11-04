"use client";

import AuditTick from "@/components/ledger/AuditTick";
import { setReviewItem } from "../actions";

/**
 * The reviewer's four points, which are now a step rather than a panel
 * (owner request, 03-11-2026).
 *
 * This used to sit at the bottom of the engagement screen, below the
 * filing box, where it was the last thing anybody scrolled to and the
 * first thing a busy week skipped. It is the second-to-last **step** now,
 * so a job cannot read as finished while it is untouched, and it is drawn
 * inside the open step's card: the person on this step sees these points
 * and nothing else.
 *
 * `isReviewer` is decided on the server by `checkReviewer`, which is where
 * maker-and-checker lives (CLAUDE.md rule 4). The preparer gets the same
 * list, readable and not tickable, because knowing what is being checked
 * is part of being checked — and `setReviewItem` refuses them anyway.
 */
export default function ReviewPanel({
  engagement,
  isReviewer,
  pending,
  run,
  /** Heading and lead-in are dropped when the step's card already says it. */
  bare = false,
}) {
  const items = engagement.reviewChecklist ?? [];
  const left = items.filter((item) => !item.checked).length;

  return (
    <div className="flex flex-col gap-3">
      {!bare && (
        <>
          <h2 className="font-display text-15 font-semibold">Review</h2>
          <p className="text-13 text-ink-muted">
            {isReviewer
              ? "Tick each point before completing. The person who did the work cannot sign it off."
              : `${engagement.reviewerName} ticks these.`}
          </p>
        </>
      )}

      {items.length === 0 ? (
        <p className="text-13 text-ink-muted">
          This job was created before the review list existed, so it has no
          points to tick.
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-rule flex items-center gap-2 border-b py-2 last:border-0"
            >
              {/* the real checkbox stays, and keeps the keyboard and the
                  screen reader; the tick is drawn beside it in ink */}
              <input
                type="checkbox"
                id={`review-${item.id}`}
                checked={item.checked}
                disabled={!isReviewer || pending}
                onChange={(e) =>
                  run(() =>
                    setReviewItem(engagement.id, item.id, e.target.checked),
                  )
                }
                className="peer sr-only"
              />
              <label
                htmlFor={`review-${item.id}`}
                className="text-14 peer-focus-visible:outline-brass flex items-center gap-2 peer-focus-visible:rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:opacity-70"
              >
                <AuditTick checked={item.checked} tone="redpen" />
                {item.name}
              </label>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <p className="text-12 text-ink-muted">
          <span className="num">{items.length - left}</span> of{" "}
          <span className="num">{items.length}</span> ticked
          {left === 0 && " — this step is closed."}
        </p>
      )}
    </div>
  );
}
