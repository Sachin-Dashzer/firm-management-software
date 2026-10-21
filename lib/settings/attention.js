// @ts-check

import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import DocTemplate from "../../models/DocTemplate.js";
import DueDateRule from "../../models/DueDateRule.js";
import Job from "../../models/Job.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import User from "../../models/User.js";
import Counter from "../../models/Counter.js";
import { HEARTBEAT_ID } from "../jobs/queue.js";
import { mailSettings } from "../mailer/guard.js";
import { can } from "../permissions.js";

/**
 * What is stopping this system from being trusted (P2-10b).
 *
 * Several settings screens hide a condition that makes the app quietly
 * wrong rather than visibly broken: an unconfirmed due-date rule produces
 * no deadline at all, a branch with no GSTIN cannot issue an invoice, an
 * unapproved template produces nothing but drafts. Each of those is
 * correct behaviour and each is invisible until somebody goes looking.
 * This is the going-looking, done once, at the top of Settings.
 *
 * Every check is one count. An item that counts zero is **absent** — a
 * list of ticks is furniture, and the point of this strip is that anything
 * on it is worth doing today.
 */

/**
 * Each check names the permission that lets somebody read it, so nobody is
 * told about a problem they cannot act on: the accounts person has no
 * business being nagged about audit templates.
 *
 * `severity` is "blocking" for things that stop work happening at all, and
 * "worth doing" for the rest. Nothing is styled as an emergency.
 *
 * @typedef {{key: string, area: string, action?: string, severity: "blocking"|"worth doing",
 *   title: string, detail: string, href: string}} CheckShape
 */

/** @type {Array<CheckShape & {run: (ctx: any) => Promise<number>}>} */
const CHECKS = [
  {
    key: "dueDates",
    area: "usersSettings",
    action: "edit",
    severity: "blocking",
    title: "due-date rules have not been confirmed",
    detail:
      "No statutory deadline is put on any engagement until a partner has confirmed the rule behind it. Until then the work is still created on time, with the date left blank.",
    href: "/settings/due-dates",
    run: () => DueDateRule.countDocuments({ verifiedAt: null }),
  },
  {
    key: "branchGstin",
    area: "usersSettings",
    severity: "blocking",
    title: "branches have no GSTIN",
    detail:
      "An invoice can be drafted from a branch with no registration, but it cannot be issued.",
    href: "/settings/branches",
    run: () =>
      Branch.countDocuments({
        $or: [{ gstin: "" }, { gstin: null }, { gstin: { $exists: false } }],
      }),
  },
  {
    key: "docTemplates",
    area: "docTemplates",
    severity: "worth doing",
    title: "document templates have not been approved",
    detail:
      "They produce watermarked drafts and nothing else until a partner reads the wording and approves it.",
    href: "/settings/doc-templates",
    run: () => DocTemplate.countDocuments({ verifiedAt: null, active: true }),
  },
  {
    key: "firm",
    area: "firmProfile",
    // everybody may read the firm's own record — it is on the letterhead —
    // but only the people who can correct it should be told it is wrong
    action: "edit",
    severity: "worth doing",
    title: "details are missing from the firm's own record",
    detail:
      "The firm's name, registration number and address print on every invoice, report and letter.",
    href: "/settings/icai",
    run: ({ firm }) =>
      Promise.resolve(
        ["name", "frn", "headOffice"].filter((field) => !firm?.[field]).length,
      ),
  },
  {
    key: "serviceFees",
    area: "serviceCatalog",
    action: "edit",
    severity: "worth doing",
    title: "services have no fee or no SAC code",
    detail:
      "The catalog was seeded with every fee at zero and most SAC codes blank. A wrong SAC goes onto a GST invoice.",
    href: "/settings/services",
    run: () =>
      ServiceTemplate.countDocuments({
        active: { $ne: false },
        $or: [{ feePaise: { $lte: 0 } }, { sac: "" }, { sac: null }],
      }),
  },
  {
    key: "clientEmail",
    area: "usersSettings",
    severity: "worth doing",
    title: "client email is switched off",
    detail:
      "Invoices and reminders to clients are composed and recorded, but nothing is delivered. Staff email is unaffected.",
    href: "/settings/messages",
    // not a count of records: one condition, reported as one item
    run: () => Promise.resolve(mailSettings().clientsEnabled ? 0 : 1),
  },
  {
    key: "runner",
    area: "usersSettings",
    severity: "blocking",
    title: "the job runner has not been heard from",
    detail:
      "Nothing scheduled is happening: no reminders, no recurring work, no overdue chasing. The cron job on the firm's hosting is what drives it.",
    href: "/settings/jobs",
    run: async ({ now }) => {
      const beat = await Counter.findById(HEARTBEAT_ID).lean();
      if (!beat?.updatedAt) return 1;
      const minutes =
        (now.getTime() - new Date(beat.updatedAt).getTime()) / 60000;
      return minutes > 30 ? 1 : 0;
    },
  },
  {
    key: "failedJobs",
    area: "usersSettings",
    severity: "worth doing",
    title: "background jobs have failed",
    detail:
      "Something tried and gave up — usually an email that could not be sent. Each one says why.",
    href: "/settings/jobs",
    run: () => Job.countDocuments({ status: "failed" }),
  },
  {
    key: "sampleData",
    area: "usersSettings",
    severity: "worth doing",
    title: "sample clients are still in the database",
    detail:
      "Invented clients and their work are mixed in with the real ones. Take them out before the firm relies on any total.",
    href: "/settings/migration",
    run: () => Client.countDocuments({ tags: "sample" }),
  },
  {
    key: "neverSignedIn",
    area: "team",
    action: "edit",
    severity: "worth doing",
    title: "people have never signed in",
    detail:
      "Their one-time password is still sitting unused. An account nobody has opened is an account nobody is watching.",
    href: "/team",
    run: () => User.countDocuments({ active: true, lastLoginAt: null }),
  },
];

/**
 * Run every check this person is allowed to see.
 *
 * All of them go at once — ten counts against indexed fields, which is one
 * round trip's worth of waiting rather than ten.
 *
 * @param {{id: string, role: string, branchIds?: string[]}} actor
 * @param {{firm?: any, now?: Date}} [context]
 * @returns {Promise<Array<CheckShape & {count: number}>>}
 */
export async function needsAttention(actor, context = {}) {
  // the caller connects, as every other page does: a helper that opens its
  // own connection cannot be tested without one
  const ctx = { firm: context.firm ?? {}, now: context.now ?? new Date() };

  const mine = CHECKS.filter((check) =>
    can(actor, check.action ?? "view", check.area),
  );

  const counts = await Promise.all(
    mine.map((check) =>
      // one broken check must not take the whole strip down with it: the
      // screen behind each item still works, and a Settings page that
      // 500s because a count threw would be worse than a missing warning
      check.run(ctx).catch(() => 0),
    ),
  );

  return mine
    .map((check, index) => ({ ...check, count: counts[index] }))
    .filter((check) => check.count > 0)
    .sort(
      (a, b) =>
        Number(b.severity === "blocking") - Number(a.severity === "blocking"),
    );
}

/** The checks themselves, for the tests and for nothing else. */
export const ALL_CHECKS = CHECKS;
