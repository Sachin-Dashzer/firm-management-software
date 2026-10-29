// @ts-check

import { menuFor } from "../nav/tree.js";

/**
 * What this product covers, and what it does not (P3-22d).
 *
 * The covered half is **derived from the menu** — `lib/nav/tree.js` is
 * already the one file that names a screen, so a coverage page with its own
 * list of features would be a second inventory, and the second inventory is
 * always the one that lies.
 *
 * The not-covered half cannot be derived from anything: a thing that does
 * not exist leaves no trace in the code. So it is written out here, with
 * the reason and where the decision was recorded, and a test keeps the
 * routes in it honest. **Being on this list is not a defect.** Most of it
 * is work deliberately not done — because a decision is outstanding,
 * because a phase has not started, or because building it would have been
 * worse than leaving it out.
 */

/**
 * @typedef {object} Gap
 * @property {string} title
 * @property {string} why
 * @property {string} [route]  the route that exists and says so
 * @property {"decision"|"later"|"declined"} kind
 */

/** @type {Gap[]} */
export const NOT_COVERED = [
  {
    title: "WhatsApp to clients",
    why: "Spec section 18 has been unanswered since Step 0: no WhatsApp Business provider has been chosen, and a messaging channel built against a provider nobody picked is work that gets thrown away.",
    route: "/client-experience",
    kind: "decision",
  },
  {
    title: "Time against jobs, and a timesheet",
    why: "Spec section 9 puts time tracking in Phase 2. It needs a collection of its own and a daily habit from everybody, so it is a step rather than a screen.",
    route: "/team/time",
    kind: "later",
  },
  {
    title: "Sampling and vouching",
    why: "Choosing a sample, recording what was vouched and what came back. The audit studio records the exceptions that come out of it (P3-13); the sampling itself is a feature with its own plan.",
    route: "/practice/sampling",
    kind: "later",
  },
  {
    title: "Trial balance to financial statements",
    why: "A TB in, the statements out, with the firm's own groupings. The data lab reads a spreadsheet and profiles it (P3-20a), which is as far as this goes today.",
    route: "/practice/tb",
    kind: "later",
  },
  {
    title: "The firm's own words and custom fields",
    why: "Renaming what the system calls things, and adding fields of the firm's own, both change the data model. They need the owner's decision before anything is built.",
    route: "/settings/customise",
    kind: "decision",
  },
  {
    title: "Switching modules off",
    why: "Proposed by the prototype and recommended against (27-10-2026): a five-person firm hiding screens from itself gains nothing, and switching a module off would hide work that is already built and untested. If it is wanted, the honest version hides menu entries only and never the routes.",
    route: "/settings/modules",
    kind: "declined",
  },
  {
    title: "Repeating to-dos",
    why: "A to-do that comes back every Monday has to be written again (P3-22c). Generated to-dos nobody ticks pile up, and a firm of five is better served by writing the line again.",
    kind: "declined",
  },
  {
    title: "Timesheet-based reports",
    why: "Utilisation, realisation, client profitability and intern exposure all read time entries, so they wait on time tracking. The reports index says so rather than listing them empty.",
    kind: "later",
  },
  {
    title: "Storybook and a Figma token file",
    why: "Spec section 15 asks for every component built in Storybook against a Figma file. Neither exists: these are the two process items of section 15 that have not been met, and they were raised before Phase 2.",
    kind: "later",
  },
  {
    title: "A client portal that writes",
    why: "A client can answer a document request, ask for a change and promise a payment (P3-2, P3-3). They cannot edit their own record, pay online or raise a query as a ticket — each of those is a decision about what a client may do unsupervised.",
    kind: "decision",
  },
];

/** What a gap's kind is called on screen. */
export const GAP_WORDS = {
  decision: "waiting on a decision",
  later: "a later phase",
  declined: "deliberately not built",
};

/**
 * The covered half, group by group, from the menu this person has.
 *
 * It counts links rather than listing them again: the menu is on screen a
 * click away, and a second copy of 58 labels is a second thing to keep
 * right.
 *
 * @param {object} actor
 * @param {Record<string, boolean>} [modules] the firm's module switches
 */
export function coveredGroups(actor, modules) {
  return menuFor(actor, modules).map((group) => ({
    id: group.id,
    label: group.label,
    screens: group.items.filter((item) => typeof item !== "string").length,
  }));
}

/** One line for the top: how much there is. */
export function coverageTotals(groups) {
  return {
    groups: groups.length,
    screens: groups.reduce((sum, group) => sum + group.screens, 0),
    gaps: NOT_COVERED.length,
  };
}
