/**
 * How far along, with the line somebody should not cross (P3-34).
 *
 * Three jobs on these screens: the compliance heads table's `122/126`, the
 * annual season cards' filed-of-total, and the team load rows — which are
 * the reason `marker` exists.
 *
 * **The marker is the point.** A team-load bar scaled to the busiest
 * person says only that somebody is busiest, which everybody already
 * knows. Scaled past a comfort limit with a tick drawn at the limit, the
 * same bar says who is over it and by how much, and that is a thing a
 * partner can act on this morning. The tick is drawn taller than the
 * track so it reads as a line across the bar rather than a segment of it.
 *
 * `tone` is for the fill when the bar itself is the bad news: amber over
 * the limit, red pen well over it.
 *
 * @param {object} props
 * @param {number} props.value
 * @param {number} props.max
 * @param {number} [props.marker] a percentage, 0–100, or null for no tick
 * @param {"carbon"|"waiting"|"redpen"} [props.tone]
 * @param {string} [props.trailing] the mono figure after the bar, e.g. `122/126`
 * @param {string} [props.label] what the bar is, for a screen reader
 * @param {number} [props.index] stagger position when bars are stacked
 */

const FILL = {
  carbon: "bg-carbon",
  waiting: "bg-waiting",
  redpen: "bg-redpen",
};

export default function ProgressBar({
  value,
  max,
  marker = null,
  tone = "carbon",
  trailing,
  label,
  index = 0,
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div className="flex w-full items-center gap-2">
      <div
        role="img"
        aria-label={label ?? `${value} of ${max}`}
        className="bg-sunk relative h-1.5 w-full rounded-full"
      >
        <div
          style={{ width: `${percent}%`, "--i": index }}
          className={`anim-bar h-full rounded-full ${FILL[tone] ?? FILL.carbon}`}
        />
        {marker != null && (
          <span
            aria-hidden="true"
            style={{ left: `${Math.min(100, Math.max(0, marker))}%` }}
            className="bg-ink-muted absolute -top-1 -bottom-1 w-px"
          />
        )}
      </div>
      {trailing && (
        <span className="num text-12 text-ink-muted shrink-0">{trailing}</span>
      )}
    </div>
  );
}
