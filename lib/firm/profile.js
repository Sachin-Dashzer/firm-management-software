// @ts-check

/**
 * The firm's own record: who it is on an invoice, its ICAI numbers, and the
 * policy figures spec section 6 says belong in settings.
 *
 * Kept apart from the Mongoose model so the forms, the PDFs and the tests all
 * read the same shape, and so a client component can import the vocabulary
 * without pulling Mongoose into the browser.
 *
 * **The defaults are what the app said before there was a settings screen.**
 * The firm's name was hardcoded in fifteen files; this is where it lives now,
 * and until somebody saves the screen the answer is exactly what it used to
 * be. Nothing changes under the firm's feet on the day this ships.
 */

export const FIRM_CONSTITUTIONS = ["Proprietorship", "Partnership", "LLP"];

/**
 * Which twelve months a CPE year runs over.
 *
 * The firm says which — **it is not ours to decide.** The rest of this app
 * runs April to March because that is the Indian financial year, but a CPE
 * block is an ICAI matter and CLAUDE.md rule 8 forbids us inventing one.
 */
export const CPE_YEAR_BASES = ["calendar", "financial"];

export const CPE_BASIS_LABELS = {
  calendar: "January to December",
  financial: "April to March",
};

/** @type {Record<string, any>} */
export const FIRM_DEFAULTS = {
  name: "PHMG & Associates",
  tagline: "Chartered Accountants",
  pan: "",
  headOffice: "",
  email: "",
  phone: "",

  // ICAI
  frn: "",
  constitution: "Partnership",
  peerReviewValidTill: null,
  icaiNotes: "",

  // CPE: zero means "the firm has not said", never "nothing is required"
  cpeTargetStructured: 0,
  cpeTargetUnstructured: 0,
  cpeYearBasis: "calendar",

  // spec section 6: working papers kept at least 8 years, configurable
  retentionYears: 8,

  /**
   * The firm's own words (P3-29). Empty means the application's own, which
   * is what it said before this screen existed; the list and the
   * substitution are in `words.js`.
   */
  vocabulary: {},
};

/**
 * Fill in anything the stored document does not carry, so a field added
 * later reads as its default rather than as `undefined` on a PDF.
 *
 * @param {Record<string, any>|null|undefined} stored
 * @returns {Record<string, any>}
 */
export function withDefaults(stored) {
  const out = { ...FIRM_DEFAULTS };
  if (!stored) return out;

  for (const key of Object.keys(FIRM_DEFAULTS)) {
    const value = stored[key];
    // undefined or null means the field was never written — a field added to
    // this list later reads as its default instead of as `undefined` on a
    // PDF. An empty string is an answer: a firm that clears the second line
    // of its letterhead wants no second line, and filling it back in would
    // be the app overruling them.
    if (value !== undefined && value !== null) out[key] = value;
  }

  // except the name, which is the one thing that cannot be blank
  if (!String(out.name ?? "").trim()) out.name = FIRM_DEFAULTS.name;
  return out;
}

/**
 * Has the firm said what its CPE target is?
 *
 * Asked everywhere a target would otherwise be implied, because an unset
 * target must read as "nobody has said" and never as "zero hours needed".
 *
 * @param {{cpeTargetStructured?: number, cpeTargetUnstructured?: number}} firm
 */
export function hasCpeTarget(firm) {
  return (
    (firm.cpeTargetStructured ?? 0) > 0 || (firm.cpeTargetUnstructured ?? 0) > 0
  );
}
