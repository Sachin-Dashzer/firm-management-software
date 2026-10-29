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
    title: "Custom fields",
    why: "A field of the firm's own, with a name, a type and a screen to live on. It is not a setting: it has to be stored, indexed, exported, audited, shown on a form and validated, and a list field needs its list stored too. The firm's own words for client, job, matter and invoice are built (P3-29); the fields are a change to the data model and need the owner's decision.",
    route: "/settings/customise",
    kind: "decision",
  },
  {
    title: "Client portal branding",
    why: "A colour of the firm's own on the portal. The portal reads the same design tokens as everything else, so a second palette means a second set of contrast checks on every screen a client sees — and a brand colour that does not clear 4.5:1 against white cannot be used as text.",
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
    title: "Time reports in Excel and PDF",
    why: "Utilisation, realisation, client profitability and the unfilled days are all on the timesheet screen (P3-28), but none of them is in the reports index, so none exports. They were waiting on time tracking and are now waiting only on being written as reports.",
    route: "/team/time",
    kind: "later",
  },
  {
    title: "A cash flow statement, and the ratios",
    why: "The balance sheet and the profit and loss are built from the mapped trial balance (P3-32). AS 3 needs the opening balance sheet as well as the closing one, and Schedule III's ratios need the prior year's figures beside this year's — both mean reading the previous set, not only its mapping.",
    route: "/practice/tb",
    kind: "later",
  },
  {
    title: "Ageing schedules, and the MSME split",
    why: "Trade receivables and payables ageing need invoice-level data the trial balance does not carry. For the firm's own clients that data is in this application; for anybody else's books it is a second import.",
    route: "/practice/tb",
    kind: "later",
  },
  {
    title: "Writing the notes themselves",
    why: "The notes builder says which notes this company needs and the authority for each (P3-32). It does not draft them: the wording of a note is the firm's own judgement about this company, and this application will not write sentences into a statement somebody is going to sign.",
    route: "/practice/tb",
    kind: "declined",
  },
  {
    title: "Stratified sampling",
    why: "Sampling a population in bands — everything over a lakh at one rate and the rest at another — is common and is not built (P3-30). The key-item threshold, which takes everything above a figure in full, covers the commonest case of it.",
    route: "/practice/sampling",
    kind: "later",
  },
  {
    title: "A manual payment reminder",
    why: 'The accounts desk performs its own decisions (P3-31) but has no "remind now". Reminders are planned by rule and deduplicated by a unique index, so a button would either be refused as a duplicate or become a second, unrecorded cadence running beside the firm\'s own.',
    route: "/billing/desk",
    kind: "declined",
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
