// @ts-check

import Engagement from "../models/Engagement.js";
import Client from "../models/Client.js";
import Invoice from "../models/Invoice.js";
import DocRequest from "../models/DocRequest.js";
import Dsc from "../models/Dsc.js";
import MessageLog from "../models/MessageLog.js";
import { connectDB } from "../lib/db.js";
import { loadRules } from "../lib/mailer/rules.js";
import { notify, peopleFor } from "../lib/mailer/notify.js";
import { mailSettings } from "../lib/mailer/guard.js";
import { TEMPLATES } from "../lib/mailer/templates.js";
import { startOfISTDay } from "../lib/dates.js";
import {
  documentReminders,
  dscReminders,
  engagementReminders,
  invoiceReminders,
  perRecipient,
  SWEEP_OPEN_STATUSES,
} from "../lib/mailer/sweep.js";
import {
  hashRequestToken,
  newRequestToken,
  requestExpiry,
  requestLink,
} from "../lib/storage/requests.js";

/**
 * The morning sweep (spec section 12).
 *
 * Once a day it looks at open work, unpaid invoices and documents we are
 * waiting for, and sends the reminders that are due today. What is due is
 * decided by the pure functions in `lib/mailer/sweep.js`; this file is
 * only the fetching and the sending.
 *
 * It sends nothing itself. Every reminder becomes a `messageLogs` row and
 * a `sendMail` job, so the existing hourly rate limit governs delivery
 * and this pass stays well inside the runner's 60 seconds however much
 * work the firm has.
 *
 * Two things stop a client being chased twice: the dedupe keys, checked
 * here and enforced by a unique index, and the reminder count on the
 * request itself.
 *
 * @param {{ now?: Date, limit?: number }} [options]
 */
export async function reminders(options = {}) {
  await connectDB();

  const now = options.now ?? new Date();
  const limit = options.limit ?? 500;
  const rules = await loadRules({ fresh: true });

  const planned = [];

  // --- open work: target dates, statutory dates, overdue ------------------
  const engagements = await Engagement.find({
    status: SWEEP_OPEN_STATUSES,
    $or: [{ internalDue: { $ne: null } }, { statutoryDue: { $ne: null } }],
  })
    .sort({ statutoryDue: 1, internalDue: 1 })
    .limit(limit)
    .lean();

  const clientIds = new Set(engagements.map((e) => String(e.clientId)));

  // --- unpaid invoices ----------------------------------------------------
  const invoices = await Invoice.find({
    status: { $in: ["Sent", "Partially paid", "Disputed"] },
    dueDate: { $ne: null },
    deletedAt: null,
  })
    .sort({ dueDate: 1 })
    .limit(limit)
    .lean();

  for (const invoice of invoices) clientIds.add(String(invoice.clientId));

  // --- documents we are still waiting for ---------------------------------
  const requests = await DocRequest.find({
    revokedAt: null,
    deletedAt: null,
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  for (const request of requests) clientIds.add(String(request.clientId));

  const clients = await Client.find({ _id: { $in: [...clientIds] } })
    .select("legalName tradeName contacts invoiceEmail clientPartnerId")
    .lean();
  const clientById = new Map(clients.map((c) => [String(c._id), c]));

  for (const engagement of engagements) {
    const client = clientById.get(String(engagement.clientId));
    planned.push(
      ...engagementReminders(
        {
          engagement,
          clientName: client?.tradeName || client?.legalName,
          clientPartnerId: client?.clientPartnerId
            ? String(client.clientPartnerId)
            : undefined,
        },
        rules,
        now,
      ),
    );
  }

  for (const invoice of invoices) {
    const client = clientById.get(String(invoice.clientId));
    planned.push(
      ...invoiceReminders(
        { invoice, contact: billingContact(client) },
        rules,
        now,
      ),
    );
  }

  // the checklist rows a request was made for, as they stand now
  const requestEngagements = await Engagement.find({
    _id: { $in: requests.map((r) => r.engagementId).filter(Boolean) },
  })
    .select("checklist status")
    .lean();
  const engagementById = new Map(
    requestEngagements.map((e) => [String(e._id), e]),
  );

  for (const request of requests) {
    const client = clientById.get(String(request.clientId));
    planned.push(
      ...documentReminders(
        {
          request,
          outstanding: stillOutstanding(
            request,
            engagementById.get(String(request.engagementId)),
          ),
          contact: clientContact(client),
        },
        rules,
        now,
      ),
    );
  }

  // --- digital signature certificates about to lapse (P2-7) --------------
  /**
   * Only the ones inside the widest notice period the firm has set, so a
   * register of hundreds costs one small query. Expired certificates are not
   * fetched at all: `dscReminders` would refuse them anyway, and the register
   * is where somebody looks at what has already lapsed.
   */
  const dscRule = rules.dscExpiring;
  const dscNotice = Math.max(0, ...(dscRule?.daysBefore ?? [0]));
  const certificates =
    dscRule?.enabled && dscNotice > 0
      ? await Dsc.find({
          deletedAt: null,
          validTill: {
            $gte: startOfISTDay(now),
            $lte: new Date(
              startOfISTDay(now).getTime() + (dscNotice + 1) * 86_400_000,
            ),
          },
        })
          .sort({ validTill: 1 })
          .limit(limit)
          .lean()
      : [];

  if (certificates.length > 0) {
    const dscClients = await Client.find({
      _id: { $in: certificates.map((row) => row.clientId) },
    })
      .select("legalName tradeName clientPartnerId relationshipManagerId")
      .lean();
    const dscClientById = new Map(dscClients.map((c) => [String(c._id), c]));

    for (const dsc of certificates) {
      const client = dscClientById.get(String(dsc.clientId));
      planned.push(
        ...dscReminders(
          {
            dsc,
            clientName: client?.tradeName || client?.legalName,
            // the client's partner and their own CA: the two people who
            // would make the call
            userIds: [client?.clientPartnerId, client?.relationshipManagerId],
          },
          rules,
          now,
        ),
      );
    }
  }

  /**
   * While client email is switched off, client-facing reminders are not
   * composed at all — unlike an invoice, where a held copy of what we
   * would have said is the record of an event.
   *
   * A sweep is not an event. Logging a held chase every morning would
   * both bury the message screen and spend the four reminders a request
   * is allowed without a single one arriving, so the chasing simply
   * starts on the day the firm switches client email on.
   */
  const clientsOn = mailSettings().clientsEnabled;
  const withheld = [];

  // --- expand to one message per person, drop what has already gone -------
  const expanded = [];
  for (const reminder of planned) {
    if (!clientsOn && TEMPLATES[reminder.rule]?.audience === "client") {
      withheld.push(reminder.rule);
      continue;
    }
    const people = [
      ...(await peopleFor(reminder.userIds ?? [])),
      ...(reminder.emails ?? []),
    ];
    expanded.push(...perRecipient(reminder, people));
  }

  const already = new Set(
    (
      await MessageLog.find({
        dedupeKey: { $in: expanded.map((item) => item.dedupeKey) },
      })
        .select("dedupeKey")
        .lean()
    ).map((row) => row.dedupeKey),
  );

  const sent = [];
  const counts = {};

  for (const item of expanded) {
    if (already.has(item.dedupeKey)) continue;

    const values = { ...item.values };

    // a document chase needs a working link, and only the hash of the old
    // one is kept — so each reminder mints a new token for the same request
    if (item.rule === "documentsPending") {
      values.link = await refreshRequestLink(item.about.entityId);
    }

    const result = await notify({
      template: item.rule,
      to: [item.person],
      values,
      about: item.about,
      dedupeKey: item.dedupeKey,
    });

    const status = result[0]?.status ?? "none";
    if (status === "duplicate" || status === "off") continue;

    counts[item.rule] = (counts[item.rule] ?? 0) + 1;
    sent.push(item.dedupeKey);

    if (item.rule === "documentsPending") {
      await DocRequest.updateOne(
        { _id: item.about.entityId },
        {
          $inc: { reminderCount: 1 },
          $set: { lastReminderAt: now, sentVia: "email" },
        },
      );
    }
  }

  return {
    considered: {
      engagements: engagements.length,
      invoices: invoices.length,
      requests: requests.length,
    },
    planned: expanded.length,
    sent: sent.length,
    byRule: counts,
    // named, so the jobs screen can say why no client was chased
    withheld: withheld.length,
    withheldNote: withheld.length
      ? "Client email is switched off, so no client was chased."
      : "",
  };
}

/**
 * Mint a fresh token for an existing request and push its expiry out, so
 * the reminder carries a link the client can actually use.
 * @param {any} id
 */
async function refreshRequestLink(id) {
  const token = newRequestToken();
  await DocRequest.updateOne(
    { _id: id },
    {
      $set: {
        tokenHash: hashRequestToken(token),
        tokenHint: token.slice(0, 6),
        expiresAt: requestExpiry(),
      },
    },
  );
  return requestLink(token);
}

/** What a request asked for that has still not arrived. */
function stillOutstanding(request, engagement) {
  if (!engagement) {
    return (request.items ?? [])
      .filter((item) => (item.receivedCount ?? 0) === 0)
      .map((item) => item.name);
  }
  if (["Completed", "Cancelled"].includes(engagement.status)) return [];

  const byId = new Map(
    (engagement.checklist ?? []).map((row) => [String(row._id), row]),
  );
  return (request.items ?? [])
    .filter((item) => {
      const row = byId.get(String(item.checklistItemId));
      // no matching row any more: trust the request's own count
      if (!row) return (item.receivedCount ?? 0) === 0;
      return !["Received", "Verified"].includes(row.status);
    })
    .map((item) => item.name);
}

/** Where an invoice reminder goes. */
function billingContact(client) {
  if (!client) return undefined;
  const email = client.invoiceEmail || primaryEmail(client);
  return email
    ? { email, clientName: client.legalName, name: client.legalName }
    : undefined;
}

/** Where a document chase goes. */
function clientContact(client) {
  if (!client) return undefined;
  const email = primaryEmail(client) || client.invoiceEmail;
  return email
    ? { email, clientName: client.legalName, name: client.legalName }
    : undefined;
}

function primaryEmail(client) {
  const contacts = client?.contacts ?? [];
  const primary = contacts.find((c) => c.primary) ?? contacts[0];
  return primary?.email ?? "";
}

export default reminders;
