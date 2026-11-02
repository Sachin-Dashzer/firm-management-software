// @ts-check

import { branchFilter, ROLES } from "../permissions.js";

/**
 * What the team list is being asked to show.
 *
 * It lived twice — once in `/team/page.jsx` and once in
 * `/team/export/route.js` — and carried the same three faults in both
 * copies, which is the usual fate of a filter written out twice:
 *
 *  1. **The office filter replaced the branch scope instead of narrowing
 *     it.** `query.branchIds = { $in: [wantBranch] }` was assigned after
 *     the scope line, so a CA who put another office's id in the URL saw
 *     that office's people. A filter is never allowed to widen access
 *     (CLAUDE.md rule 1), so a chosen office outside what this person may
 *     already see is dropped, not honoured.
 *  2. **"Include people who have left" found nobody.** Offboarding soft
 *     deletes the record, and the soft-delete plugin hides deleted rows
 *     from every ordinary query, so the one filter whose whole purpose is
 *     to show people who have gone was the one that could not. Asking for
 *     them has to say `withDeleted`.
 *  3. **The branch *view* in the top bar was ignored.** Every other list
 *     narrows to it; this one read `branchFilter` for its truthiness only
 *     and then wrote its own scope from the account.
 *
 * Returned rather than applied, so the page and the export share the
 * decision and `tests/team.test.js` can read it without a database.
 */

/** The three things the status filter can be asked for. */
export const TEAM_STATUSES = ["active", "inactive", "all"];

/** @param {unknown} value */
function str(value) {
  return String(value ?? "").trim();
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * @param {{role: string, branchIds?: string[], view?: string}} actor
 * @param {Record<string, any>} [params] the raw search params
 * @returns {{
 *   query: Record<string, any>,
 *   withDeleted: boolean,
 *   chosen: {branch: string, role: string, senior: string, status: string},
 *   allowed: string[]|null,
 *   dropped: boolean,
 * }}
 */
export function teamQuery(actor, params = {}) {
  const asked = {
    branch: str(params.branch),
    role: str(params.role),
    senior: str(params.senior),
    status: str(params.status),
  };

  const scope = branchFilter(actor, "team");
  /** The offices this person may already see; null means the whole firm. */
  const allowed = scope
    ? [].concat(scope.branchId?.$in ?? scope.branchId).map(String)
    : null;

  const chosen = {
    // an office they cannot see is not a filter, it is an attempt
    branch:
      OBJECT_ID.test(asked.branch) &&
      (allowed === null || allowed.includes(asked.branch))
        ? asked.branch
        : "",
    role: ROLES.includes(asked.role) ? asked.role : "",
    senior: OBJECT_ID.test(asked.senior) ? asked.senior : "",
    status: TEAM_STATUSES.includes(asked.status) ? asked.status : "active",
  };

  /** @type {Record<string, any>} */
  const query = {};
  // a string against an array field matches an array containing it
  if (chosen.branch) query.branchIds = chosen.branch;
  else if (allowed) query.branchIds = { $in: allowed };

  if (chosen.role) query.role = chosen.role;
  if (chosen.senior) query.reportingTo = chosen.senior;
  if (chosen.status === "active") query.active = true;
  if (chosen.status === "inactive") query.active = false;

  return {
    query,
    // offboarded people are soft deleted, so they only appear when asked for
    withDeleted: chosen.status !== "active",
    chosen,
    // the offices the Office dropdown may offer: never narrowed by the
    // office currently chosen, or there would be no way back out of it
    allowed,
    dropped: Boolean(asked.branch) && !chosen.branch,
  };
}
