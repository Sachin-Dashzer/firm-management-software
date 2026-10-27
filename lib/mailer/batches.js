// @ts-check

import SendBatch from "../../models/SendBatch.js";
import MessageLog from "../../models/MessageLog.js";
import FirmSettings from "../../models/FirmSettings.js";
import { connectDB } from "../db.js";
import { compose } from "./templates.js";
import { notify } from "./notify.js";
import { loadRules } from "./rules.js";
import { istParts } from "../dates.js";
import { decideBatch, applyMonthlyCap, stillWanted, capMonth } from "./gate.js";

/**
 * Putting the gate between a rule and the firm's clients (P3-10).
 *
 * `lib/mailer/gate.js` decides; this does the fetching and the sending, and
 * keeps the record. The split is the same one the sweep already uses: the
 * rules are pure and tested without a database, and the part that talks to
 * Mongo has no rules in it.
 */

/** Is the firm-wide pause on? */
export async function automationPaused() {
  await connectDB();
  const firm = await FirmSettings.findOne({ key: "firm" })
    .select("automationPaused")
    .lean();
  return Boolean(firm?.automationPaused);
}

/**
 * How many automated messages each of these clients has already had this
 * calendar month.
 *
 * Counted off the message log rather than kept as a counter, so it cannot
 * drift: the log is what actually went out.
 *
 * @param {string[]} clientIds
 * @param {Date} now
 */
export async function monthlyCounts(clientIds, now) {
  if (!clientIds.length) return new Map();
  const { year, month } = istParts(now);
  const from = new Date(Date.UTC(year, month - 1, 1) - 5.5 * 3_600_000);
  const to = new Date(Date.UTC(year, month, 1) - 5.5 * 3_600_000);

  const rows = await MessageLog.aggregate([
    {
      $match: {
        clientId: { $in: clientIds.map(String) },
        audience: "client",
        createdAt: { $gte: from, $lt: to },
      },
    },
    { $group: { _id: "$clientId", n: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.n]));
}

/**
 * Hand one rule's client-facing messages to the gate, and record what it
 * decided.
 *
 * Returns what happened, for the job's own summary, so the Jobs screen can
 * say "nine queued for approval" rather than "nine sent" when nothing left
 * the building.
 *
 * @param {object} input
 * @param {string} input.rule
 * @param {Array<any>} input.items   one per recipient, from the sweep
 * @param {Date} input.now
 * @param {{ id: string, name: string }} [input.actor]
 */
export async function gateBatch({ rule, items, now, actor }) {
  await connectDB();
  if (!items.length) return { rule, verdict: "send", sent: 0, queued: 0 };

  const rules = await loadRules({ fresh: true });
  const trusted = Boolean(rules[rule]?.trusted);
  const paused = await automationPaused();

  const counts = await monthlyCounts(
    items.map((item) => String(item.clientId ?? "")).filter(Boolean),
    now,
  );
  const { keep, capped } = applyMonthlyCap(items, counts);

  const decision = decideBatch({
    rule,
    recipients: keep.length,
    trusted,
    paused,
    now,
  });

  const firm = await FirmSettings.findOne({ key: "firm" })
    .select("name")
    .lean();
  const first = keep[0];
  const preview = first
    ? compose(rule, { firm: firm?.name, ...first.values, ...first.person })
    : null;

  const batch = await SendBatch.create({
    rule,
    status:
      decision.verdict === "send"
        ? "auto-sent"
        : decision.verdict === "queue"
          ? "queued"
          : decision.verdict,
    why: decision.why,
    notBefore: decision.until ?? null,
    cappedCount: capped.length,
    items: [
      ...keep.map((item) => ({
        to: item.person?.email ?? item.to ?? "",
        clientId: item.clientId ?? null,
        clientName: item.person?.clientName ?? item.clientName ?? "",
        rule,
        dedupeKey: item.dedupeKey ?? "",
        values: item.values ?? {},
        about: item.about ?? {},
      })),
      ...capped.map((item) => ({
        to: item.person?.email ?? item.to ?? "",
        clientId: item.clientId ?? null,
        clientName: item.person?.clientName ?? item.clientName ?? "",
        rule,
        dedupeKey: item.dedupeKey ?? "",
        values: item.values ?? {},
        about: item.about ?? {},
        outcome: "capped",
        outcomeWhy:
          "This client has already had four automatic messages this month.",
      })),
    ],
    preview: preview
      ? {
          to: first.person?.email ?? "",
          subject: preview.subject,
          body: preview.text,
        }
      : undefined,
    createdBy: actor?.id ?? "system",
    updatedBy: actor?.id ?? "system",
  });

  // a trusted rule inside the limits goes out now, in this same pass
  if (decision.verdict === "send") {
    const result = await sendBatch(batch, { now });
    return {
      rule,
      verdict: "send",
      sent: result.sent,
      queued: 0,
      cancelled: result.cancelled,
      held: result.held,
      capped: capped.length,
    };
  }

  return {
    rule,
    verdict: decision.verdict,
    why: decision.why,
    sent: 0,
    queued: keep.length,
    capped: capped.length,
    batchId: String(batch._id),
  };
}

/**
 * Send what a batch still owes, item by item.
 *
 * Each one is checked against the live record first: the reason may have
 * gone while the batch waited for a partner, and chasing somebody for
 * something they have already done is the worst thing an automated system
 * does to a relationship. A document that has arrived but not been checked
 * **holds** instead, because if it turns out to be the wrong month the
 * chase is still owed.
 *
 * ponytail: sends inline, one `notify()` per recipient. The 25-recipient
 * ceiling above keeps that small, and each `notify` only writes a log row
 * and a `sendMail` job — the real delivery is already rate-limited
 * elsewhere. If a firm ever approves hundreds at once, move this into the
 * job queue.
 *
 * @param {any} batch a SendBatch document
 * @param {{ now?: Date }} [options]
 */
export async function sendBatch(batch, options = {}) {
  const now = options.now ?? new Date();
  const contexts = await liveContexts(batch.items);

  let sent = 0;
  let cancelled = 0;
  let held = 0;

  for (const item of batch.items) {
    if (item.outcome) continue;

    const verdict = stillWanted(
      { rule: item.rule, about: item.about },
      contexts.get(String(item.about?.entityId ?? "")) ?? null,
    );

    if (verdict.state !== "send") {
      item.outcome = verdict.state === "hold" ? "held" : "cancelled";
      item.outcomeWhy = verdict.why;
      if (verdict.state === "hold") held += 1;
      else cancelled += 1;
      continue;
    }

    const result = await notify({
      template: item.rule,
      to: [{ email: item.to, clientName: item.clientName }],
      values: item.values ?? {},
      about: item.about ?? {},
      dedupeKey: item.dedupeKey || undefined,
    });

    const status = result[0]?.status ?? "none";
    if (status === "duplicate" || status === "off") {
      item.outcome = "cancelled";
      item.outcomeWhy =
        status === "duplicate"
          ? "This client had already been told."
          : "The rule was switched off before it went.";
      cancelled += 1;
      continue;
    }

    item.outcome = "sent";
    sent += 1;
  }

  batch.status = batch.status === "queued" ? "sent" : batch.status;
  batch.sentCount = sent;
  batch.sentAt = now;
  await batch.save();

  return { sent, cancelled, held };
}

/**
 * The live record behind each message, so `stillWanted` has something to
 * read. One query per entity type, not one per message.
 */
async function liveContexts(items) {
  const byType = new Map();
  for (const item of items) {
    const type = item.about?.entityType;
    const id = item.about?.entityId;
    if (!type || !id) continue;
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type).add(String(id));
  }

  const out = new Map();

  if (byType.has("Engagement")) {
    const { default: Engagement } = await import("../../models/Engagement.js");
    const rows = await Engagement.find({
      _id: { $in: [...byType.get("Engagement")] },
    })
      .select("checklist status")
      .lean();
    for (const row of rows) out.set(String(row._id), row);
  }

  if (byType.has("Invoice")) {
    const { default: Invoice } = await import("../../models/Invoice.js");
    const rows = await Invoice.find({
      _id: { $in: [...byType.get("Invoice")] },
    })
      .select("status totalPaise paidPaise tdsCreditedPaise")
      .lean();
    for (const row of rows) out.set(String(row._id), row);
  }

  if (byType.has("DocRequest")) {
    /**
     * A document chase is about the engagement's checklist, not the request
     * row — the request is only the link the client uploads through. So the
     * engagement behind it is what `stillWanted` has to read.
     */
    const { default: DocRequest } = await import("../../models/DocRequest.js");
    const { default: Engagement } = await import("../../models/Engagement.js");
    const requests = await DocRequest.find({
      _id: { $in: [...byType.get("DocRequest")] },
    })
      .select("engagementId")
      .lean();
    const engagements = await Engagement.find({
      _id: { $in: requests.map((r) => r.engagementId).filter(Boolean) },
    })
      .select("checklist status")
      .lean();
    const byId = new Map(engagements.map((e) => [String(e._id), e]));
    for (const request of requests) {
      out.set(
        String(request._id),
        byId.get(String(request.engagementId)) ?? null,
      );
    }
  }

  return out;
}

/** The capped-month key, re-exported so the screen can label a run. */
export { capMonth };
