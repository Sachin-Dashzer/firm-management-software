// @ts-check

import { INVOICE_STATUSES } from "../../models/Invoice.js";
import { filingProgress, proofPending } from "../engagements/milestones.js";
import {
  isApproved,
  isClientConfirmed,
  needsClientConfirmation,
  versionOf,
} from "../engagements/gates.js";

/**
 * What a client may see of their own file (P2-9b).
 *
 * Every query on every portal page goes through here. Six pages each
 * writing `{ clientId: person.clientId }` is six chances to forget, and the
 * one that forgets shows somebody another company's invoice — so the id
 * comes from the session record and nothing else, and the rules that are
 * more than the id live beside it.
 *
 * The rules, in one place so they can be read in one go:
 *
 *  - **documents**: shared, and not deleted. Nothing else.
 *  - **invoices**: issued. A draft is the firm thinking aloud about a
 *    number; a cancelled one is a mistake being corrected.
 *  - **engagements**: the work itself, with the internal apparatus of doing
 *    it left out — the reviewer, the internal deadline, how many times it
 *    came back, who is assigned.
 *  - **comments**: only ones explicitly marked not internal.
 */

/** Statuses a client is allowed to know exist. */
export const CLIENT_VISIBLE_INVOICE_STATUSES = INVOICE_STATUSES.filter(
  (status) => !["Draft", "Cancelled"].includes(status),
);

/**
 * The one id every portal query is anchored to.
 *
 * It takes the **session record**, not an id from a URL or a form, because
 * the whole point is that a portal page never chooses which client it is
 * looking at.
 *
 * @param {{clientId: string, kind?: string}} person
 * @returns {string}
 */
export function clientIdOf(person) {
  if (!person || person.kind !== "client" || !person.clientId) {
    throw new Error("Not a client portal session");
  }
  return String(person.clientId);
}

/** Their engagements. Closed work stays visible: it is their record too. */
export function engagementScope(person) {
  return { clientId: clientIdOf(person) };
}

/**
 * The fields of an engagement a client sees.
 *
 * A projection rather than a filter after the fact: a field that is never
 * read cannot be leaked by a page that forgets to drop it.
 */
export const ENGAGEMENT_FIELDS =
  /**
   * Two sub-fields of `milestones` and not the array (P3-1): the client needs
   * to know how many filings are in and whether proof is attached. They do
   * not need `filedByName`, or the acknowledgement numbers of records the
   * firm has since corrected, or the reasons it corrected them — and a field
   * that is never read cannot be leaked by a page that forgets to drop it.
   */
  "code status periodLabel period statutoryDue filedOn completedAt ackNo udin billingStatus templateSnapshot.name templateSnapshot.category templateSnapshot.clientConfirmationRequired clientId milestones.filedOn milestones.proofDocumentId version review clientConfirmation";

/** Only what somebody at the firm has deliberately shared. */
export function documentScope(person) {
  return {
    clientId: clientIdOf(person),
    sharedWithClient: true,
  };
}

/** Issued invoices, never a draft and never a cancelled one. */
export function invoiceScope(person) {
  return {
    clientId: clientIdOf(person),
    status: { $in: CLIENT_VISIBLE_INVOICE_STATUSES },
  };
}

/**
 * The with-client half of a job's conversation (P3-17b).
 *
 * `internal: false` is the whole point of this function existing. The flag
 * has been on every comment since Step 5 and nothing read it, so the tick
 * marked "Internal only" changed a boolean with no effect — somebody could
 * untick it, believe the client had been written to, and be wrong.
 *
 * It is a query rather than a filter applied afterwards, because a filter
 * that runs after the read is one a page can forget.
 *
 * @param {{clientId: string, kind?: string}} person
 * @param {any[]} engagementIds the jobs that are theirs
 */
export function threadScope(person, engagementIds) {
  return {
    clientId: clientIdOf(person),
    entityType: "Engagement",
    entityId: { $in: engagementIds },
    internal: false,
    kind: { $in: ["Note", "Client message"] },
  };
}

/** Their payments, which are theirs by definition. */
export function paymentScope(person) {
  return { clientId: clientIdOf(person) };
}

/**
 * Is this record theirs?
 *
 * For the pages that are handed an id — a document to download, an invoice
 * PDF — where the answer must be no for every id but their own, including
 * one guessed from another client's page.
 *
 * @param {{clientId: string, kind?: string}} person
 * @param {{clientId?: any}|null} record
 */
export function belongsToClient(person, record) {
  if (!record) return false;
  return String(record.clientId ?? "") === clientIdOf(person);
}

/**
 * What a client is shown of an engagement.
 *
 * The internal apparatus is absent rather than hidden: no reviewer, no
 * internal due date, no rework count, no assignee. A client knowing their
 * return came back from review twice is the firm's business, not theirs.
 *
 * @param {any} engagement a lean engagement, read with ENGAGEMENT_FIELDS
 */
export function engagementForClient(engagement) {
  return {
    id: String(engagement._id),
    service: engagement.templateSnapshot?.name ?? "Work",
    period: engagement.periodLabel || engagement.period || "",
    status: engagement.status,
    due: engagement.statutoryDue ?? null,
    filedOn: engagement.filedOn ?? null,
    completedAt: engagement.completedAt ?? null,
    ackNo: engagement.ackNo ?? "",
    udin: engagement.udin ?? "",

    /**
     * Where the filings stand (P3-1). A month with GSTR-1 in and GSTR-3B
     * still owing is not finished, and the client is shown that rather than
     * a blank — and a filing with no acknowledgement attached says so, so
     * nobody goes looking for a download that is not there.
     */
    filingCount: (engagement.milestones ?? []).length,
    filedCount: (engagement.milestones ?? []).filter((m) => m.filedOn).length,
    partFiled: filingProgress(engagement) === "part",
    proofPending: proofPending(engagement),

    /**
     * The client’s own gate (P3-5, P3-6). Approved by the firm, waiting on
     * them: a figure that goes to the department in their name, which they
     * are being asked to agree before it does.
     *
     * The *reviewer’s* name and the version history stay out — what they
     * need is the question and the version it refers to.
     */
    version: versionOf(engagement),
    awaitingYourConfirmation:
      isApproved(engagement) &&
      needsClientConfirmation(engagement) &&
      !isClientConfirmed(engagement),
    confirmedOn: isClientConfirmed(engagement)
      ? (engagement.clientConfirmation?.when ?? null)
      : null,
    confirmedBy: isClientConfirmed(engagement)
      ? (engagement.clientConfirmation?.who ?? "")
      : "",
  };
}
