// @ts-check

import AuditFile from "@/models/AuditFile";
import Certificate from "@/models/Certificate";
import ClientAccess from "@/models/ClientAccess";
import ClientCredential from "@/models/ClientCredential";
import ClientService from "@/models/ClientService";
import ClientUser from "@/models/ClientUser";
import Comment from "@/models/Comment";
import DocRequest from "@/models/DocRequest";
import DocumentModel from "@/models/Document";
import Dsc from "@/models/Dsc";
import Engagement from "@/models/Engagement";
import GeneratedDoc from "@/models/GeneratedDoc";
import HeldChange from "@/models/HeldChange";
import Invoice from "@/models/Invoice";
import Notice from "@/models/Notice";
import Notification from "@/models/Notification";
import Payment from "@/models/Payment";
import PeriodReason from "@/models/PeriodReason";
import Sample from "@/models/Sample";
import TimeEntry from "@/models/TimeEntry";
import TrialBalance from "@/models/TrialBalance";

/**
 * Deleting a client or a job takes its dependants with it (owner, 12-11-2026).
 *
 * Before this, `deleteClient` stamped `deletedAt` on the client and nothing
 * else, so the client vanished from the list while its jobs stayed on the
 * work queues, its invoices on the ledger and its files in the vault —
 * references to a record nobody can open.
 *
 * Still a **soft** delete (CLAUDE.md rule 3): every row keeps its data and
 * gets the same `deletedAt`, so the set can be told apart later and the
 * audit trail reads the same. Each row goes through `softDelete()` rather
 * than one `updateMany`, because the audit plugin cannot log a bulk update
 * (see `models/plugins/audit.js`) and rule 2 wants an entry per change.
 *
 * Two things are deliberately **not** here:
 *
 *   - **UDINs.** The UDIN register is a statutory record of numbers the
 *     firm has issued; it is not ours to erase. The delete actions refuse
 *     outright when a UDIN is linked.
 *   - **Audit logs and message logs.** The record of what happened survives
 *     the record it happened to.
 *
 * Notifications are the one exception to soft delete: they are UI chatter,
 * not firm records, and a notification linking to a deleted job is a dead
 * end, so they are removed.
 */

/** @param {string[]} ids */
const byClient = (ids) => ({ clientId: { $in: ids } });
/** @param {string[]} ids */
const byEngagement = (ids) => ({ engagementId: { $in: ids } });

/** Everything born of one job, which means nothing once the job is gone. */
export const OF_ENGAGEMENT = [
  ["file", DocumentModel, byEngagement],
  ["document request", DocRequest, byEngagement],
  ["letter", GeneratedDoc, byEngagement],
  ["time entry", TimeEntry, byEngagement],
  ["sample", Sample, byEngagement],
  ["trial balance", TrialBalance, byEngagement],
  ["audit file", AuditFile, byEngagement],
  [
    "comment",
    Comment,
    (ids) => ({ entityType: "Engagement", entityId: { $in: ids } }),
  ],
  [
    "notification",
    Notification,
    (ids) => ({ entityType: "Engagement", entityId: { $in: ids } }),
    "hard",
  ],
];

/**
 * Everything that hangs off a client. Its jobs are in here, and so is
 * everything keyed to the job as well — `Document`, `TimeEntry` and the rest
 * all carry `clientId` too, so one sweep by client catches the lot.
 */
export const OF_CLIENT = [
  ["job", Engagement, byClient],
  ["service subscription", ClientService, byClient],
  ["stored credential", ClientCredential, byClient],
  ["portal user", ClientUser, byClient],
  ["staff access grant", ClientAccess, byClient],
  ["DSC", Dsc, byClient],
  ["held change", HeldChange, byClient],
  ["period reason", PeriodReason, byClient],
  ["notice", Notice, byClient],
  ["certificate", Certificate, byClient],
  ["invoice", Invoice, byClient],
  ["payment", Payment, byClient],
  ["file", DocumentModel, byClient],
  ["document request", DocRequest, byClient],
  ["letter", GeneratedDoc, byClient],
  ["time entry", TimeEntry, byClient],
  ["sample", Sample, byClient],
  ["trial balance", TrialBalance, byClient],
  ["audit file", AuditFile, byClient],
  ["comment", Comment, byClient],
  ["notification", Notification, byClient, "hard"],
];

/**
 * Soft-delete everything one plan points at, inside the caller's transaction.
 *
 * ponytail: one document at a time, so a client with thousands of rows would
 * be slow — batch it if a real delete ever strains the 60-second budget.
 *
 * @param {Array<[string, any, (ids: string[]) => object, string?]>} plan
 * @param {string[]} ids the client or engagement ids being deleted
 * @param {string} actorId
 * @param {import("mongoose").ClientSession} session
 * @returns {Promise<string[]>} what went, as phrases: `["3 files", "1 job"]`
 */
export async function cascadeSoftDelete(plan, ids, actorId, session) {
  const went = [];

  for (const [label, Model, filter, hard] of plan) {
    let count;

    if (hard) {
      // notifications only: UI chatter, and no soft-delete flag to set
      count = (await Model.deleteMany(filter(ids), { session })).deletedCount;
    } else {
      const rows = await Model.find(filter(ids)).session(session);
      for (const row of rows) await row.softDelete(actorId, { session });
      count = rows.length;
    }

    if (count) went.push(`${count} ${label}${count === 1 ? "" : "s"}`);
  }

  return went;
}
