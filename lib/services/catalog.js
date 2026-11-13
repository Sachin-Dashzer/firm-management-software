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
  /* one-off work raised from /engagements/new, which has to land somewhere
     real: an engagement is always a service, and a service always has a
     category (02-11-2026) */
  "Other",
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

/**
 * What a checklist row actually asks somebody to **do** (owner, 12-11-2026).
 *
 * Every row used to mean the same thing: a document, uploaded, accepted by a
 * person. Half of what a step needs is not that. "Confirm the client's email
 * is current" is a tick. "Generate the UDIN" happens on another screen. An
 * engagement letter is something the firm writes from its own template. All
 * three were being written as documents nobody would ever upload, so each sat
 * Pending for ever and held its step shut.
 *
 * `upload` is the default and is exactly what every row written before this
 * field meant, so nothing already saved changes.
 */
export const ITEM_KINDS = ["upload", "tick", "link", "doc"];

/**
 * Short enough to read inside a row's own column (12-11-2026). The
 * sentence that explains each one is `ITEM_KIND_HINTS`, under the picker;
 * a label that has to be truncated to fit has stopped being a label.
 */
export const ITEM_KIND_LABELS = {
  upload: "Document",
  tick: "Tick to confirm",
  link: "Another screen",
  doc: "Create from a template",
};

/** The one line under the picker, so the choice is made once and correctly. */
export const ITEM_KIND_HINTS = {
  upload: "A file arrives, and somebody at the firm accepts it.",
  tick: "No file. Whoever is on the step says it is done.",
  link: "A button through to the screen where the work really happens.",
  doc: "Written from one of the firm's templates on the job, edited there, and saved into the job's files. Name the template here, or leave it open and let whoever is on the job pick.",
};

/**
 * Where a `link` row sends somebody.
 *
 * A closed list rather than a typed-in address. An address typed into the
 * catalog once is an address nobody checks again: it outlives the page being
 * renamed, and the first to find out is whoever clicks it at nine in the
 * evening. Everything here is a route this application actually serves, and
 * the client and the job are filled in where the screen accepts them.
 */
export const ITEM_LINKS = [
  {
    key: "udin",
    label: "The UDIN register",
    href: ({ clientId, engagementId }) =>
      `/practice/udin?new=1&client=${clientId}&engagement=${engagementId}`,
  },
  { key: "gst-cycle", label: "The GST cycle", href: () => "/gst-cycle" },
  {
    key: "certificate",
    label: "A new certificate",
    href: ({ clientId }) => `/practice/certificates/new?client=${clientId}`,
  },
  {
    key: "notice",
    label: "A new notice reply",
    href: ({ clientId }) => `/practice/notices/new?client=${clientId}`,
  },
  {
    key: "dsc",
    label: "The DSC register",
    href: ({ clientId }) => `/practice/dsc?client=${clientId}`,
  },
  {
    key: "invoice",
    label: "A new invoice",
    href: ({ clientId }) => `/invoices/new?client=${clientId}`,
  },
  { key: "tb", label: "Trial balances", href: () => "/practice/tb" },
  { key: "audit-file", label: "The audit file", href: () => "/practice/audit" },
];

export const ITEM_LINK_KEYS = ITEM_LINKS.map((row) => row.key);

/**
 * The destination of a `link` row, resolved for one job.
 *
 * @param {string} key
 * @param {{clientId?: string, engagementId?: string}} [ctx]
 * @returns {{key: string, label: string, href: string} | null}
 */
export function itemLink(key, ctx = {}) {
  const found = ITEM_LINKS.find((row) => row.key === key);
  if (!found) return null;
  return {
    key: found.key,
    label: found.label,
    href: found.href({
      clientId: ctx.clientId ?? "",
      engagementId: ctx.engagementId ?? "",
    }),
  };
}

/**
 * What a step *is*, beyond its name (owner request, 12-11-2026).
 *
 * `""` is ordinary work — a step somebody does and ticks. `udin` is the step
 * that carries the UDIN: the question, the way into the register, and the
 * refusal to close until a number is actually recorded.
 *
 * It replaces the service-wide "a UDIN is required" box, which said *that* a
 * number was needed and never *when* it was wanted. A firm that puts
 * "Generate UDIN" between the partner's review and signing has said both.
 */
export const STEP_KINDS = ["", "udin"];

export const STEP_KIND_LABELS = {
  "": "Ordinary work",
  udin: "The UDIN step",
};

/** A service needs a UDIN exactly when one of its steps is the UDIN step. */
export const needsUdin = (steps) =>
  (steps ?? []).some((step) => step?.kind === "udin");

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
 * Compare only what matters: an item's text, side, flag, role floor and
 * the step it belongs to, in order.
 *
 * A step's `minRole` counts — changing who may do a step changes what the
 * work is. So does `stepIndex` (03-11-2026): moving "Bank statements" from
 * "Collect data" to "Prepare the computation" changes when the job asks
 * the client for it, which is a change to the definition of the work and
 * earns a new version like the lists themselves.
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
          item.stepIndex ?? "",
          /* What the row asks for, where it sends somebody, and which
             template it is drafted from. Changing any of the three changes
             what the work is, exactly as renaming the row does — and a
             step's `kind` is how the firm now says a UDIN is required at
             all (12-11-2026). */
          item.kind ?? "",
          item.linkTo ?? "",
          item.docTemplateId ? String(item.docTemplateId) : "",
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

/**
 * The same steps and checklist with the step at `index` taken out.
 *
 * Removing a step is not removing one array element, because an item's
 * `stepIndex` is a **position**: every step after the gap moves down one,
 * and every item pointing past the gap has to move with it. An item on the
 * step being removed has nowhere to point, so it falls back to `null` —
 * belonging to the job rather than to a step, which is what every item
 * meant before `stepIndex` existed and is how the screens already draw it.
 *
 * Pure, so the catalog form, a migration and a test all get the same
 * answer. The caller decides whether that is a new version
 * (`bumpsVersion`) and writes the audit entry.
 *
 * @param {{steps?: any[], checklist?: any[]}} template
 * @param {number} index
 */
export function withoutStep(template, index) {
  const steps = (template.steps ?? []).filter((_, at) => at !== index);
  const checklist = (template.checklist ?? []).map((item) => {
    const at = item.stepIndex;
    if (at == null || at < index) return item;
    return { ...item, stepIndex: at === index ? null : at - 1 };
  });
  return { steps, checklist };
}
