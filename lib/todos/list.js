// @ts-check

import { startOfISTDay } from "../dates.js";

/**
 * Reading a to-do list (P3-22c).
 *
 * Pure: it is handed rows and a moment and answers questions. The queries
 * live in the page and the actions.
 *
 * The buckets are the only judgement here, and they are deliberately the
 * ones people say out loud — late, today, this week, after that, and the
 * ones with no date at all. **A to-do with no date is kept and shown last
 * rather than refused**: half of what anybody writes down has no date, and
 * a list that demands one is a list people keep somewhere else.
 */

const DAY = 86_400_000;

/** The buckets, in the order a list is read. */
export const BUCKETS = [
  { key: "overdue", label: "Late" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "undated", label: "No date" },
];

/** @param {string} key */
export function bucketLabel(key) {
  return BUCKETS.find((bucket) => bucket.key === key)?.label ?? key;
}

/**
 * Is this title and date something we can save?
 *
 * A date in the **past is allowed**: people write down what they are
 * already late on, and refusing it would only mean they lie about the date.
 *
 * @param {{title?: string, due?: string}} input
 * @returns {{ok: true, title: string, due: Date|null} | {ok: false, error: string}}
 */
export function checkTodo({ title = "", due = "" }) {
  const text = String(title).trim();
  if (!text) return { ok: false, error: "What has to be done?" };
  if (text.length > 200) {
    return {
      ok: false,
      error: "Keep it to a line — 200 characters. The detail goes in the note.",
    };
  }

  if (!due) return { ok: true, title: text, due: null };

  // the same parse the engagement dates use: a day in IST, not in UTC
  const date = new Date(`${due}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "That is not a date." };
  }

  return { ok: true, title: text, due: date };
}

/**
 * Which bucket a to-do falls in. Finished ones are not bucketed — they are
 * their own list.
 *
 * @param {{dueDate?: Date|string|null}} todo
 * @param {Date} [now]
 * @returns {string}
 */
export function bucketOf(todo, now = new Date()) {
  if (!todo?.dueDate) return "undated";

  const today = startOfISTDay(now).getTime();
  const day = startOfISTDay(new Date(todo.dueDate)).getTime();

  if (day < today) return "overdue";
  if (day === today) return "today";
  // the rest of this week, counted as the next six days — "by Friday" is
  // what somebody means, and a week that ends on Sunday is a calendar's
  // idea rather than a firm's
  if (day <= today + 6 * DAY) return "week";
  return "later";
}

/**
 * The list in its buckets, with the empty ones left out — a heading over
 * nothing is the menu lie that P3-22a spent a step removing.
 *
 * @param {any[]} todos
 * @param {Date} [now]
 * @returns {Array<{key: string, label: string, rows: any[]}>}
 */
export function groupTodos(todos, now = new Date()) {
  const open = (todos ?? []).filter((todo) => !todo.done);

  return BUCKETS.map((bucket) => ({
    ...bucket,
    rows: open
      .filter((todo) => bucketOf(todo, now) === bucket.key)
      .sort(byDateThenTitle),
  })).filter((bucket) => bucket.rows.length > 0);
}

/** Earliest date first, then alphabetically; undated rows keep their order. */
function byDateThenTitle(a, b) {
  const left = a.dueDate ? new Date(a.dueDate).getTime() : 0;
  const right = b.dueDate ? new Date(b.dueDate).getTime() : 0;
  if (left !== right) return left - right;
  return String(a.title ?? "").localeCompare(String(b.title ?? ""));
}

/**
 * How many of somebody's own to-dos are late or due today — the badge on
 * the menu, and the panel on My tasks. Nothing further out is counted: a
 * number that includes next week is a number that never reaches zero.
 *
 * @param {any[]} todos
 * @param {Date} [now]
 */
export function dueSoonCount(todos, now = new Date()) {
  return (todos ?? []).filter(
    (todo) => !todo.done && ["overdue", "today"].includes(bucketOf(todo, now)),
  ).length;
}
