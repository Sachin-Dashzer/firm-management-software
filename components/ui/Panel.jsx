import Link from "next/link";

/**
 * A card with a title, and a way out of it (P3-34).
 *
 * There is already a `Panel` in `components/dashboard/Tiles.jsx`. That one
 * is a heading with children under it and no card around them, which is
 * what the old dashboard wanted; this one is the mockup's card — a border,
 * a surface and a header row that can carry three things:
 *
 *  - a **sub-count** in the ledger face, so "Work in progress" can say
 *    `· 41 open jobs` without a second heading;
 *  - a **link out**, which is the rule that every panel on these six
 *    screens obeys: a panel shows a few rows and names where the rest of
 *    them live ("Open job board", "Hearing diary", "Revenue report");
 *  - a **hint**, for the panels whose right-hand side is an explanation
 *    rather than a destination ("Every number opens its list").
 *
 * The two live side by side until Phase 8, which deletes `FirmOverview`
 * and the older `Panel` with it if nothing else imports them.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.count] the mono sub-count, without its leading dot
 * @param {string} [props.hint] right-hand explanation
 * @param {{href: string, label: string}} [props.link] right-hand way out
 */
export default function Panel({
  title,
  count,
  hint,
  link,
  id,
  className = "",
  children,
}) {
  return (
    <section
      id={id}
      className={`rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4 ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-15 font-semibold">
          {title}
          {count && (
            <span className="num text-ink-muted ml-1.5 font-normal">
              · {count}
            </span>
          )}
        </h2>
        <span className="flex items-baseline gap-3">
          {hint && <span className="text-12 text-ink-muted">{hint}</span>}
          {link && (
            <Link
              href={link.href}
              className="text-13 text-carbon underline-offset-4 hover:underline"
            >
              {link.label}
            </Link>
          )}
        </span>
      </div>
      {children}
    </section>
  );
}
