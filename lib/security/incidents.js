// @ts-check

/**
 * The incident log's vocabulary (spec section 16).
 *
 * Here rather than on the model because the screen that records an
 * incident is a client component, and importing a Mongoose model into the
 * browser drags the whole driver in with it. Constants the UI needs live
 * away from the database.
 */

/**
 * How bad it was. "Reportable" is the one that matters: it means the DPDP
 * Rules' notification duty is in play and the firm's lawyer is involved.
 */
export const SEVERITIES = ["Noted", "Low", "Serious", "Reportable"];

export const INCIDENT_STATES = ["Open", "Contained", "Closed"];
