// @ts-check

import { internalTargetFor } from "../compliance/dueDate.js";
import { nextOpenMilestone, milestoneState, OVERDUE } from "./milestones.js";
import { isApproved } from "./gates.js";
import { startOfISTDay } from "../dates.js";
import { CLOSED_STATUSES } from "./status.js";

/**
 * Three dates on the way to one deadline, and the state they make possible
 * (P3-5).
 *
 * The build had one internal date and the statutory date, which answers
 * "is this late" and nothing else. **Overdue is the list where acting is too
 * late.** The list a partner can still do something about is the one where
 * the statutory date is still ahead but an internal target has already
 * slipped — and that list did not exist.
 *
 *   prepare by   statutory − 4 working days   computed
 *   firm target  statutory − 3 working days   `internalDue`, editable
 *   reviewed by  statutory − 2 working days   computed
 *   statutory    the next open filing's date
 *
 * The prototype counts those two in calendar days. These are **working
 * days**, because spec §8 says working days, `internalTargetFor()` already
 * computes them that way for the firm's own target, and a target that falls
 * on a Sunday is a target nobody can hit. A prototype is drawn; this is
 * counted.
 *
 * Nothing here is stored. Two subtractions are cheaper than two more fields
 * that can disagree with the date they came from.
 */

/** Working days before the statutory date. */
export const PREPARE_LEAD = 4;
export const REVIEW_LEAD = 2;

/** Statuses where the work has not yet left the preparer's hands. */
const PREPARING = ["Scheduled", "Awaiting documents", "In progress", "On hold"];

/**
 * The three dates for whichever filing is next, or null when there is no
 * date to count back from — an unconfirmed due-date rule, or everything
 * already filed. Null is the honest answer there, and nothing downstream
 * should invent one.
 *
 * @param {any} engagement
 */
export function targets(engagement) {
  const next = nextOpenMilestone(engagement);
  const statutory = next?.dueDate ?? null;
  if (!statutory) return null;

  return {
    name: next.name,
    statutory,
    prepare: internalTargetFor(statutory, PREPARE_LEAD),
    review: internalTargetFor(statutory, REVIEW_LEAD),
    firmTarget: engagement.internalDue ?? null,
  };
}

/**
 * Why this work is at risk, as a sentence, or null when it is not.
 *
 * Deliberately *not* at risk in three cases:
 *
 *  - it is closed — nothing is at risk about finished work
 *  - a filing is already overdue — that is Overdue, a harder state, and a
 *    job in both lists twice is a job counted twice
 *  - the statutory date has passed — too late to save, same reason
 *
 * @param {any} engagement
 * @param {Date} [now]
 * @returns {string|null}
 */
export function atRisk(engagement, now = new Date()) {
  if (CLOSED_STATUSES.includes(engagement?.status)) return null;

  const anyOverdue = (engagement.milestones ?? []).some(
    (m) => milestoneState(m, now) === OVERDUE,
  );
  if (anyOverdue) return null;

  const t = targets(engagement);
  if (!t) return null;

  const today = startOfISTDay(now).getTime();
  if (t.statutory.getTime() < today) return null;

  if (
    t.prepare &&
    today > t.prepare.getTime() &&
    PREPARING.includes(engagement.status)
  ) {
    return engagement.status === "Awaiting documents"
      ? `Preparation target for ${t.name} has passed — waiting on the client`
      : `Preparation target for ${t.name} has passed`;
  }

  if (t.review && today > t.review.getTime() && !isApproved(engagement)) {
    return `Review target for ${t.name} has passed and it is not approved`;
  }

  // the firm's own editable target, which until now nothing read back
  if (t.firmTarget && today > startOfISTDay(t.firmTarget).getTime()) {
    return "The firm's target date has passed";
  }

  return null;
}
