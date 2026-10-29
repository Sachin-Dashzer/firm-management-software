// @ts-check

/**
 * The firm's own words (P3-29, from the prototype's Customise screen).
 *
 * Some firms say "Assignment" for a job and "Party" for a client. The
 * prototype offers to rename them and promises that "the logic behind them
 * stays fixed" — which is the whole design here: **this renames labels and
 * nothing else.** No field name, no status value, no URL and no audit
 * entry changes, so a renamed vocabulary cannot break a query, and turning
 * it off puts every word back.
 *
 * **Four nouns, singular and plural separately.** English pluralisation is
 * a trap and the trap is exactly this feature: a firm that renames "client"
 * to "party" does not want "partys". So the firm gives both forms, and a
 * firm that gives only one gets only that one renamed.
 *
 * Kept out of the Mongoose model file so a client component can import the
 * list without pulling Mongoose into the browser, the same reason
 * `profile.js` sits beside it.
 */

/**
 * What can be renamed, and what the application says when nothing is set.
 *
 * The list is fixed and short on purpose. Every word here appears in the
 * menu, which is the one place the substitution is applied (see
 * `applyWords`), so a word nobody would see has no business being offered.
 *
 * @type {{key: string, plural: string, one: string, many: string, what: string}[]}
 */
export const RENAMEABLE = [
  {
    key: "client",
    plural: "clients",
    one: "client",
    many: "clients",
    what: "The people and companies the firm acts for.",
  },
  {
    key: "job",
    plural: "jobs",
    one: "job",
    many: "jobs",
    what: "One service, for one client, for one period.",
  },
  {
    key: "matter",
    plural: "matters",
    one: "matter",
    many: "matters",
    what: "A notice or a case being run with a department.",
  },
  {
    key: "invoice",
    plural: "invoices",
    one: "invoice",
    many: "invoices",
    what: "A bill issued to a client. The GST document itself.",
  },
];

/** Every key the stored vocabulary may carry, singular and plural. */
export const WORD_KEYS = RENAMEABLE.flatMap((row) => [row.key, row.plural]);

/** Nothing set: the application's own words. */
export const WORD_DEFAULTS = Object.fromEntries(
  RENAMEABLE.flatMap((row) => [
    [row.key, row.one],
    [row.plural, row.many],
  ]),
);

/**
 * Which of the firm's words differ from the application's.
 *
 * Only these are substituted, so an unset or identical word costs nothing
 * and the regex below is built from as few alternatives as possible.
 *
 * @param {Record<string, string>|null|undefined} stored
 * @returns {Record<string, string>} default word to the firm's word
 */
export function wordChanges(stored) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of WORD_KEYS) {
    const given = String(stored?.[key] ?? "").trim();
    if (given && given.toLowerCase() !== WORD_DEFAULTS[key]) {
      out[WORD_DEFAULTS[key]] = given;
    }
  }
  return out;
}

/**
 * Put the firm's words into one label.
 *
 * **Plural first.** Replacing "client" before "clients" turns "clients"
 * into "partys", which is the one bug this feature is certain to have if
 * the order is left to chance. The keys are sorted longest first, which
 * puts every plural ahead of its own singular.
 *
 * The capital is carried across, so "Clients" becomes "Parties" and not
 * "parties" — a menu label that loses its capital looks like a mistake
 * nobody can explain.
 *
 * Whole words only: `\b` keeps "Client list" renamed and leaves
 * "Clientele" alone, and more to the point leaves anything that merely
 * contains the letters — an email address, a code, a file name — exactly
 * as it was.
 *
 * @param {string} label
 * @param {Record<string, string>} changes from `wordChanges`
 * @returns {string}
 */
export function applyWords(label, changes) {
  const keys = Object.keys(changes);
  if (keys.length === 0) return label;

  const pattern = new RegExp(
    `\\b(${keys.sort((a, b) => b.length - a.length).join("|")})\\b`,
    "gi",
  );

  return label.replace(pattern, (found) => {
    const word = changes[found.toLowerCase()];
    if (!word) return found;
    /* The case of the word that was there wins, not the case the firm
       typed into the settings box: "All open jobs" must become "all open
       assignments" mid-sentence even though the firm wrote "Assignment",
       and "Clients" at the head of a menu group must keep its capital. */
    const capital = found[0] === found[0].toUpperCase();
    return capital
      ? word[0].toUpperCase() + word.slice(1)
      : word[0].toLowerCase() + word.slice(1);
  });
}
