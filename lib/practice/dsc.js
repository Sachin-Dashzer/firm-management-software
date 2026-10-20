// @ts-check

import { daysUntil } from "../dates.js";

/**
 * The DSC register's vocabulary and arithmetic (P2-7).
 *
 * The firm does **not** hold clients' tokens (owner decision, 19-10-2026), so
 * this is a register of expiry dates and nothing else: no custody, no
 * movements, no record of the firm having anybody's signature in a drawer.
 * The one question it answers is "whose certificate is about to run out and
 * is anybody going to be caught out by it".
 *
 * Kept apart from the model so the screens and the reminder sweep read the
 * same lists without pulling Mongoose into the browser.
 */

/**
 * Certificate classes. Class 2 was withdrawn for new issues but still sits in
 * old records, so it stays readable; "Other" covers DGFT and anything the
 * firm meets that we have not named.
 */
export const DSC_CLASSES = ["Class 3", "Class 2", "DGFT", "Other"];

/** Where the certificate is, as one fact rather than a custody log. */
export const DSC_HOLDERS = ["client", "firm", "other"];

export const DSC_HOLDER_LABELS = {
  client: "With the client",
  firm: "With the firm",
  other: "Somewhere else",
};

/** How close to expiry a row is called, for a chip and for sorting. */
export function dscState(validTill, now = new Date()) {
  if (!validTill) return { state: "unknown", label: "No expiry recorded" };

  const days = daysUntil(validTill, now);
  if (days < 0) {
    return {
      state: "expired",
      days,
      label: `Expired ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`,
    };
  }
  if (days === 0) return { state: "today", days, label: "Expires today" };
  if (days <= 30) {
    return { state: "soon", days, label: `${days} days left` };
  }
  return { state: "valid", days, label: `${days} days left` };
}

/**
 * Is this certificate worth a reminder today?
 *
 * The firm sets the days (`daysBefore` on the rule), exactly like the
 * statutory reminders. A certificate that has already expired is chased once
 * on the day it lapses and then left alone: a daily email about a
 * certificate nobody can renew for them is noise, and the register shows it
 * in red for ever.
 *
 * @param {{validTill?: Date|string|null}} dsc
 * @param {number[]} daysBefore
 * @param {Date} now
 * @returns {number|null} the notice period that matched, or null
 */
export function dueReminder(dsc, daysBefore = [], now = new Date()) {
  if (!dsc.validTill) return null;
  const days = daysUntil(dsc.validTill, now);
  if (days === 0) return 0;
  return daysBefore.includes(days) ? days : null;
}
