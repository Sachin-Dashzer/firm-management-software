// @ts-check

/**
 * The permission matrix from spec section 2, in one place.
 *
 * Every server action and route handler asks this module before it reads or
 * writes anything. Hiding a button in the UI is not security: if a check is
 * missing here, it is missing everywhere.
 *
 * Two questions are answered together:
 *   1. Does this role have the right level of access to this area?
 *      (none < view < edit < approve)
 *   2. Does this particular record fall inside the role's scope?
 *      (all / branch / team / assigned / own)
 */

/** @typedef {"partner"|"ca"|"employee"|"intern"|"accounts"} Role */
/** @typedef {"view"|"edit"|"approve"} Action */
/** @typedef {"all"|"branch"|"team"|"assigned"|"own"|"none"} Scope */

/**
 * @typedef {object} Actor
 * @property {string} id
 * @property {Role} role
 * @property {string[]} branchIds
 * @property {boolean} [active]
 */

/**
 * The record being acted on. Every field is optional: pass what the record has
 * and the scope rules use what they need.
 * @typedef {object} Target
 * @property {string} [branchId]
 * @property {string} [assigneeId]
 * @property {string} [reviewerId]
 * @property {string} [userId]
 * @property {string[]} [assignedUserIds]
 * @property {string} [reportingTo] the record owner's reporting CA, for team scope
 */

export const ROLES = ["partner", "ca", "employee", "intern", "accounts"];

export const ROLE_LABELS = {
  partner: "Partner / Admin",
  ca: "CA (Manager)",
  employee: "Employee",
  intern: "Articled Intern",
  accounts: "Accounts / Billing",
};

const LEVEL = { none: 0, view: 1, edit: 2, approve: 3 };

/** `[level, scope]` for each role, straight from the table in spec section 2. */
const MATRIX = {
  clients: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["view", "branch"],
    intern: ["view", "assigned"],
    accounts: ["view", "branch"],
  },
  // PAN, Aadhaar, bank details, portal passwords
  clientSensitive: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["view", "assigned"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  serviceCatalog: {
    partner: ["edit", "all"],
    ca: ["view", "all"],
    employee: ["view", "all"],
    intern: ["view", "all"],
    accounts: ["view", "all"],
  },
  engagementsCreate: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  engagementsWork: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["edit", "assigned"],
    intern: ["edit", "assigned"],
    accounts: ["none", "none"],
  },
  // marking an engagement Completed lives here, and only here
  engagementsReview: {
    partner: ["approve", "all"],
    ca: ["approve", "branch"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  documents: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["edit", "assigned"],
    intern: ["edit", "assigned"],
    accounts: ["view", "branch"],
  },
  invoices: {
    partner: ["edit", "all"],
    ca: ["view", "branch"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["edit", "all"],
  },
  feeWriteOff: {
    partner: ["approve", "all"],
    ca: ["none", "none"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  timeEntries: {
    partner: ["view", "all"],
    ca: ["view", "team"],
    employee: ["edit", "own"],
    intern: ["edit", "own"],
    accounts: ["none", "none"],
  },
  dashboards: {
    partner: ["view", "all"],
    ca: ["view", "team"],
    employee: ["view", "own"],
    intern: ["view", "own"],
    accounts: ["view", "all"],
  },
  auditLog: {
    partner: ["view", "all"],
    ca: ["view", "branch"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  usersSettings: {
    partner: ["edit", "all"],
    ca: ["none", "none"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  // soft delete only, and only a Partner
  deleteRecord: {
    partner: ["approve", "all"],
    ca: ["none", "none"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
};

/** @typedef {keyof MATRIX} Area */

export const AREAS = Object.keys(MATRIX);

/**
 * @param {Actor} actor
 * @param {string} area
 */
function grantFor(actor, area) {
  const row = MATRIX[area];
  if (!row) throw new Error(`Unknown permission area: ${area}`);
  const grant = row[actor?.role];
  if (!grant) return { level: "none", scope: "none" };
  return { level: grant[0], scope: grant[1] };
}

/**
 * Is this record inside the actor's scope?
 * @param {Actor} actor
 * @param {Scope} scope
 * @param {Target} [target]
 */
function inScope(actor, scope, target) {
  if (scope === "none") return false;
  if (scope === "all") return true;

  // With no target the question is about a whole screen rather than one record
  // (may this person open Billing at all?), so any scope but none passes here
  // and the scope is applied to the query instead — see branchFilter.
  if (!target) return true;

  const branchOk =
    !target.branchId || (actor.branchIds ?? []).includes(target.branchId);

  switch (scope) {
    case "branch":
      return branchOk;
    case "own":
      return target.userId === actor.id;
    case "assigned":
      return (
        branchOk &&
        (target.assigneeId === actor.id ||
          target.reviewerId === actor.id ||
          target.userId === actor.id ||
          (target.assignedUserIds ?? []).includes(actor.id))
      );
    case "team":
      return (
        branchOk &&
        (target.userId === actor.id ||
          target.assigneeId === actor.id ||
          target.reviewerId === actor.id ||
          target.reportingTo === actor.id)
      );
    default:
      return false;
  }
}

/**
 * The one question the whole app asks.
 *
 * @param {Actor} actor the signed-in user
 * @param {Action} action view, edit or approve
 * @param {string} area which part of the system
 * @param {Target} [target] the record, when the check is about one record
 * @returns {boolean}
 */
export function can(actor, action, area, target) {
  if (!actor || actor.active === false) return false;
  if (!(action in LEVEL)) throw new Error(`Unknown action: ${action}`);

  const { level, scope } = grantFor(actor, area);
  if (LEVEL[level] < LEVEL[action]) return false;
  return inScope(actor, scope, target);
}

/**
 * The same question, but it throws instead of returning false. Use this at the
 * top of every server action, so a missing check fails loudly rather than
 * quietly allowing the write.
 * @param {Actor} actor
 * @param {Action} action
 * @param {string} area
 * @param {Target} [target]
 */
export function assertCan(actor, action, area, target) {
  if (!can(actor, action, area, target)) {
    const err = new Error("Not allowed");
    err.code = "FORBIDDEN";
    err.detail = { role: actor?.role, action, area };
    throw err;
  }
}

/**
 * The branch condition to add to a query, so a list can never return records
 * from branches the user is not assigned to. `null` means no restriction.
 *
 * @param {Actor} actor
 * @param {string} area
 * @returns {{ branchId: { $in: string[] } } | null}
 */
export function branchFilter(actor, area) {
  const { scope } = grantFor(actor, area);
  if (scope === "all") return null;
  return { branchId: { $in: actor.branchIds ?? [] } };
}

/**
 * How wide this role sees in this area: all, branch, team, assigned, own or
 * none. Lists use it to decide between showing the branch and showing my work.
 * @param {Actor} actor
 * @param {string} area
 * @returns {Scope}
 */
export function scopeOf(actor, area) {
  return grantFor(actor, area).scope;
}
