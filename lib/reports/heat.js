// @ts-check

/**
 * The shading of the eight-week heatmap (P3-34 phase 3).
 *
 * Pure, and in its own file, because two things about it go wrong quietly:
 * the step a cell lands on, and whether the figure on it can still be read.
 *
 * **Quantile, not proportion.** Shading by `value / peak` is what the old
 * heatmap did, and on this firm's data it put almost every cell in the
 * bottom shade: one branch with fourteen filings in a week sets the peak,
 * and the other twenty-nine cells holding one to five become
 * indistinguishable. Quantile spreads whatever spread exists, which is the
 * only thing a heatmap is for. Where there is no spread — every cell the
 * same — every cell gets the same shade, which is also correct.
 *
 * **The ramp stops where the text does.** The brief asked for
 * `/10 /20 /35 /55 /80 /100`. Measured against the tokens, the band from
 * 55% to 90% has **no text colour that clears 4.5:1 in both themes**: the
 * light theme's accent darkens as it fills so it wants white up there, the
 * dark theme's lightens so it wants near-black, and `ink` and `on-carbon`
 * swap meaning between the two. `text-ink` is safe from 5% to 50% and
 * `text-on-carbon` from 95% to 100%, so the ramp uses the first five steps
 * inside the safe band and jumps to the full accent for the top one.
 * `tests/heat.test.js` measures all twelve pairings.
 */

/** Six fills, from barely-there to the accent itself. */
export const HEAT_FILL = [
  "bg-carbon/10",
  "bg-carbon/20",
  "bg-carbon/30",
  "bg-carbon/40",
  "bg-carbon/50",
  "bg-carbon",
];

/** The alpha behind each fill, so the contrast test can measure them. */
export const HEAT_ALPHA = [0.1, 0.2, 0.3, 0.4, 0.5, 1];

export const HEAT_STEPS = HEAT_FILL.length;

/**
 * Five cut points that split the non-zero cells into six roughly equal
 * groups.
 *
 * @param {number[]} values every cell's count, zeroes included
 * @returns {number[]} the thresholds, ascending; empty when nothing is due
 */
export function heatThresholds(values) {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  return Array.from({ length: HEAT_STEPS - 1 }, (_, index) => {
    const at = Math.floor(((index + 1) / HEAT_STEPS) * sorted.length);
    return sorted[Math.min(sorted.length - 1, at)];
  });
}

/**
 * Which step a cell sits on: 0 for an empty cell, 1 to 6 otherwise.
 *
 * @param {number} value
 * @param {number[]} thresholds from `heatThresholds`
 */
export function heatStep(value, thresholds) {
  if (!(value > 0)) return 0;
  const above = thresholds.filter((cut) => value > cut).length;
  return Math.min(HEAT_STEPS, 1 + above);
}

/**
 * The classes for a step. Step 0 is the empty cell, which is sunk rather
 * than a lighter shade of the same ink — "nothing due" is a different
 * statement from "a little due", and a seventh shade would read as the
 * latter.
 *
 * @param {number} step
 */
export function heatClasses(step) {
  /**
   * `ink-muted` and not `faint`. `faint` was measured against the page and
   * the card, which are the two grounds it is used on everywhere else; the
   * sunk fill is a step deeper than either, and `faint` on it measures
   * 4.26 in the light theme and 4.47 in the dark — under the bar in both.
   */
  if (step === 0) return "bg-sunk text-ink-muted";
  return `${HEAT_FILL[step - 1]} ${heatText(step)}`;
}

/** @param {number} step */
export function heatText(step) {
  return step >= HEAT_STEPS ? "text-on-carbon" : "text-ink";
}
