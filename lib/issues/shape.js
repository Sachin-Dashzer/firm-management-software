// @ts-check

import { can } from "../permissions.js";

/**
 * The parts of Issues that only shape and sort rows (P3-6).
 *
 * Separate from `list.js` for one hard reason: the Issues screen is a
 * client component and needs the labels, and `list.js` imports Mongoose
 * models. Importing it from the browser bundles the whole MongoDB driver
 * and the build refuses. Nothing here touches the database.
 */

/** 3 is "today or it bites", 1 is "this week". */
export const SEVERITY_LABELS = { 3: "Urgent", 2: "Today", 1: "This week" };

/** Display order of the groups, worst-first within each. */
export const KINDS = [
  "Deadlines",
  "Review",
  "Client confirmation",
  "Filing",
  "Uploads",
  "Waiting on clients",
  "Money",
  "Registers",
  "Client data",
];

/**
 * Who a row belongs to.
 *
 * A person's id where there is one, or a stand-in: "partner" for a decision
 * only a partner may take, "accounts" for the billing desk, and null for
 * "whichever manager sees it first", which is the prototype's own fallback.
 */
export const PARTNER = "partner";
export const ACCOUNTS = "accounts";

/**
 * Does this row count as this person's?
 *
 * The rule the prototype uses, which matters because "Mine" is the default
 * view for everybody except a partner: a named owner means you, a
 * partner-owned row means you if you are one, an accounts row means you if
 * you may bill, and an unowned row falls to the managers.
 *
 * **And a row owned by somebody you are covering for is yours** (P3-16).
 * This is the one place ownership is decided, so cover goes in here and
 * nowhere else — `actor.covering` is the list of people whose work this
 * person holds today, which the page loads from the leave rows. A cover
 * never widens *access*: a row only reaches this function if the reader
 * could already see the record it came from.
 */
export function isMine(row, actor) {
  if (!row.ownerId) return actor.role === "partner" || actor.role === "ca";
  if (row.ownerId === PARTNER) return actor.role === "partner";
  if (row.ownerId === ACCOUNTS) return can(actor, "edit", "invoices");
  if (String(row.ownerId) === String(actor.id)) return true;
  return (actor.covering ?? []).some(
    (id) => String(id) === String(row.ownerId),
  );
}

/** Filter and sort for the screen. */
export function filterIssues(rows, { who = "mine", kind = "" }, actor) {
  return rows
    .filter((row) => (who === "all" ? true : isMine(row, actor)))
    .filter((row) => (kind ? row.kind === kind : true))
    .sort(
      (a, b) =>
        b.severity - a.severity ||
        KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
        a.text.localeCompare(b.text),
    );
}

/** `{ kind: count }` for the filter buttons, over whatever is visible. */
export function countByKind(rows) {
  const counts = {};
  for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  return counts;
}
