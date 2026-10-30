"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";

/**
 * Narrowing a list you are already looking at (D104).
 *
 * **It never goes to the server.** Every list that carries one of these
 * already has its rows in the browser — Issues, the inbox, the to-dos and
 * the notice register are all client components holding the whole visible
 * set — so a `?q=` round trip would add a request, a spinner and a race
 * for each keystroke to do what `Array.filter` does between two frames.
 * It is also why there is no debounce: there is nothing to debounce.
 *
 * It is deliberately **not** the command bar (`⌘K`), which jumps to a
 * record anywhere in the firm. This only hides rows on the screen in
 * front of you, which is why it says so.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(next: string) => void} props.onChange
 * @param {string} [props.label] the placeholder, and the accessible name
 */
export default function SearchBox({
  value,
  onChange,
  label = "Search this list",
  className = "",
}) {
  return (
    <label
      className={`rounded-control border-rule bg-surface focus-within:border-carbon flex h-8 w-full items-center gap-2 border px-2 sm:w-64 ${className}`}
    >
      <MagnifyingGlass
        size={14}
        weight="bold"
        aria-hidden="true"
        className="text-faint shrink-0"
      />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        placeholder={label}
        onChange={(event) => onChange(event.target.value)}
        className="text-13 placeholder:text-faint w-full min-w-0 bg-transparent outline-none"
      />
    </label>
  );
}

/**
 * Does this row match what was typed?
 *
 * Every field the row shows is searchable, because a person typing
 * "Khanna" into a list does not know or care which column the word is in.
 * Nulls are dropped rather than stringified: "null" is a word, and it
 * matches.
 *
 * @param {Array<string|number|null|undefined>} fields
 * @param {string} query
 */
export function matches(fields, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields
    .filter((field) => field != null && field !== "")
    .join(" ")
    .toLowerCase()
    .includes(needle);
}
