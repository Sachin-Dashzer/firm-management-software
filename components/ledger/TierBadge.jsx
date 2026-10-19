import { tierOf, TIER_LABELS, TIER_RULES } from "@/lib/services/catalog";

/**
 * The A / B / C tier, as a letter in a ruled box (owner decision D4).
 *
 * **Colour and the letter, never colour alone.** Spec section 15 sets a WCAG
 * 2.2 AA bar, and a tier shown only as a brass square is unreadable to about
 * one reader in twelve — so the letter carries the meaning and the colour
 * only reinforces it. The accessible name is the whole rule, not the letter,
 * because "A" read aloud on its own tells somebody nothing.
 *
 * Deliberately not a coloured pill: spec section 15 asks for hairline rules
 * rather than filled chips, and the tier sits in dense tables beside status
 * chips that already carry colour.
 *
 * @param {object} props
 * @param {string} props.level the stored level (`L1`–`L3`) or a tier letter
 * @param {boolean} [props.withLabel] show the words beside the letter
 */
export default function TierBadge({ level, withLabel = false }) {
  const tier = tierOf(level);
  if (!tier) return <span className="text-ink-muted">—</span>;

  const tone = {
    A: "border-brass text-brass-ink",
    B: "border-carbon text-carbon",
    C: "border-rule text-ink-muted",
  }[tier];

  return (
    <span className="inline-flex items-center gap-2">
      <span
        title={TIER_RULES[tier]}
        className={`rounded-ledger text-13 grid size-5 shrink-0 place-items-center border font-mono font-medium ${tone}`}
      >
        <span className="sr-only">{`Tier ${TIER_LABELS[tier]}. ${TIER_RULES[tier]}`}</span>
        <span aria-hidden="true">{tier}</span>
      </span>
      {withLabel && (
        <span className="text-13" aria-hidden="true">
          {TIER_LABELS[tier]}
        </span>
      )}
    </span>
  );
}
