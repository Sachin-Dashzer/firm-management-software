// @ts-check

import { can, ROLES, ROLE_LABELS } from "../permissions.js";

/**
 * How the firm does things, screen by screen (P3-19).
 *
 * The prototype ships a written procedure for every screen and five
 * playbooks with worked examples. **None of that content is in here**, and
 * that is the decision, not an omission: a procedure telling PHMG's staff
 * how PHMG does GST, written from a design file by somebody who has never
 * worked there, is worse than no procedure — because people follow it.
 *
 * So this is the shelf. An unwritten procedure says nobody has written it,
 * names who could, and offers the box. The same stance the notice-law table
 * takes (D48): the structure is the system's, the words are the firm's.
 *
 * Pure. What it decides is which screen you are on, who may do the work it
 * describes, and whether what was written has gone stale.
 */

/**
 * The screens worth a procedure, with the permission area that governs the
 * work done on them.
 *
 * `area` is **not** a second copy of who may do the work — it is a pointer
 * at the matrix, so the panel reads the same rule the server enforces and
 * the two can never drift. A handbook that says an intern may file is the
 * kind of thing nobody notices until an intern tries.
 */
export const SCREENS = [
  {
    key: "clients.new",
    label: "Taking on a client",
    path: "/clients/new",
    area: "clients",
  },
  {
    key: "clients.import",
    label: "Importing a client list",
    path: "/clients/import",
    area: "clients",
  },
  {
    key: "clients.roundTrip",
    label: "Correcting clients from a sheet",
    path: "/clients/round-trip",
    area: "clients",
  },
  {
    key: "clients.record",
    label: "A client's record",
    path: "/clients/[id]",
    area: "clients",
  },
  {
    key: "engagements.new",
    label: "Creating work",
    path: "/engagements/new",
    area: "engagementsCreate",
  },
  {
    key: "engagements.work",
    label: "Doing a job",
    path: "/engagements/[id]",
    area: "engagementsWork",
  },
  {
    key: "engagements.review",
    label: "Reviewing and approving",
    path: "/engagements",
    area: "engagementsReview",
  },
  {
    key: "calendar",
    label: "The compliance calendar",
    path: "/calendar",
    area: "compliance",
  },
  {
    key: "documents",
    label: "Documents and the file",
    path: "/documents",
    area: "documents",
  },
  {
    key: "invoices.new",
    label: "Raising an invoice",
    path: "/invoices/new",
    area: "invoices",
  },
  {
    key: "invoices.receivables",
    label: "Chasing money",
    path: "/billing",
    area: "invoices",
  },
  {
    key: "practice.notices",
    label: "Answering a notice",
    path: "/practice/notices",
    area: "practice",
  },
  {
    key: "practice.certificates",
    label: "Issuing a certificate",
    path: "/practice/certificates",
    area: "udin",
  },
  {
    key: "practice.audit",
    label: "An audit file",
    path: "/practice/audit",
    area: "practice",
  },
  {
    key: "team.plan",
    label: "Planning the week",
    path: "/team/plan",
    area: "team",
  },
  { key: "issues", label: "Working from Issues", path: "/issues", area: null },
];

/**
 * Which screen a URL is on, or null.
 *
 * Longest path first, so `/clients/import` is itself and not the client
 * record pattern — and an unknown screen is **null**, never a near miss.
 * Showing the wrong procedure is the one failure worse than showing none.
 *
 * @param {string} pathname
 * @returns {string|null}
 */
export function screenKeyFor(pathname) {
  const path = String(pathname ?? "").replace(/\/+$/, "") || "/";

  const exact = SCREENS.find((screen) => screen.path === path);
  if (exact) return exact.key;

  /** `/clients/<id>` and anything under it, but never `/clients` itself. */
  const id = /^\/clients\/[0-9a-f]{24}/.test(path)
    ? "clients.record"
    : /^\/engagements\/[0-9a-f]{24}/.test(path)
      ? "engagements.work"
      : /^\/practice\/audit\/[0-9a-f]{24}/.test(path)
        ? "practice.audit"
        : null;
  if (id) return id;

  // a deeper page under a screen that has one: /practice/notices/new
  const under = SCREENS.filter(
    (screen) => screen.path !== "/" && path.startsWith(`${screen.path}/`),
  ).sort((a, b) => b.path.length - a.path.length)[0];

  return under?.key ?? null;
}

/** @param {string} key */
export function screenFor(key) {
  return SCREENS.find((screen) => screen.key === key) ?? null;
}

/**
 * Which roles may do the work this screen is about, read from the matrix
 * rather than typed into the procedure.
 *
 * @param {string|null} area
 * @param {"view"|"edit"|"approve"} [action]
 * @returns {string[]} role labels
 */
export function rolesAllowed(area, action = "edit") {
  if (!area) return ROLES.map((role) => ROLE_LABELS[role]);
  return ROLES.filter((role) =>
    can({ id: "x", role, branchIds: [], active: true }, action, area, {}),
  ).map((role) => ROLE_LABELS[role]);
}

/** Writing is a CA's or a partner's; reviewing one is a partner's. */
export function mayWrite(actor) {
  return actor?.role === "partner" || actor?.role === "ca";
}

export function mayReview(actor) {
  return actor?.role === "partner";
}

/** A year. A handbook true in 2026 and silently wrong in 2028 is the failure. */
export const STALE_AFTER_DAYS = 365;

/**
 * @param {{reviewedAt?: Date|string|null}} procedure
 * @param {Date} [now]
 */
export function isStale(procedure, now = new Date()) {
  if (!procedure) return false;
  if (!procedure.reviewedAt) return true;
  const days =
    (now.getTime() - new Date(procedure.reviewedAt).getTime()) / 86_400_000;
  return days > STALE_AFTER_DAYS;
}

/**
 * The shelf, as the roadmap screen shows it: every screen, with whether
 * anybody has written it.
 *
 * @param {Array<{key: string, reviewedAt?: Date|string|null, steps?: any[]}>} written
 * @param {Date} [now]
 */
export function roadmap(written, now = new Date()) {
  const byKey = new Map(written.map((row) => [row.key, row]));

  return SCREENS.map((screen) => {
    const procedure = byKey.get(screen.key);
    return {
      ...screen,
      written: Boolean(procedure),
      steps: procedure?.steps?.length ?? 0,
      stale: procedure ? isStale(procedure, now) : false,
    };
  });
}
