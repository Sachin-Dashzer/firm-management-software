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

/**
 * The minimum role for one step of an engagement: its own if it names one,
 * the service's otherwise.
 *
 * A task created before P2-4 has no `minRole`, so it falls back to what the
 * whole engagement already demanded — exactly the behaviour it had. Both the
 * ticking and the per-step assignment ask this, so a step nobody may do is
 * also a step nobody may be given.
 *
 * @param {{templateSnapshot?: {minExecRole?: string}}} engagement
 * @param {{minRole?: string}} task
 * @returns {string}
 */
export function stepFloor(engagement, task) {
  return task.minRole || engagement.templateSnapshot?.minExecRole || "intern";
}

const NAMES = {
  intern: "an articled intern",
  employee: "an employee",
  ca: "a CA",
  partner: "a partner",
};

/**
 * A role as it reads in a sentence. Exported because the per-step checks in
 * P2-4 refuse work with the same wording, and two phrasings of the same rule
 * would read like two different rules.
 *
 * @param {string} role
 */
export function roleName(role) {
  return NAMES[role] ?? role;
}
