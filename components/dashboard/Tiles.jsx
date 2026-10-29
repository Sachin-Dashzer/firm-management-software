/**
 * The dashboard furniture (spec section 10).
 *
 * Every tile is a link, because spec section 17 asks that each figure be
 * clickable through to the list it came from — and because a number
 * nobody can open is a number nobody can check.
 *
 * Deliberately not a grid of identical shadowed cards (spec section 15):
 * the figures sit in a ruled row like a trial balance, with one rule
 * between them, and only lateness is coloured.
 */

import Link from "next/link";
import { formatPaise } from "@/lib/money";
import Figure from "./Figure";

/** @param {{tiles: Array<{label: string, value: number, href: string, tone?: string}>}} props */
export function TileRow({ tiles }) {
  return (
    <div className="rounded-ledger border-rule bg-surface divide-rule flex flex-col divide-y border sm:flex-row sm:divide-x sm:divide-y-0">
      {tiles.map((tile) => (
        <Link
          key={tile.label}
          href={tile.href}
          className="hover:bg-carbon-wash focus-visible:outline-brass flex flex-1 items-baseline justify-between gap-3 px-4 py-3 focus-visible:outline-2 sm:flex-col sm:items-start sm:justify-start sm:gap-1"
        >
          <span className="text-12 text-ink-muted">
            {tile.label}
          </span>
          <Figure
            value={tile.value}
            className={`num font-display text-28 leading-none ${
              tile.tone === "late" && tile.value > 0
                ? "text-redpen"
                : tile.tone === "soon" && tile.value > 0
                  ? "text-waiting"
                  : ""
            }`}
          />
          {/* a tile that needs a word of explanation may have one */}
          {tile.note && (
            <span className="text-12 text-ink-muted">{tile.note}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

/** A figure in rupees with a line of explanation under it. */
export function MoneyTile({ label, paise, note, href, tone }) {
  return (
    <Link
      href={href}
      className="rounded-ledger border-rule bg-surface hover:bg-carbon-wash focus-visible:outline-brass flex flex-col gap-1 border px-4 py-3 focus-visible:outline-2"
    >
      <span className="text-12 text-ink-muted">
        {label}
      </span>
      <Figure
        value={paise}
        paise
        className={`num font-display text-24 leading-none ${tone === "late" ? "text-redpen" : ""}`}
      />
      {note && <span className="text-12 text-ink-muted">{note}</span>}
    </Link>
  );
}

/** The same tile, for something counted rather than owed. */
export function CountTile({ label, value, note, href, tone }) {
  return (
    <Link
      href={href}
      className="rounded-ledger border-rule bg-surface hover:bg-carbon-wash focus-visible:outline-brass flex flex-col gap-1 border px-4 py-3 focus-visible:outline-2"
    >
      <span className="text-12 text-ink-muted">
        {label}
      </span>
      <Figure
        value={value}
        className={`num font-display text-24 leading-none ${tone === "late" && value > 0 ? "text-redpen" : ""}`}
      />
      {note && <span className="text-12 text-ink-muted">{note}</span>}
    </Link>
  );
}

/**
 * A bar chart, in CSS.
 *
 * Six rows of percentage-width div, which is what a bar chart is. A
 * charting library would add a dependency, a canvas and a tooltip to show
 * the same six numbers that are already printed at the end of each bar.
 * ponytail: CSS bars; reach for visx when a real time series needs axes,
 * interpolation or a brush.
 */
export function BarRows({ rows, total, href }) {
  const max = Math.max(1, ...rows.map((row) => row.paise));

  if (rows.length === 0) {
    return (
      <p className="text-13 text-ink-muted">
        Nothing has been billed this financial year yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.label} className="flex flex-col gap-1">
          <div className="text-13 flex items-baseline justify-between gap-3">
            <span className="truncate">{row.label}</span>
            <span className="num text-ink-muted">{formatPaise(row.paise)}</span>
          </div>
          <div
            className="bg-carbon-wash h-2 w-full overflow-hidden rounded-full"
            role="img"
            aria-label={`${row.label}: ${formatPaise(row.paise)}${
              total ? ` of ${formatPaise(total)}` : ""
            }`}
          >
            <div
              className="bg-brass h-full rounded-full"
              style={{ width: `${Math.round((row.paise / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
      {href && (
        <li className="text-13">
          <Link href={href} className="underline underline-offset-4">
            See the invoices behind this
          </Link>
        </li>
      )}
    </ul>
  );
}

/** A section on a dashboard: a heading, a line of explanation, content. */
export function Panel({ title, what, children, action }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-15 font-semibold">{title}</h2>
          {what && <p className="text-13 text-ink-muted">{what}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
