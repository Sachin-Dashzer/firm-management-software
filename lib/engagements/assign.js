// @ts-check

import { canExecute, canReview } from "../services/catalog.js";

/**
 * The assignment rules from spec section 5.
 *
 * Used when an engagement is created and again on every reassignment, so
 * work cannot be moved onto someone who is not allowed to do it, and the
 * maker can never also be the checker.
 *
 * @param {{minExecRole: string, minReviewRole: string, name?: string}} template
 * @param {{id: string, name: string, role: string}|null} assignee
 * @param {{id: string, name: string, role: string}|null} reviewer
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function checkAssignment(template, assignee, reviewer) {
  if (assignee && !canExecute(assignee.role, template.minExecRole)) {
    return {
      ok: false,
      error: `${assignee.name} cannot do this work: it needs at least ${roleName(template.minExecRole)}.`,
    };
  }

  if (reviewer && !canReview(reviewer.role, template.minReviewRole)) {
    return {
      ok: false,
      error: `${reviewer.name} cannot review this work: it needs at least ${roleName(template.minReviewRole)}.`,
    };
  }

  if (assignee && reviewer && assignee.id === reviewer.id) {
    return {
      ok: false,
      error:
        "The reviewer must be someone other than the person doing the work.",
    };
  }

  return { ok: true };
}

const NAMES = {
  intern: "an articled intern",
  employee: "an employee",
  ca: "a CA",
  partner: "a partner",
};

function roleName(role) {
  return NAMES[role] ?? role;
}
