// @ts-check

/**
 * The three bands of the rail (P3-34 phase 2).
 *
 * Its own file, with **no imports at all**, for the reason
 * `lib/nav/active.js` gives at the top of itself: the rail is a client
 * component, and anything it reaches that touches `lib/permissions.js` or
 * `lib/firm/settings.js` drags those — and the Mongoose driver behind them
 * — into the browser bundle. `lib/nav/tree.js` reaches both, so the rail
 * reads the band list from here and never from there.
 *
 * The bands are not decoration. Ten equal rows make somebody read all ten
 * to find one; three headings cut that to a glance at the right third.
 *
 * @type {ReadonlyArray<{key: "today"|"work"|"firm", label: string}>}
 */
export const SECTIONS = [
  { key: "today", label: "Today" },
  { key: "work", label: "Work" },
  { key: "firm", label: "Firm" },
];
