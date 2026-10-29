/**
 * The dashboard furniture (spec section 10).
 *
 * Every tile is a link, because spec section 17 asks that each figure be
 * clickable through to the list it came from — and because a number
 * nobody can open is a number nobody can check.
 *
 * **The icon square and the feature card are the owner's call** (D85,
 * 29-10-2026). Both come from the reference CRM, and both are things
 * `CLAUDE.md` rule 10 and spec section 15 rule out — the rule was put
 * there by the owner and the owner has overridden it for these two.
 *
 * What is kept is the part of those rules that was load-bearing:
 *
 *  - **A tint carries meaning, never decoration.** The square behind an
 *    icon takes its colour from the tile's `tone`, so red means late and
 *    amber means waiting, exactly as the figure's own colour does. There
 *    is no per-tile palette and no hue chosen to look lively.
 *  - **One feature card per screen.** The gradient belongs to the figure
 *    the screen exists to raise the alarm about. A second one and neither
 *    is the thing being pointed at, which is why `FeatureTile` is a
 *    separate export rather than a `tone` anybody can pass.
 *  - **Every pairing clears 4.5:1**, icon on its tint and white on both
 *    ends of the gradient. The reference's own gradient gives white about
 *    3:1; these are its hues taken down until the figure is readable.
 */

import Link from "next/link";
import { formatPaise } from "@/lib/money";
import Figure from "./Figure";

/**
 * The tinted square behind a tile's icon.
 *
 * `tone` is the tile's own, so the square cannot disagree with the figure
 * it sits beside. `aria-hidden`, because the label already says what the
 * tile is and a screen reader does not need the decoration read to it.
 */
const TONE_TINT = {
  late: "bg-redpen-soft text-redpen",
  soon: "bg-waiting-soft text-waiting",
  good: "bg-filed-soft text-filed",
};

function IconSquare({ icon: Icon, tone }) {
  if (!Icon) return null;
  return (
    <span
      aria-hidden="true"
      className={`rounded-ledger grid size-9 shrink-0 place-items-center ${
        TONE_TINT[tone] ?? "bg-carbon-soft text-carbon"
      }`}
    >
      <Icon size={18} />
    </span>
  );
}

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
          <span className="text-12 text-ink-muted">{tile.label}</span>
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
export function MoneyTile({ label, paise, note, href, tone, icon }) {
  return (
    <Link
      href={href}
      className="rounded-ledger border-rule bg-surface hover:bg-carbon-wash focus-visible:outline-brass flex items-start gap-3 border px-4 py-3 focus-visible:outline-2"
    >
      <IconSquare icon={icon} tone={tone} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-12 text-ink-muted">{label}</span>
        <Figure
          value={paise}
          paise
          className={`num font-display text-24 leading-none ${tone === "late" ? "text-redpen" : ""}`}
        />
        {note && <span className="text-12 text-ink-muted">{note}</span>}
      </span>
    </Link>
  );
}

/** The same tile, for something counted rather than owed. */
export function CountTile({ label, value, note, href, tone, icon }) {
  return (
    <Link
      href={href}
      className="rounded-ledger border-rule bg-surface hover:bg-carbon-wash focus-visible:outline-brass flex items-start gap-3 border px-4 py-3 focus-visible:outline-2"
    >
      <IconSquare icon={icon} tone={value > 0 ? tone : undefined} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-12 text-ink-muted">{label}</span>
        <Figure
          value={value}
          className={`num font-display text-24 leading-none ${tone === "late" && value > 0 ? "text-redpen" : ""}`}
        />
        {note && <span className="text-12 text-ink-muted">{note}</span>}
      </span>
    </Link>
  );
}

/**
 * The feature card: one tile per screen, filled rather than white (D85).
 *
 * It is for the figure the screen exists to raise the alarm about — the
 * money that is late, the work that is overdue — and it is the reference
 * CRM's own device for exactly that.
 *
 * It is a separate export rather than a `tone`, so that putting a second
 * one on a screen takes a deliberate second import. The gradient is two
 * tokens, both of which keep white above 4.5:1, and it is flat in a
 * forced-colours context because the fill is a `background-image` that
 * Windows high contrast replaces wholesale.
 *
 * `cta` is the one phrase on it that is not data — the reference puts a
 * button there; here it is the link's own affordance, because the whole
 * card is already the link and a button inside a link is not one.
 */
export function FeatureTile({
  label,
  value,
  paise,
  note,
  href,
  icon: Icon,
  cta,
}) {
  return (
    <Link
      href={href}
      style={{
        backgroundImage:
          "linear-gradient(145deg, var(--feature-from), var(--feature-to))", // taste-skill-ignore: the owner's call (D85), overriding rule 10
      }}
      className="rounded-ledger text-feature-ink focus-visible:outline-brass flex flex-col gap-1 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="flex items-center gap-2">
        {Icon && <Icon size={18} aria-hidden="true" />}
        <span className="text-12 text-feature-ink-soft">{label}</span>
      </span>
      <Figure
        value={paise ?? value}
        paise={paise != null}
        className="num font-display text-28 leading-none"
      />
      {note && <span className="text-12 text-feature-ink-soft">{note}</span>}
      {cta && (
        <span className="text-12 text-feature-ink mt-1.5 underline underline-offset-4">
          {cta}
        </span>
      )}
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
