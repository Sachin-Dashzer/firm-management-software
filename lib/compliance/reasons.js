// @ts-check

/**
 * The two things an empty compliance cell can be, other than a miss (P3-9).
 *
 * Here rather than on the model because `lib/compliance/grid.js` is pure and
 * is read by screens: a lib module that imports a Mongoose model drags the
 * whole MongoDB driver wherever it goes, which is the mistake P3-6 made once
 * already. The model imports these; nothing imports the model to get them.
 */

export const PERIOD_REASONS = ["other-professional", "not-engaged"];

export const PERIOD_REASON_LABELS = {
  "other-professional": "Handled by another professional",
  "not-engaged": "Not engaged for this period",
};

/** Two letters, because a grid cell is narrow. */
export const PERIOD_REASON_MARKS = {
  "other-professional": "E",
  "not-engaged": "NE",
};
