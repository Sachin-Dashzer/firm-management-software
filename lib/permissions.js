// @ts-check

import { viewBranch } from "./access/view.js";

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
 *      (all / branch / team / assigned / granted / own)
 */

/** @typedef {"partner"|"ca"|"employee"|"intern"|"accounts"} Role */
/** @typedef {"view"|"edit"|"approve"} Action */
/** @typedef {"all"|"branch"|"team"|"assigned"|"granted"|"own"|"none"} Scope */

/**
 * @typedef {object} Actor
 * @property {string} id
 * @property {Role} role
 * @property {string[]} branchIds
 * @property {boolean} [active]
 * @property {"staff"|"client"} [kind] staff when absent
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
 * @property {string[]} [grantedUserIds] who holds a Client Access Grant on this
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

/**
 * Who is asking. Client portal users (`clientUsers`, spec section 2's phase 3
 * row) are a different population from staff: they are never a value in
 * `ROLES`, and `can()` refuses them every staff area outright, so a careless
 * matrix row added later cannot open the firm's own screens to a client.
 * Their own access is decided by `clientId` on their session, not here.
 */
export const ACTOR_KINDS = ["staff", "client"];

const LEVEL = { none: 0, view: 1, edit: 2, approve: 3 };

/** `[level, scope]` for each role, straight from the table in spec section 2. */
const MATRIX = {
  clients: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    // An employee or intern sees a client only through work on their desk or
    // a Client Access Grant a CA gave them (owner decision D3, 19-10-2026).
    // Branch-wide reading was wider than spec section 16 allows.
    employee: ["view", "granted"],
    intern: ["view", "granted"],
    accounts: ["view", "branch"],
  },
  /**
   * PAN, Aadhaar, TAN and bank details. An employee reaches these on a client
   * they are on or hold an `identifiers` grant for (owner, 19-10-2026); an
   * intern never does, per spec section 2.
   */
  clientIdentifiers: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["view", "granted"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  /**
   * The credentials vault — the client's own logins for the GST, income tax,
   * TRACES, MCA and EPFO portals.
   *
   * Split out of the old `clientSensitive` because it is not the same risk as
   * a PAN: a PAN identifies a client, a portal password *acts as* them. No
   * grant reaches it — `lib/access/sections.js` leaves `credentials` out of
   * every ceiling below CA — so this row is the whole story.
   */
  clientCredentials: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["none", "none"],
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
    employee: ["edit", "granted"],
    intern: ["edit", "granted"],
    accounts: ["view", "branch"],
  },
  invoices: {
    partner: ["edit", "all"],
    // a CA bills their own branches (owner decision D2, 19-10-2026); the
    // write-off and the data imports stay out of reach, in their own areas
    ca: ["edit", "branch"],
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
  /**
   * To-dos: the small things that are not jobs (P3-22c).
   *
   * Everybody keeps their own, which is why every role may edit — including
   * the intern, because chasing a challan is exactly their work. The scope
   * is about *whose* list you can read: a partner the firm's, a CA their
   * branch's, and everyone else their own plus anything they wrote down for
   * somebody else.
   */
  todos: {
    partner: ["edit", "all"],
    ca: ["edit", "team"],
    employee: ["edit", "own"],
    intern: ["edit", "own"],
    accounts: ["edit", "own"],
  },
  dashboards: {
    partner: ["view", "all"],
    ca: ["view", "team"],
    employee: ["view", "own"],
    intern: ["view", "own"],
    accounts: ["view", "all"],
  },
  /**
   * The Portal Log screen (owner decision D8, 19-10-2026: the words and the
   * route were renamed, this key was not — the log is append-only and
   * hash-chained, and the `auditLogs` collection stays where it is).
   */
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

  // --- Phase 2 (the role panels and the practice modules) -----------------

  /** Reading a colleague's record: the `/team` list and Employee 360. */
  team: {
    partner: ["edit", "all"],
    ca: ["view", "branch"],
    employee: ["view", "own"],
    intern: ["view", "own"],
    accounts: ["none", "none"],
  },
  /** Giving and taking away Client Access Grants. */
  clientAccess: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  udin: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["view", "granted"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  /**
   * The DSC register is expiry dates and nothing else (owner decision D12),
   * so there are no movements to record — an employee may add and correct a
   * certificate within their own scope, and that is all there is to do.
   */
  dsc: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["edit", "granted"],
    intern: ["view", "granted"],
    accounts: ["none", "none"],
  },
  /** The Audits / Statutory / Tax grouping, which is a view over engagements. */
  practice: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["edit", "assigned"],
    intern: ["edit", "assigned"],
    accounts: ["none", "none"],
  },
  /**
   * The ICAI screen. `own` is the member record (a CA edits theirs, an intern
   * reads their articleship); the firm's own FRN and peer review are read with
   * no target, which any level above none passes. Editing the firm profile is
   * a separate area, added with `FirmSettings`.
   */
  icai: {
    partner: ["edit", "all"],
    ca: ["edit", "own"],
    employee: ["view", "own"],
    intern: ["view", "own"],
    accounts: ["none", "none"],
  },
  /**
   * The firm's own record: its name on an invoice, its FRN, its peer review
   * and the retention period. The area P2-1 said would arrive with
   * `FirmSettings`.
   *
   * Everybody reads it — it is the firm's letterhead, not a secret, and the
   * accounts person needs it on a bill. Only a Partner changes it: the name
   * here is the name on every invoice the firm has issued since.
   */
  firmProfile: {
    partner: ["edit", "all"],
    ca: ["view", "all"],
    employee: ["view", "all"],
    intern: ["view", "all"],
    accounts: ["view", "all"],
  },
  /** The Based Docs template library itself. */
  docTemplates: {
    partner: ["edit", "all"],
    ca: ["view", "all"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  /** Generating a document from a template. `edit` is a draft; `approve` issues. */
  docGenerate: {
    partner: ["approve", "all"],
    ca: ["approve", "branch"],
    employee: ["edit", "granted"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
  /** Inviting, deactivating and resetting client portal accounts. */
  clientPortalUsers: {
    partner: ["edit", "all"],
    ca: ["edit", "branch"],
    employee: ["none", "none"],
    intern: ["none", "none"],
    accounts: ["none", "none"],
  },
};

/** @typedef {keyof MATRIX} Area */

export const AREAS = Object.keys(MATRIX);

/** What each area is called on screen (the read-only matrix in Settings). */
export const AREA_LABELS = {
  clients: "Clients (profile, contacts)",
  clientIdentifiers: "Client statutory IDs (PAN, Aadhaar, TAN, bank)",
  clientCredentials: "Client portal logins (the credentials vault)",
  serviceCatalog: "Service catalog",
  engagementsCreate: "Engagements: create and assign",
  engagementsWork: "Engagements: work on assigned",
  engagementsReview: "Engagements: review and mark complete",
  documents: "Documents",
  invoices: "Invoices and payments",
  feeWriteOff: "Fee write-off and discount above the limit",
  timeEntries: "Time entries",
  todos: "To-dos (small things that are not jobs)",
  dashboards: "Dashboards and reports",
  auditLog: "Portal log",
  usersSettings: "Team accounts and firm settings",
  deleteRecord: "Delete a record (soft delete) and purge the bin",
  team: "Team records",
  clientAccess: "Client access grants",
  udin: "UDIN and certificates",
  dsc: "DSC register",
  practice: "Audits, statutory and tax",
  icai: "ICAI",
  firmProfile: "The firm's own record (name, FRN, peer review)",
  docTemplates: "Document templates",
  docGenerate: "Generating documents",
  clientPortalUsers: "Client portal accounts",
};

const LEVEL_WORDS = {
  none: "No access",
  view: "View",
  edit: "Create and edit",
  approve: "Approve",
};

const SCOPE_WORDS = {
  all: "across the whole firm",
  branch: "in their own branches",
  team: "for their own team",
  assigned: "where they are assignee or reviewer",
  granted: "where they are assignee, reviewer, or hold a grant",
  own: "for their own record",
  none: "",
};

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
    /**
     * Work on their desk, or a client a CA deliberately opened to them.
     *
     * Deliberately *not* branch-tested, unlike `assigned`: a grant names one
     * person, one client and a reason, and is audited — a branch check could
     * only take back access somebody meant to give. It also means moving
     * someone between branches no longer strands the work already on their
     * desk. Callers fill `grantedUserIds` from `clientAccess`.
     */
    case "granted":
      return (
        target.assigneeId === actor.id ||
        target.reviewerId === actor.id ||
        target.userId === actor.id ||
        (target.assignedUserIds ?? []).includes(actor.id) ||
        (target.grantedUserIds ?? []).includes(actor.id)
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
  // a client portal user has no staff role and no business in any of these
  // areas; their own access is scoped by clientId, not by this matrix
  if (actor.kind === "client") return false;
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
 * Since P3-7 this is also where the top bar's **view** lands, and the order
 * of the two lines below is the point: access is computed first, and the
 * view can only intersect what it allows. A branch id the account is not
 * assigned to never reaches here — `readView` discards it — but even if one
 * did, the `$in` above it would still hold.
 *
 * The view is a filter on reading. It changes no record, no GSTIN and no
 * invoice series.
 *
 * @param {Actor} actor
 * @param {string} area
 * @returns {{ branchId: any } | null}
 */
export function branchFilter(actor, area) {
  const { scope } = grantFor(actor, area);
  const narrowed = viewBranch(actor?.view);

  if (scope === "all") {
    // a partner sees every branch, so a view of one branch is the only
    // thing that narrows them
    return narrowed ? { branchId: narrowed } : null;
  }

  const allowed = (actor.branchIds ?? []).map(String);
  if (!narrowed) return { branchId: { $in: allowed } };
  // belt and braces: the intersection, not the view
  return allowed.includes(String(narrowed))
    ? { branchId: narrowed }
    : { branchId: { $in: allowed } };
}

/**
 * How wide this role sees in this area: all, branch, team, assigned, granted,
 * own or none. Lists use it to decide between showing the branch and showing
 * my work.
 * @param {Actor} actor
 * @param {string} area
 * @returns {Scope}
 */
export function scopeOf(actor, area) {
  return grantFor(actor, area).scope;
}

/**
 * Does this role see individual records rather than a whole branch?
 *
 * A list cannot answer `granted` or `assigned` with a branch condition — it
 * has to narrow to named records — so the list screens ask this before
 * building their query. Asking it here rather than comparing `scopeOf()` to a
 * string keeps the three client lists from disagreeing about what the scope
 * names mean.
 *
 * @param {Actor} actor
 * @param {string} area
 * @returns {boolean}
 */
export function seesOnlyOwnRecords(actor, area) {
  return ["assigned", "granted", "own"].includes(scopeOf(actor, area));
}

/**
 * The whole matrix in words, for the read-only permissions screen.
 *
 * `MATRIX` itself stays private: a screen only needs to read it, and an
 * exported object is one `MATRIX.clients.intern = [...]` away from a
 * permission change nobody reviewed.
 *
 * @returns {{area: string, label: string, roles: Record<string, {level: string, scope: string, words: string}>}[]}
 */
/**
 * Why this person may not do this, in a sentence to put under the button
 * (P3-8).
 *
 * Spec §2's rule is that permission is enforced on the server and that hiding
 * a button is not security. That rule says nothing about what the screen
 * should do with a control somebody may not use, and the build chose to hide
 * it — so an employee opening a job in review saw no Approve button and had
 * no way to learn whether that was the rule or a bug.
 *
 * The prototype shows the control **disabled with the reason**. This is where
 * that reason comes from, read off the same matrix `can()` reads, so a screen
 * can never explain a rule that is not the rule.
 *
 * Returns `null` when the person may go ahead.
 *
 * @param {Actor} actor
 * @param {Action} action
 * @param {string} area
 * @param {Target} [target]
 * @returns {string|null}
 */
export function whyNot(actor, action, area, target) {
  if (can(actor, action, area, target)) return null;

  if (!actor || actor.active === false) return "You are not signed in.";
  if (actor.kind === "client") return "This is a staff screen.";

  const { level, scope } = grantFor(actor, area);
  const thing = (AREA_LABELS[area] ?? area).toLowerCase();

  // the role is not senior enough for this at all
  if (LEVEL[level] < LEVEL[action]) {
    const allowed = ROLES.filter(
      (role) => LEVEL[(MATRIX[area]?.[role] ?? ["none"])[0]] >= LEVEL[action],
    ).map((role) => ROLE_LABELS[role]);

    const who = allowed.length
      ? ` Only ${listOut(allowed)} can.`
      : " Nobody's role allows it.";
    return `Your role (${ROLE_LABELS[actor.role]}) cannot ${VERBS[action]} ${thing}.${who}`;
  }

  // senior enough, but this particular record is out of reach
  return (
    SCOPE_REFUSALS[scope] ?? `This ${thing} record is outside your access.`
  );
}

/** What each level is called when it is refused, as a verb. */
const VERBS = {
  view: "open",
  edit: "change",
  approve: "approve",
  none: "touch",
};

/** Why one record is out of reach, when the role itself is not the problem. */
const SCOPE_REFUSALS = {
  branch: "This belongs to a branch you are not assigned to.",
  team: "This is outside your own team.",
  assigned:
    "You are neither the assignee nor the reviewer on this, so it is not yours to change.",
  granted:
    "You reach a client through work on your desk or a grant from a CA, and you have neither for this one.",
  own: "This is somebody else's record.",
  none: "Your role has no access to this at all.",
};

/** "a Partner", "a Partner or a CA (Manager)", "a Partner, a CA… or …". */
function listOut(items) {
  if (items.length === 1) return `a ${items[0]}`;
  const all = items.map((item) => `a ${item}`);
  return `${all.slice(0, -1).join(", ")} or ${all.at(-1)}`;
}

export function describeMatrix() {
  return AREAS.map((area) => ({
    area,
    label: AREA_LABELS[area] ?? area,
    roles: Object.fromEntries(
      ROLES.map((role) => {
        const [level, scope] = MATRIX[area][role] ?? ["none", "none"];
        const words =
          level === "none"
            ? LEVEL_WORDS.none
            : `${LEVEL_WORDS[level]} ${SCOPE_WORDS[scope]}`.trim();
        return [role, { level, scope, words }];
      }),
    ),
  }));
}
