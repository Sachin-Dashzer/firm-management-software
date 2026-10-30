import Link from "next/link";

/**
 * One bar, split by where the work is — and every part of it opens its
 * own list (P3-34).
 *
 * Used for the dashboard's "Work in progress" (five job statuses) and for
 * "Receivables by age" (five ageing buckets). The two rules that make it
 * honest:
 *
 *  - **A segment is a link, and so is its legend entry.** A stacked bar
 *    usually ends the conversation: it shows a proportion and leaves the
 *    reader to take it on trust. Here the amber block is the Awaiting
 *    documents list, and clicking it is how you check the figure.
 *  - **A zero segment keeps its legend line.** It vanishes from the bar,
 *    because a zero-width block is a rendering artefact, but "Under
 *    review 0" is a real and useful statement about the firm's day, and
 *    dropping the line would make the legend's length change with the
 *    data.
 *
 * `display` is for the buckets whose value is paise and whose label is a
 * formatted amount: the bar is drawn from `value`, the legend prints
 * `display`.
 *
 * @param {object} props
 * @param {Array<{key: string, label: string, value: number, display?: string,
 *   href: string, className: string}>} props.segments
 * @param {string} props.label what the whole bar is, for a screen reader
 */
export default function StackedBar({ segments, label }) {
  const filled = segments.filter((segment) => segment.value > 0);
  const spoken = segments
    .map((segment) => `${segment.label} ${segment.display ?? segment.value}`)
    .join(", ");

  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={`${label}: ${spoken}`}
        className="flex h-2.5 w-full gap-0.5"
      >
        {filled.length === 0 ? (
          <span className="bg-sunk w-full rounded-full" />
        ) : (
          filled.map((segment, index) => (
            <Link
              key={segment.key}
              href={segment.href}
              title={`${segment.label}: ${segment.display ?? segment.value}`}
              style={{ flexGrow: segment.value, "--i": index }}
              className={`anim-bar min-w-1 rounded-full ${segment.className}`}
            >
              <span className="sr-only">
                {segment.label}: {segment.display ?? segment.value}
              </span>
            </Link>
          ))
        )}
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {segments.map((segment) => (
          <li key={segment.key}>
            <Link
              href={segment.href}
              className="hover:text-carbon flex flex-col gap-1"
            >
              <span className="text-12 text-ink-muted flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`size-1.5 shrink-0 rounded-full ${segment.className}`}
                />
                <span className="truncate">{segment.label}</span>
              </span>
              <span className="num text-20 leading-none">
                {segment.display ?? segment.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
