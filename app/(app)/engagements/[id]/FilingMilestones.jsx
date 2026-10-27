"use client";

import { useState, useTransition } from "react";
import { recordMilestoneFiling, correctMilestoneFiling } from "../actions";

/**
 * One row per statutory filing (P3-1).
 *
 * October GST owes GSTR-1 on the 11th and GSTR-3B on the 20th, and they are
 * recorded separately because they happen separately. The panel this
 * replaced had one acknowledgement box for the pair, so a month where one
 * return went in on time and the other nine days late could only be written
 * down as one or the other.
 */

const TONE = {
  filed: "border-filed/40 bg-filed/5",
  overdue: "border-red-pen/40 bg-red-pen/5",
  open: "border-rule bg-paper",
  undated: "border-rule bg-paper",
};

function StateLabel({ milestone }) {
  if (milestone.state === "filed") {
    return milestone.lateBy > 0 ? (
      <span className="text-12 text-red-pen font-medium">
        {milestone.lateBy} day{milestone.lateBy === 1 ? "" : "s"} late
      </span>
    ) : (
      <span className="text-12 text-filed font-medium">On time</span>
    );
  }
  if (milestone.state === "overdue") {
    return (
      <span className="text-12 text-red-pen font-medium">
        Overdue by {Math.abs(milestone.dueDateDays)} day
        {Math.abs(milestone.dueDateDays) === 1 ? "" : "s"}
      </span>
    );
  }
  if (milestone.state === "undated") {
    return <span className="text-12 text-ink-muted">No date yet</span>;
  }
  return (
    <span className="text-12 text-ink-muted">
      Due in {milestone.dueDateDays} day
      {milestone.dueDateDays === 1 ? "" : "s"}
    </span>
  );
}

/**
 * @param {object} props
 * @param {string|null} [props.blocked] why nothing can be filed yet (P3-5):
 *   the review or the client's confirmation is still outstanding. Said once
 *   above the list, and the forms are not drawn — an offer that would be
 *   refused is worse than no offer.
 */
export default function FilingMilestones({
  engagement,
  locked,
  blocked = null,
  setMessage,
}) {
  const [pending, startTransition] = useTransition();
  const [correcting, setCorrecting] = useState(null);

  const milestones = engagement.milestones ?? [];

  if (!milestones.length) {
    return (
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
        <h2 className="font-display text-15 font-semibold">Filings</h2>
        <p className="text-13 text-ink-muted">
          This work has no filings listed. The system will not invent a
          statutory date, so until a partner confirms the due-date rule for this
          service in Settings &rarr; Due dates, there is nothing here to record
          against.
        </p>
      </section>
    );
  }

  return (
    <section
      id="filings"
      className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-15 font-semibold">Filings</h2>
        {engagement.filingProgress === "part" && (
          <span className="text-12 text-waiting font-medium">
            Part filed — {milestones.filter((m) => m.filedOn).length} of{" "}
            {milestones.length}
          </span>
        )}
      </div>

      {blocked && !locked && (
        <p className="rounded-ledger border-waiting/40 bg-waiting/5 text-13 border px-3 py-2">
          {blocked} Nothing can be recorded as filed until then — the review
          comes before the filing, not after it.
        </p>
      )}

      {engagement.proofPending && (
        <p className="rounded-ledger border-waiting/40 bg-waiting/5 text-13 border px-3 py-2">
          Filed, but the acknowledgement is not attached yet. The client sees
          this as <strong>Filed &mdash; proof pending</strong> until it is.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {milestones.map((m) => (
          <li
            key={m.id}
            className={`rounded-ledger flex flex-col gap-2 border p-3 ${TONE[m.state]}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-14 font-medium">{m.name}</span>
              <StateLabel milestone={m} />
            </div>

            <p className="text-12 text-ink-muted">
              {m.dueDate ? `Due ${m.dueDate}` : "Due date not known"}
              {m.filedOn && ` · filed ${m.filedOn}`}
              {m.ackNo && ` · ${m.ackNo}`}
              {m.filedByName && ` · recorded by ${m.filedByName}`}
            </p>

            {/* record it ------------------------------------------------- */}
            {!m.filedOn && !locked && !blocked && (
              <form
                action={(formData) =>
                  startTransition(async () =>
                    setMessage(
                      await recordMilestoneFiling(engagement.id, formData),
                    ),
                  )
                }
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="milestoneId" value={m.id} />
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    Acknowledgement number
                  </span>
                  <input
                    name="ackNo"
                    required
                    placeholder="ARN, token or SRN"
                    className="rounded-control border-rule bg-paper text-14 h-9 min-w-40 border px-2 font-mono"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    Filed on
                  </span>
                  <input
                    type="date"
                    name="filedOn"
                    required
                    max={engagement.todayInput}
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  />
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-50"
                >
                  Record {m.name}
                </button>
              </form>
            )}

            {/* correct it ------------------------------------------------ */}
            {m.filedOn && !locked && correcting !== m.id && (
              <button
                type="button"
                onClick={() => setCorrecting(m.id)}
                className="text-12 text-carbon self-start underline"
              >
                Correct this record
              </button>
            )}

            {m.filedOn && !locked && correcting === m.id && (
              <form
                action={(formData) =>
                  startTransition(async () => {
                    setMessage(
                      await correctMilestoneFiling(engagement.id, formData),
                    );
                    setCorrecting(null);
                  })
                }
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="milestoneId" value={m.id} />
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    Why is this being corrected?
                  </span>
                  <input
                    name="reason"
                    required
                    minLength={5}
                    placeholder="e.g. the ARN belonged to September"
                    className="rounded-control border-rule bg-paper text-14 h-9 min-w-56 border px-2"
                  />
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-control border-rule text-14 h-9 border px-3 font-medium disabled:opacity-50"
                >
                  Correct
                </button>
                <button
                  type="button"
                  onClick={() => setCorrecting(null)}
                  className="text-12 text-ink-muted underline"
                >
                  Cancel
                </button>
              </form>
            )}

            {/* what it replaced ----------------------------------------- */}
            {m.history.length > 0 && (
              <details className="text-12 text-ink-muted">
                <summary className="cursor-pointer">
                  {m.history.length} earlier record
                  {m.history.length === 1 ? "" : "s"}, superseded
                </summary>
                <ul className="mt-1 flex flex-col gap-1 pl-3">
                  {m.history.map((h, i) => (
                    <li key={i}>
                      <span className="font-mono">
                        {h.ackNo || "no number"}
                      </span>{" "}
                      {h.filedOn && `filed ${h.filedOn}, `}corrected{" "}
                      {h.correctedAt} by {h.correctedByName}: {h.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>

      <p className="text-12 text-ink-muted">
        Each return is recorded on its own, because they fall on different days
        and finish on different days. Late is measured against the date that
        applied when the return went in, so a later extension does not rewrite
        history.
      </p>
    </section>
  );
}
