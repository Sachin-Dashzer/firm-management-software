// @ts-check

/**
 * What a Client Access Grant can open, and how far each role may ever be
 * opened (owner decision D3, 19-10-2026).
 *
 * Pure and dependency-free, so the Mongoose model, the grant form, the server
 * actions and the tests all read the same lists — and so importing it from
 * `models/ClientAccess.js` cannot create a cycle back through the models.
 */

/** @typedef {"profile"|"identifiers"|"credentials"|"engagements"|"documents"|"billing"|"notes"} Section */

export const SECTIONS = [
  "profile",
  "identifiers",
  "credentials",
  "engagements",
  "documents",
  "billing",
  "notes",
];

export const SECTION_LABELS = {
  profile: "Profile and contacts",
  identifiers: "Statutory IDs (PAN, Aadhaar, TAN, bank)",
  credentials: "Portal logins (the credentials vault)",
  engagements: "Engagements",
  documents: "Documents",
  billing: "Invoices, payments and the ledger",
  notes: "Notes and the communication log",
};

/**
 * The widest a grant to each role may ever be.
 *
 * **`credentials` and `billing` are in no ceiling below CA.** That is the
 * owner's decision of 19-10-2026 made structural rather than enforced by a
 * validation rule: there is no value of `sections` a server will store that
 * opens the credentials vault or the fees to an employee or an intern, so the
 * grant form has nothing to get wrong and a later relaxation of some check
 * cannot quietly open them.
 *
 * An intern is narrower again, because spec section 2 keeps statutory IDs away
 * from articled interns altogether.
 */
export const CEILING = {
  partner: SECTIONS,
  ca: SECTIONS,
  employee: ["profile", "identifiers", "engagements", "documents", "notes"],
  intern: ["profile", "engagements", "documents", "notes"],
  // the accounts person works from the billing screens, not from grants
  accounts: [],
};

/** What an assignment gives on its own, with no grant at all (spec section 2). */
export const ASSIGNMENT_SECTIONS = ["profile", "engagements", "documents"];

/**
 * Why a section is out of reach for a role. Shown next to the disabled tick
 * box in the grant drawer, and returned by the server when it refuses one, so
 * the answer is the same in both places.
 *
 * @param {string} role
 * @param {string} section
 * @returns {string}
 */
export function refusalFor(role, section) {
  if (!SECTIONS.includes(section)) return "Not a section of the client file.";
  if (section === "credentials") {
    return "The credentials vault is never opened by a grant — only a CA or a Partner reaches it.";
  }
  if (section === "billing") {
    return "Fees and invoices are not granted to staff below a CA.";
  }
  if (section === "identifiers" && role === "intern") {
    return "Spec section 2 keeps statutory IDs away from articled interns.";
  }
  if (role === "accounts") {
    return "The accounts role works from the billing screens, not from grants.";
  }
  return "Above what this role may be granted.";
}

/**
 * Cut a requested section list down to what the role may hold, and say what
 * was dropped and why.
 *
 * The server calls this before storing a grant, and the form calls it to
 * decide which tick boxes to disable — one answer, two places, so the UI can
 * never offer something the server then refuses.
 *
 * @param {string} role
 * @param {string[]} sections
 * @returns {{ allowed: string[], refused: {section: string, why: string}[] }}
 */
export function capSections(role, sections = []) {
  const ceiling = CEILING[role] ?? [];
  const allowed = [];
  const refused = [];

  for (const section of sections) {
    if (allowed.includes(section)) continue; // a repeated tick is not an error
    if (ceiling.includes(section)) allowed.push(section);
    else refused.push({ section, why: refusalFor(role, section) });
  }

  // keep them in the canonical order, so two grants with the same sections
  // read the same and the audit diff does not report a reshuffle as a change
  return {
    allowed: SECTIONS.filter((section) => allowed.includes(section)),
    refused,
  };
}
