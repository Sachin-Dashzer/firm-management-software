/**
 * The count that rides on a tab or a rail item (P3-34).
 *
 * Small, round, and always the ledger face, because it is read as a
 * quantity and not as a word. Three looks, each meaning one thing:
 *
 *  - `late` — red. Something has passed a date.
 *  - `soon` — amber. Something is about to.
 *  - neutral — grey. A count, and nothing more. This is most of them, and
 *    making it the default is what keeps the red ones legible: a rail
 *    where every badge is coloured is a rail where no badge is a warning.
 *
 * `onAccent` is for a badge sitting on an active `bg-carbon` tab, where
 * the grey would disappear into the fill. It is the pill's two colours
 * swapped — the label colour becomes the badge and the fill becomes its
 * text — so there is no third value to keep in step with the theme.
 *
 * The brief proposed `bg-on-carbon/20` for this. Measured, that gives
 * 3.55:1 in the light theme: white at a fifth over the teal is still
 * teal, and white on it fails. Swapping the pair instead gives 5.19:1
 * light and 9.01:1 dark. See `tests/contrast.test.js`.
 *
 * @param {object} props
 * @param {number|string} props.value
 * @param {"late"|"soon"|"neutral"} [props.tone]
 * @param {boolean} [props.onAccent] sitting on a filled tab
 * @param {number} [props.cap] show `{cap}+` above this, e.g. 9
 */

const TONE = {
  late: "bg-redpen-soft text-redpen",
  soon: "bg-waiting-soft text-waiting",
  neutral: "bg-sunk text-ink-muted",
};

export default function CountBadge({
  value,
  tone = "neutral",
  onAccent = false,
  cap = null,
}) {
  if (value == null) return null;

  const shown =
    cap != null && typeof value === "number" && value > cap ? `${cap}+` : value;

  return (
    <span
      className={`num rounded-chip text-11 inline-block min-w-5 px-1.5 py-0.5 text-center leading-[1.45] ${
        onAccent ? "bg-on-carbon text-carbon" : (TONE[tone] ?? TONE.neutral)
      }`}
    >
      {shown}
    </span>
  );
}
