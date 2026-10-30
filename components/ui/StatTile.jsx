import Link from "next/link";
import Figure from "@/components/dashboard/Figure";

/**
 * A figure, what it means, and the list it came from (P3-34).
 *
 * This is the tile the mockup uses in three places — the dashboard's
 * "Needs action" row, the compliance frequency cards' mini stats and the
 * clients page's filter row — and it replaces `CountTile` and `MoneyTile`
 * in `components/dashboard/Tiles.jsx`, which were the same tile drawn
 * twice because one of them happened to hold rupees. `paise` is a prop
 * here, not a second component.
 *
 * Two rules it carries that the old pair did not:
 *
 *  - **A zero is never an alarm.** A tile with nothing in it drops to the
 *    plain look whatever tone it was given, because a red 0 next to the
 *    words "statutory dates missed" reads at a glance as the opposite of
 *    what it says. The tone is a property of the *figure*, not of the
 *    subject.
 *  - **The label is uppercase** (D102, 30-10-2026, the owner's request),
 *    which overrides D78's sentence case for stat tiles and for nothing
 *    else. At 11px over a 28px figure it is a caption on an exhibit, and
 *    sentence case there read as a sentence somebody had left unfinished.
 *
 * `selected` is for the tiles that are also filters — the clients page's
 * row, the compliance "All heads" card. It carries `aria-current`, so the
 * selected one is announced and not merely tinted.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.value counted, or paise when `paise` is set
 * @param {boolean} [props.paise]
 * @param {string} [props.note] the line under the figure
 * @param {string} props.href the list this figure counted
 * @param {"late"|"soon"|"good"|"info"|"plain"} [props.tone]
 * @param {boolean} [props.selected]
 */

const TONE = {
  late: {
    card: "border-redpen/30 bg-redpen-wash",
    dot: "bg-redpen",
    figure: "text-redpen",
  },
  soon: {
    card: "border-waiting/30 bg-waiting-wash",
    dot: "bg-waiting",
    figure: "text-waiting",
  },
  good: { card: "border-rule bg-surface", dot: "bg-filed", figure: "" },
  info: { card: "border-rule bg-surface", dot: "bg-carbon", figure: "" },
  plain: { card: "border-rule bg-surface", dot: "bg-faint", figure: "" },
};

export default function StatTile({
  label,
  value,
  paise = false,
  note,
  href,
  tone = "plain",
  selected = false,
}) {
  // the zero rule: nothing counted, nothing to be alarmed about
  const look = value > 0 ? (TONE[tone] ?? TONE.plain) : TONE.plain;

  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={`rounded-ledger lift flex flex-col gap-1.5 border px-4 py-3 ${
        selected ? "border-carbon bg-carbon-wash" : look.card
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${look.dot}`}
        />
        <span className="text-11 text-ink-muted font-semibold tracking-wide uppercase">
          {label}
        </span>
      </span>
      <Figure
        value={value}
        paise={paise}
        className={`num font-display text-28 leading-none font-semibold ${look.figure}`}
      />
      {note && <span className="text-12 text-ink-muted">{note}</span>}
    </Link>
  );
}
