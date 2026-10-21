// @ts-check

import { startOfISTDay, formatISTDate, istParts } from "../dates.js";
import { ACTIONS } from "./index.js";

/**
 * The Portal log screen's vocabulary and arithmetic (P2-10a).
 *
 * "Audit log" became **Portal log** in the words and the route only (owner
 * decision D8). Everything underneath — the `auditLogs` collection, the
 * hash chain, `ACTIONS`, the `auditLog` permission key — is unchanged,
 * because the log is append-only and chained and moving it would break
 * `verifyAuditChain()`.
 *
 * Kept apart from the page so the quick filters, the day grouping and the
 * record-type list are testable without a database or a browser.
 */

/**
 * Every kind of record the log can hold an entry about.
 *
 * **Derived, not typed out.** The screen's filter used to carry a literal
 * list of seven written in Step 2; by P2-9 the log also held `Udin`, `Dsc`,
 * `DocTemplate`, `GeneratedDoc`, `ClientUser`, `ClientAccess`, `Comment`
 * and `FirmSettings`, and none of them could be filtered for — a partner
 * asking "who has been into the portal accounts" could not ask it. The
 * list now comes from the log itself, so it cannot go stale again.
 *
 * @param {string[]} seen the distinct entityTypes actually in the log
 * @returns {string[]}
 */
export function recordTypes(seen = []) {
  const known = [
    "Client",
    "Engagement",
    "Invoice",
    "Payment",
    "Document",
    "User",
    "Branch",
  ];
  // what the log holds, plus the familiar ones even when a young database
  // has no entry for them yet
  return [...new Set([...known, ...seen.filter(Boolean)])].sort();
}

/**
 * The quick filters: the four questions a log is actually opened with.
 *
 * Each returns the query string the screen links to, so the chips and the
 * form cannot disagree about what "today" means.
 *
 * @param {Date} [now]
 */
export function quickFilters(actorId, now = new Date()) {
  const day = startOfISTDay(now);
  const asInput = (date) => {
    const { year, month, day: d } = istParts(date);
    return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const weekAgo = new Date(day.getTime() - 6 * 86_400_000);

  return [
    { key: "today", label: "Today", params: { from: asInput(day) } },
    {
      key: "week",
      label: "Last 7 days",
      params: { from: asInput(weekAgo) },
    },
    { key: "mine", label: "Just me", params: { user: actorId } },
    {
      key: "failed",
      label: "Failed sign-ins",
      params: { action: ACTIONS.loginFailed },
    },
  ];
}

/**
 * The five figures worth noticing at the top of the log, for one day.
 *
 * They are the same things the incident watch from Step 12 is tuned to —
 * failed sign-ins, downloads in a burst, credential reveals — shown where
 * somebody is already looking rather than waiting for a threshold.
 *
 * ponytail: counted in JavaScript over the day's entries, which the page
 * caps at 5,000. One indexed query and five passes over a day's rows is
 * nothing at this firm's size; a `$group` aggregation is the upgrade if a
 * day ever gets busy enough to notice.
 *
 * @param {Array<{action: string}>} entries today's entries
 */
export function todayFigures(entries = []) {
  const count = (...actions) =>
    entries.filter((entry) => actions.includes(entry.action)).length;

  return [
    { key: "all", label: "entries today", value: entries.length, params: {} },
    {
      key: "signIns",
      label: "sign-ins",
      value: count(ACTIONS.login),
      params: { action: ACTIONS.login },
    },
    {
      key: "failed",
      label: "failed sign-ins",
      value: count(ACTIONS.loginFailed),
      params: { action: ACTIONS.loginFailed },
      alarming: count(ACTIONS.loginFailed) > 0,
    },
    {
      key: "downloads",
      label: "downloads",
      value: count(ACTIONS.documentDownload, ACTIONS.export),
      params: { action: ACTIONS.documentDownload },
    },
    {
      key: "reveals",
      label: "credential reveals",
      value: count(ACTIONS.credentialReveal),
      params: { action: ACTIONS.credentialReveal },
      alarming: count(ACTIONS.credentialReveal) > 0,
    },
  ];
}

/**
 * Entries grouped by the Indian calendar day they happened on.
 *
 * A log is read by date before anything else, and an unbroken list of a
 * hundred rows gives the eye nothing to hold on to. The boundary is IST
 * midnight, not UTC's — an entry at 4am IST belongs to that morning, and
 * grouping on the stored UTC date would file it under the day before.
 *
 * @param {Array<{ts: Date|string}>} entries newest first
 * @param {Date} [now]
 * @returns {Array<{key: string, label: string, entries: any[]}>}
 */
export function groupByDay(entries = [], now = new Date()) {
  const today = startOfISTDay(now).getTime();
  const yesterday = today - 86_400_000;

  /** @type {Map<number, any[]>} */
  const days = new Map();
  for (const entry of entries) {
    const key = startOfISTDay(new Date(entry.ts)).getTime();
    const list = days.get(key);
    if (list) list.push(entry);
    else days.set(key, [entry]);
  }

  return [...days.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, list]) => ({
      key: String(key),
      label:
        key === today
          ? "Today"
          : key === yesterday
            ? "Yesterday"
            : formatISTDate(new Date(key)),
      entries: list,
    }));
}
