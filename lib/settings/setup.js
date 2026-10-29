// @ts-check

import Client from "../../models/Client.js";
import User from "../../models/User.js";
import { ALL_CHECKS } from "./attention.js";

/**
 * The eight things a firm does before it can rely on this system (P3-22d).
 *
 * **It is not a checklist somebody ticks.** Every step is read from the
 * records: a step is done because the due-date rules are confirmed or the
 * branch has a GSTIN, not because a person once said so. A checklist with
 * its own state is a second record of the same fact, and it is the copy
 * that goes stale — on a screen whose whole job is to say what is still
 * missing.
 *
 * Six of the eight are the **same conditions the "Needs attention" strip
 * reads** (P2-10b), by key, so the two screens cannot disagree. The strip
 * shows only what is wrong; this shows all eight in the order a new firm
 * works through them, which is the one thing it adds.
 */

/** The check from `attention.js` with this key, or nothing. */
function check(key) {
  return ALL_CHECKS.find((row) => row.key === key);
}

/**
 * @typedef {object} SetupStep
 * @property {string} key
 * @property {string} title       what the firm has to do
 * @property {string} why         why it matters, in a line
 * @property {string} href        the screen that does it
 * @property {string} [uses]      the `attention.js` check this reads
 * @property {string} [whenLeft]  what is still missing, when something is
 */

/** @type {SetupStep[]} */
export const SETUP_STEPS = [
  {
    key: "firm",
    title: "Enter the firm's own record",
    why: "The name, the FRN and the address print on every invoice, report and letter the system sends.",
    href: "/settings/icai",
    uses: "firm",
    whenLeft: "fields are still blank",
  },
  {
    key: "branches",
    title: "Register each branch for GST",
    why: "An invoice can be drafted from a branch with no GSTIN, but it cannot be issued.",
    href: "/settings/branches",
    uses: "branchGstin",
    whenLeft: "branches have no GSTIN",
  },
  {
    key: "team",
    title: "Give the staff their accounts",
    why: "Work is assigned to people, and a review has to be done by somebody other than the person who prepared it.",
    href: "/team",
    whenLeft: "nobody but the partner has an account",
  },
  {
    key: "services",
    title: "Price the service catalog",
    why: "The catalog ships with every fee at zero and most SAC codes blank, and a wrong SAC goes onto a GST invoice.",
    href: "/settings/services",
    uses: "serviceFees",
    whenLeft: "services have no fee or no SAC code",
  },
  {
    key: "dueDates",
    title: "Confirm the due-date rules",
    why: "No statutory deadline is put on any work until a partner has confirmed the rule behind it. Nothing is guessed.",
    href: "/settings/due-dates",
    uses: "dueDates",
    whenLeft: "rules are unconfirmed",
  },
  {
    key: "clients",
    title: "Bring the clients in",
    why: "A spreadsheet of the existing book, or one client at a time. Everything else hangs off a client.",
    href: "/clients/import",
    whenLeft: "no real client is on the books",
  },
  {
    key: "runner",
    title: "Start the job runner",
    why: "Reminders, recurring work and overdue chasing all happen on the firm's own cron job. Nothing scheduled runs without it.",
    href: "/settings/jobs",
    uses: "runner",
    whenLeft: "it has not been heard from",
  },
  {
    key: "email",
    title: "Decide what goes out to clients",
    why: "Staff email works on its own. Client email is off until the firm turns it on, and until then nothing reaches a client.",
    href: "/settings/messages",
    uses: "clientEmail",
    whenLeft: "client email is switched off",
  },
];

/**
 * The two steps that are not an `attention.js` check, because having a
 * second person and a real client is not a *problem* worth a warning — it
 * is just a thing a new firm has not done yet.
 *
 * @param {Date} [now]
 */
export async function ownCounts(now = new Date()) {
  void now;
  const [people, clients] = await Promise.all([
    User.countDocuments({ active: true, role: { $ne: "partner" } }),
    Client.countDocuments({ tags: { $ne: "sample" } }),
  ]);

  return {
    // "left to do" is what every count here means, so these are inverted
    team: people > 0 ? 0 : 1,
    clients: clients > 0 ? 0 : 1,
  };
}

/**
 * The eight steps with their state, from one map of counts.
 *
 * Pure, so the whole screen can be tested without a database: every count
 * means "how much is still left", and zero means done.
 *
 * @param {Record<string, number>} counts
 * @returns {Array<SetupStep & {done: boolean, left: number}>}
 */
export function readSteps(counts = {}) {
  return SETUP_STEPS.map((step) => {
    const left = counts[step.key] ?? 0;
    return { ...step, left, done: left === 0 };
  });
}

/** How far along the firm is, for the line at the top. */
export function setupProgress(steps) {
  const done = steps.filter((step) => step.done).length;
  return { done, total: steps.length, finished: done === steps.length };
}

/** Which `attention.js` checks the steps need run, by step key. */
export function checksForSteps() {
  return SETUP_STEPS.filter((step) => step.uses).map((step) => ({
    key: step.key,
    run: check(step.uses)?.run,
  }));
}
