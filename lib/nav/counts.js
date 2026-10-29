// @ts-check

import Engagement from "../../models/Engagement.js";
import Notification from "../../models/Notification.js";
import Notice from "../../models/Notice.js";
import Certificate from "../../models/Certificate.js";
import Invoice from "../../models/Invoice.js";
import Dsc from "../../models/Dsc.js";
import Todo from "../../models/Todo.js";
import SendBatch from "../../models/SendBatch.js";

import { can, branchFilter } from "../permissions.js";
import { engagementQuery } from "../engagements/filter.js";
import { issueRows, isMine } from "../issues/list.js";
import { CHARGEABLE_QUERY } from "../engagements/scope.js";
import { noticeQuery } from "../practice/notices.js";
import { startOfISTDay } from "../dates.js";
import { pendingFromClients } from "../../app/(app)/documents/requests.js";
import { scopedByClient } from "../access/clientAccess.js";

/**
 * Every badge on the menu, in one pass (P3-22a).
 *
 * **The number has to equal the rows the click shows.** That is the whole
 * rule, and the only way to keep it is for the count and the page to ask
 * the same question — so each one here goes through the helper its page
 * goes through (`engagementQuery`, `noticeQuery`, `issueRows`), scoped by
 * the actor's access and current view (D45). A badge with its own private
 * query is a badge that will disagree with the page by Thursday.
 *
 * A count of zero is still returned; the rail is what decides not to draw
 * a zero.
 *
 * ponytail: ~15 bounded counts per page load for a five-person firm. If it
 * ever shows in the Atlas slow log, cache per user for a minute rather than
 * storing a number that can go stale.
 */

const DAY = 86_400_000;

/**
 * @param {import("../permissions.js").Actor} actor
 * @param {Date} [now]
 * @returns {Promise<Record<string, number>>}
 */
export async function navCounts(actor, now = new Date()) {
  const work = can(actor, "view", "engagementsWork");
  const money = can(actor, "view", "invoices");
  const practice = can(actor, "view", "practice");
  const certs = can(actor, "view", "udin");
  const docs = can(actor, "view", "documents");
  const dsc = can(actor, "view", "dsc");
  const firm = can(actor, "view", "firmProfile");

  const engagements = (params) =>
    work ? Engagement.countDocuments(engagementQuery(actor, params, now)) : 0;
  const notices = (params) =>
    practice ? Notice.countDocuments(noticeQuery(actor, params, now)) : 0;

  const [
    issues,
    inbox,
    openJobs,
    overdue,
    waiting,
    inReview,
    noticesOpen,
    noticesNoDraft,
    noticesGst,
    noticesIt,
    certNoUdin,
    readyToBill,
    unpaid,
    docsAwaited,
    dscExpiring,
    automationWaiting,
    todos,
    audits,
  ] = await Promise.all([
    /** This person's own, severity "today" or worse — the page's own rule. */
    issueRows(actor, now).then(
      (rows) =>
        rows.filter((row) => isMine(row, actor) && row.severity >= 2).length,
    ),
    Notification.countDocuments({
      userId: actor.id,
      readAt: null,
      $or: [{ snoozedUntil: null }, { snoozedUntil: { $lte: now } }],
    }),

    // the four Jobs items, each the query behind its own link
    engagements({}),
    engagements({ due: "overdue" }),
    engagements({ status: "Awaiting documents" }),
    engagements({ status: "Under review" }),

    notices({}),
    notices({ show: "nodraft" }),
    notices({ law: "GST" }),
    notices({ law: "Income tax" }),

    /** Drafts: a certificate with no UDIN on it has not been signed. */
    certs
      ? Certificate.countDocuments({
          ...(branchFilter(actor, "udin") ?? {}),
          signedAt: null,
        })
      : 0,

    /** Finished work nobody has billed — the unbilled report's own filter. */
    money
      ? Engagement.countDocuments({
          ...(branchFilter(actor, "invoices") ?? {}),
          ...CHARGEABLE_QUERY,
          billingStatus: "Unbilled",
          status: { $in: ["Filed / delivered", "Completed"] },
        })
      : 0,

    /** Issued and not settled — what Collections opens on. */
    money
      ? Invoice.countDocuments({
          ...(branchFilter(actor, "invoices") ?? {}),
          status: { $in: ["Sent", "Partially paid", "Disputed"] },
        })
      : 0,

    /**
     * What the firm is still waiting for — `pendingFromClients` is the
     * documents page own helper, so the badge and the tab cannot differ.
     */
    docs
      ? scopedByClient(actor, "clientId")
          .then((scope) => pendingFromClients(actor, scope))
          .then((rows) => rows.length)
      : 0,

    dsc
      ? Dsc.countDocuments({
          ...(branchFilter(actor, "dsc") ?? {}),
          validTill: { $lt: new Date(startOfISTDay(now).getTime() + 30 * DAY) },
        })
      : 0,

    /** Client-facing batches a partner has not decided on (P3-10). */
    firm ? SendBatch.countDocuments({ status: "queued" }) : 0,

    /**
     * My own to-dos, late or due today (P3-22c) — the same condition the
     * panel on My tasks draws. Nothing further out is counted: a badge that
     * includes next week never reaches zero.
     */
    Todo.countDocuments({
      ownerId: actor.id,
      done: false,
      dueDate: { $ne: null, $lt: new Date(startOfISTDay(now).getTime() + DAY) },
    }),

    auditCounts(actor, practice),
  ]);

  return {
    issues,
    inbox,
    openJobs,
    overdue,
    waiting,
    inReview,
    noticesOpen,
    noticesNoDraft,
    noticesGst,
    noticesIt,
    certNoUdin,
    readyToBill,
    unpaid,
    docsAwaited,
    dscExpiring,
    automationWaiting,
    todos,
    ...audits,
  };
}

/**
 * The five audit categories, by the audit type on the engagement.
 *
 * `auditType` is free text on the engagement (it is what the firm called
 * the audit), so each category matches on the word rather than an enum
 * nobody has agreed. An engagement whose type says nothing lands in none of
 * the five, which is why "All files" is its own link and not a total.
 */
export const AUDIT_CATEGORIES = {
  statutory: /statutory/i,
  tax: /tax/i,
  internal: /internal/i,
  concurrent: /concurrent/i,
  stock: /stock/i,
};

async function auditCounts(actor, practice) {
  if (!practice) {
    return {
      auditStatutory: 0,
      auditTax: 0,
      auditInternal: 0,
      auditConcurrent: 0,
      auditStock: 0,
    };
  }

  const base = {
    ...(branchFilter(actor, "practice") ?? {}),
    "templateSnapshot.category": "Audit and Assurance",
  };

  const entries = await Promise.all(
    Object.entries(AUDIT_CATEGORIES).map(async ([key, pattern]) => [
      `audit${key[0].toUpperCase()}${key.slice(1)}`,
      await Engagement.countDocuments({ ...base, auditType: pattern }),
    ]),
  );

  return Object.fromEntries(entries);
}
