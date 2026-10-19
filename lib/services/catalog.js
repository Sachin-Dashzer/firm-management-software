// @ts-check

/**
 * The shapes and rules of the service catalog (spec section 4).
 *
 * Kept apart from the Mongoose model so the form, the seed script and the
 * tests all read the same lists, and so the starter catalog data in
 * `starter.js` is not loaded on every request.
 */

/** @typedef {"L1"|"L2"|"L3"} Level */

export const SERVICE_CATEGORIES = [
  "Direct Tax",
  "Indirect Tax",
  "Audit and Assurance",
  "Company Law / ROC",
  "Accounting",
  "Payroll and Labour",
  "Advisory",
  "Registrations",
  "Certification",
];

export const SERVICE_LEVELS = ["L1", "L2", "L3"];

/**
 * The firm's own words for the three levels (owner decision D4, 19-10-2026).
 *
 * **The stored value does not change.** `L1`, `L2` and `L3` are what every
 * `serviceTemplates.level` holds and what every engagement's
 * `templateSnapshot` copied, and rewriting them would mean touching work
 * already in progress for a relabelling. So the letters are a presentation
 * layer over the levels, and this map is the only place the two meet.
 */
export const TIER_OF = { L3: "A", L2: "B", L1: "C" };

/** The reverse, for filters and reports that are given a letter. */
export const LEVEL_OF = { A: "L3", B: "L2", C: "L1" };

export const TIERS = ["A", "B", "C"];

export const TIER_LABELS = {
  A: "A · CA only",
  B: "B · CA-supervised",
  C: "C · Routine",
};

/** The rule each tier states, in the owner's words. */
export const TIER_RULES = {
  A: "Most crucial work. Only a CA or a Partner executes it; a Partner reviews.",
  B: "Mid-level work. An employee executes it under a CA's review.",
  C: "Routine work. An intern or employee executes it; a CA signs it off.",
};

/** @param {string} level `L1`–`L3`, or a tier letter already */
export function tierOf(level) {
  return TIER_OF[level] ?? (TIERS.includes(level) ? level : null);
}

/** The tier label for a stored level, for a table cell or a badge. */
export function tierLabel(level) {
  const tier = tierOf(level);
  return tier ? TIER_LABELS[tier] : "";
}

/** Roles that can be asked to execute work, weakest first. */
export const EXEC_ROLES = ["intern", "employee", "ca", "partner"];

/**
 * Roles that can sign work off. Only a CA or a Partner may mark an engagement
 * Completed (spec section 5), so the list stops there — an employee can never
 * be the checker, whatever the template says.
 */
export const REVIEW_ROLES = ["ca", "partner"];

/** The defaults each complexity level implies, before anyone edits them. */
export const LEVEL_DEFAULTS = {
  L1: { minExecRole: "intern", minReviewRole: "ca" },
  L2: { minExecRole: "employee", minReviewRole: "ca" },
  L3: { minExecRole: "ca", minReviewRole: "partner" },
};

export const RECURRENCES = [
  "one-time",
  "monthly",
  "quarterly",
  "half-yearly",
  "annual",
];

export const RECURRENCE_LABELS = {
  "one-time": "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  "half-yearly": "Half-yearly",
  annual: "Annual",
};

/**
 * Changing any of these changes what the work *is*, so the version goes up and
 * anyone looking at an older engagement can see it was started from an earlier
 * definition. Everything else — the name, the fee, the SAC code — is a
 * correction, and the audit log already records it.
 */
export const VERSIONED_FIELDS = [
  "level",
  "minExecRole",
  "minReviewRole",
  "turnaroundDays",
  "recurrence",
  "udinRequired",
  "checklist",
  "steps",
];

/**
 * Compare only what matters: an item's text, side, flag and role floor, in
 * order. A step's `minRole` counts — changing who may do a step changes what
 * the work is, so it earns a new version like the step list itself.
 */
function signature(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        [
          item.name,
          item.side ?? "",
          item.mandatory ?? "",
          item.minRole ?? "",
        ].join("\u0000"),
      )
      .join("\u0001");
  }
  return String(value ?? "");
}

/**
 * Should saving these changes bump the template's version?
 *
 * @param {Record<string, unknown>} before the stored template
 * @param {Record<string, unknown>} after what is being saved
 * @returns {boolean}
 */
export function bumpsVersion(before, after) {
  return VERSIONED_FIELDS.some(
    (field) =>
      field in after && signature(before[field]) !== signature(after[field]),
  );
}

/**
 * A role is allowed to execute if it is at least the template's minimum.
 * @param {string} role
 * @param {string} minExecRole
 */
export function canExecute(role, minExecRole) {
  return EXEC_ROLES.indexOf(role) >= EXEC_ROLES.indexOf(minExecRole);
}

/**
 * @param {string} role
 * @param {string} minReviewRole
 */
export function canReview(role, minReviewRole) {
  const order = ["ca", "partner"];
  return order.indexOf(role) >= order.indexOf(minReviewRole);
}

/**
 * How the delivery date is decided, for display.
 * @param {{turnaroundDays: number|null, turnaroundNote?: string}} template
 */
export function turnaroundLabel(template) {
  if (typeof template.turnaroundDays === "number") {
    return `${template.turnaroundDays} working ${
      template.turnaroundDays === 1 ? "day" : "days"
    }`;
  }
  return template.turnaroundNote || "Not set";
}
