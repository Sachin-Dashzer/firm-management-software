// @ts-check

/**
 * Small pieces of English the app has to get right in front of a client.
 */

/**
 * "a" or "an", decided by how the next word is said (QA 09-11-2026, #30).
 *
 * The onboarding checks read "4th character 'P' is a Individual", which is
 * the sort of thing that makes a careful firm doubt the rest of the screen.
 *
 * Sound, not spelling: it is "an hour" and "a European". The exceptions
 * are the handful this app can actually produce — the entity types, the
 * PAN holder types and the words around them — rather than a dictionary
 * nobody will maintain.
 *
 * @param {string} word the word that follows
 * @returns {"a"|"an"}
 */
export function article(word) {
  const first = String(word ?? "")
    .trim()
    .split(/\s+/)[0];
  if (!first) return "a";

  const lower = first.toLowerCase();

  // said with a consonant although they start with a vowel
  if (/^(one|once|unit|union|unique|user|usual|uk|european)/.test(lower)) {
    return "a";
  }
  // said with a vowel although they start with a consonant
  if (
    /^(hour|honest|honour|honor|heir|llp|hr|mba|rbi|sme|ngo|fcra)\b/.test(lower)
  ) {
    return "an";
  }

  return /^[aeiou]/.test(lower) ? "an" : "a";
}

/**
 * The word with its article: `an Individual`, `a Company`.
 * @param {string} word
 */
export function withArticle(word) {
  return `${article(word)} ${word}`;
}
