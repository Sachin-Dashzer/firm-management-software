// @ts-check

/**
 * Which menu item is the current one (P3-22a).
 *
 * Its own file, with **no imports at all**, because the rail is a client
 * component: anything it reaches that touches `lib/permissions.js` drags
 * that into the browser bundle, which is the mistake P3-6 made with Issues
 * and the build caught by pulling in the Mongoose driver.
 */

const isLabel = (item) => typeof item === "string";

/**
 * Which group and item the current path is in.
 *
 * The query string counts: "Overdue" and "In review" are the same page with
 * a different filter, so the item whose own query matches wins, and the
 * plain page is the fallback. `alsoActive` covers the detail pages that
 * belong to a list.
 *
 * @param {NavGroup[]} groups
 * @param {string} pathname
 * @param {string} [search]  "?due=overdue"
 */
export function activeIn(groups, pathname, search = "") {
  const path = String(pathname ?? "").replace(/\/+$/, "") || "/";
  const query = search.startsWith("?") ? search.slice(1) : search;

  /** @type {{group: string|null, href: string|null}} */
  let best = { group: null, href: null };
  let bestScore = 0;

  for (const group of groups) {
    for (const item of group.items) {
      if (isLabel(item)) continue;
      const [itemPath, itemQuery = ""] = item.href.split("?");
      let score = 0;

      if (itemPath === path) {
        score = itemQuery
          ? itemQuery === query
            ? 4 // same page, same filter
            : 0 // same page, somebody else's filter
          : query
            ? 1 // the unfiltered item, on a filtered page
            : 3; // exactly this page
      } else if (
        (item.alsoActive ?? []).some((prefix) => path.startsWith(prefix))
      ) {
        score = 2;
      }

      if (score > bestScore) {
        bestScore = score;
        best = { group: group.id, href: item.href };
      }
    }
  }

  return best;
}
