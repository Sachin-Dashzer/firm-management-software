/**
 * The small pill that says what state a thing is in (P3-34).
 *
 * There were six private `Chip` functions in this repository before this
 * file — in the inbox, the issues list, the held-changes screen, the
 * notices list, the certificates list and the client page — each a
 * near-copy of the others, and each with its own idea of the padding. This
 * is the one of them that is only a tone and a pill.
 *
 * It does **not** replace `StatusChip` and `DueChip` in
 * `app/(app)/engagements/chips.jsx`. Those two decide their own colour
 * from an engagement's status and from how many days are left, which is
 * domain logic that belongs beside the domain. This one is told.
 *
 * `dashed` is the one tone that is not a status: it is the "never opened"
 * mark, a period with nothing in it. A dashed outline is the right shape
 * for an absence — a filled chip would claim there is something there.
 *
 * `mono` puts a date or a count on the ledger grid (`Tomorrow`,
 * `2 Nov · 3d`), so a column of chips lines up.
 *
 * **The fills are the flat `-soft` tints, not the `-wash` ones**, and
 * `tests/contrast.test.js` is why. A wash is the colour at 12% over
 * whatever is behind it, and what is behind a chip is sometimes a card
 * and sometimes the page — so its own colour on it measures between
 * 3.99:1 and 4.41:1 for the accent, which is under the bar on both
 * grounds. The soft tints are flat values that were measured once and
 * clear it everywhere. The washes keep their job: a row tint or a hover,
 * where the text on them is `ink` and reads at 16:1.
 *
 * @param {object} props
 * @param {"late"|"soon"|"good"|"info"|"neutral"|"dashed"} [props.tone]
 * @param {boolean} [props.mono]
 * @param {string} [props.title] the long form, on hover
 */

const TONE = {
  late: "border-redpen/40 bg-redpen-soft text-redpen",
  soon: "border-waiting/40 bg-waiting-soft text-waiting",
  good: "border-filed/40 bg-filed-soft text-filed",
  info: "border-carbon/40 bg-carbon-soft text-carbon",
  neutral: "border-rule bg-sunk text-ink-muted",
  dashed: "border-dashed border-redpen text-redpen",
};

export default function Chip({
  tone = "neutral",
  mono = false,
  title,
  className = "",
  children,
}) {
  return (
    <span
      title={title}
      className={`rounded-chip text-12 border px-2 py-0.5 font-medium ${
        mono ? "num" : ""
      } ${TONE[tone] ?? TONE.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
