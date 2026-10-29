// @ts-check

import Engagement from "../../models/Engagement.js";
import Invoice from "../../models/Invoice.js";
import Client from "../../models/Client.js";
import Comment from "../../models/Comment.js";
import User from "../../models/User.js";
import { branchFilter, can, seesOnlyOwnRecords } from "../permissions.js";
/**
 * The display half lives in `shape.js` and is re-exported here, so the
 * server keeps one import — a client component that needs the labels must
 * not reach a module that imports Mongoose, or the whole driver is bundled
 * for the browser and the build refuses.
 */
export {
  SEVERITY_LABELS,
  KINDS,
  isMine,
  filterIssues,
  countByKind,
} from "./shape.js";
import { PARTNER, ACCOUNTS } from "./shape.js";
import { engagementQuery } from "../engagements/filter.js";
import { startOfISTDay, daysUntil, formatISTDate } from "../dates.js";
import { formatPaise } from "../money.js";
import { outstandingOf } from "../billing/allocation.js";
import { promiseHolds, promiseDate } from "../billing/promise.js";
import { checkPAN, checkGSTIN } from "../validators.js";
import {
  milestoneState,
  nextOpenMilestone,
  proofPending,
  OVERDUE,
} from "../engagements/milestones.js";
import {
  isApproved,
  isClientConfirmed,
  needsClientConfirmation,
  blocksFiling,
  versionOf,
} from "../engagements/gates.js";
import { atRisk } from "../engagements/risk.js";
import { coversDay } from "../team/leave.js";
import { feeState, pendingWaiver, isChargeable } from "../engagements/scope.js";
import { advances } from "../reports/figures.js";

/**
 * Everything that needs attention, worked out live from the records (P3-6).
 *
 * The thing worth copying from the prototype is what this refuses to do:
 * **there is nothing to mark resolved.** No `resolved` flag, no dismissals,
 * no issues collection. Fix the record and the row is gone the next time the
 * page is drawn. A list you tick is a second list to maintain, and it goes
 * stale — which is how a firm ends up with an alerts screen nobody reads.
 *
 * Everything below reads collections that already exist. Nothing is stored.
 *
 * Scope is applied per group, from the same helpers the lists use, and a
 * group whose area the reader may not open is not computed at all. This page
 * gathers in one place what sixty routes are careful about separately, so it
 * is the one most able to leak — hence `tests/issues.test.js` checking the
 * scoping rather than only the rules.
 */

/** How long a requested document may sit before it is somebody's problem. */
const CHASE_AFTER_DAYS = 3;
/** How close a deadline has to be for "not approved yet" to be a problem. */
const DEADLINE_SOON_DAYS = 7;
/** How long finished work may sit unbilled before it is a row. */
const UNBILLED_AFTER_DAYS = 7;

const DAY = 86_400_000;
/**
 * Every row this person may see.
 *
 * @param {{id: string, role: string, branchIds?: string[], active?: boolean}} actor
 * @param {Date} [now]
 */
export async function issueRows(actor, now = new Date()) {
  const today = startOfISTDay(now);
  const work = can(actor, "view", "engagementsWork");
  const money = can(actor, "view", "invoices");
  const dsc = can(actor, "view", "dsc");
  // an employee or intern reaches clients one at a time through a grant
  // (owner decision D3), so a firm-wide sweep of client records is not
  // theirs to see — and these rows fall to a manager anyway
  const clients =
    can(actor, "view", "clients") && !seesOnlyOwnRecords(actor, "clients");

  const [open, finished, overdueInvoices, unallocated, dscs, clientRows, asks] =
    await Promise.all([
      work
        ? Engagement.find(engagementQuery(actor, {}, now))
            .select(
              "code status clientId assigneeId reviewerId periodLabel period milestones checklist internalDue version review clientConfirmation templateSnapshot feePaise scope scopeReason waiver billingStatus",
            )
            .limit(3000)
            .lean()
        : [],
      money
        ? Engagement.find({
            ...(branchFilter(actor, "invoices") ?? {}),
            billingStatus: "Unbilled",
            status: { $in: ["Filed / delivered", "Completed"] },
          })
            .select(
              "code clientId periodLabel period templateSnapshot feePaise scope scopeReason waiver completedAt billingStatus status",
            )
            .limit(2000)
            .lean()
        : [],
      money
        ? Invoice.find({
            ...(branchFilter(actor, "invoices") ?? {}),
            status: { $in: ["Sent", "Partially paid", "Disputed"] },
            dueDate: { $lt: today },
          })
            .select(
              "number clientId dueDate totalPaise paidPaise tdsCreditedPaise promise status",
            )
            .limit(2000)
            .lean()
        : [],
      money ? advances(actor) : [],
      dsc ? expiringDscs(actor, today) : [],
      clients
        ? Client.find({
            ...(branchFilter(actor, "clients") ?? {}),
            status: { $ne: "Closed" },
          })
            .select("legalName tradeName pan gstins")
            .limit(3000)
            .lean()
        : [],
      clients ? unansweredChangeRequests(actor) : [],
    ]);

  /**
   * Clients with somebody who may confirm figures, so a return waiting on a
   * confirmation nobody can give becomes a row of its own (P3-6).
   */
  const canConfirm = new Set(
    work
      ? (
          await (
            await import("../../models/ClientUser.js")
          ).default
            .find({ active: true, mayConfirmFigures: true })
            .select("clientId")
            .limit(2000)
            .lean()
        ).map((u) => String(u.clientId))
      : [],
  );

  /** @type {any[]} */
  const rows = [];
  const add = (row) => rows.push({ severity: 2, ownerId: null, ...row });

  // --- work in progress ----------------------------------------------------
  for (const e of open) {
    const job = `${e.templateSnapshot?.name ?? "Work"} ${e.periodLabel || e.period}`;
    const href = `/engagements/${e._id}`;
    const assignee = e.assigneeId ? String(e.assigneeId) : null;
    const reviewer = e.reviewerId ? String(e.reviewerId) : null;

    const late = (e.milestones ?? []).filter(
      (m) => milestoneState(m, now) === OVERDUE,
    );
    if (late.length) {
      add({
        key: `late:${e._id}`,
        kind: "Deadlines",
        severity: 3,
        text: `Statutory date passed: ${late
          .map((m) => `${m.name} (${formatISTDate(m.dueDate)})`)
          .join(", ")} — ${job}`,
        clientId: e.clientId,
        ownerId: assignee,
        href,
      });
    } else {
      // at risk and "due soon, not approved" both describe work that can
      // still be saved, so they are only asked once the overdue case is out
      const risk = atRisk(e, now);
      if (risk) {
        add({
          key: `risk:${e._id}`,
          kind: "Deadlines",
          text: `${risk}: ${job}`,
          clientId: e.clientId,
          ownerId: assignee,
          href,
        });
      }
      const next = nextOpenMilestone(e);
      const left = next?.dueDate ? daysUntil(next.dueDate, now) : null;
      if (left !== null && left <= DEADLINE_SOON_DAYS && !isApproved(e)) {
        add({
          key: `soon:${e._id}`,
          kind: "Deadlines",
          text: `${
            left === 0
              ? "Due today"
              : left === 1
                ? "Due tomorrow"
                : `Due in ${left} days`
          }, not approved yet: ${next.name} — ${job}`,
          clientId: e.clientId,
          ownerId: assignee,
          href,
        });
      }
    }

    if (e.status === "Under review" && !isApproved(e)) {
      add({
        key: `review:${e._id}`,
        kind: "Review",
        text: `Waiting for review: ${job}`,
        clientId: e.clientId,
        ownerId: reviewer,
        href,
        actions: [{ act: "approve-work", label: "Approve", id: String(e._id) }],
      });
    }

    /**
     * Maker and checker are the same person (CLAUDE.md rule 4). The server
     * refuses the completion, so this is not a hole — but it is a job that
     * will stall at the last gate, and finding that out on the due date is
     * the avoidable part.
     */
    if (assignee && reviewer && assignee === reviewer) {
      add({
        key: `maker:${e._id}`,
        kind: "Review",
        severity: 3,
        text: `The same person prepares and reviews this: ${job}`,
        clientId: e.clientId,
        ownerId: null,
        href,
      });
    }

    if (isApproved(e) && needsClientConfirmation(e) && !isClientConfirmed(e)) {
      add({
        key: `confirm:${e._id}`,
        kind: "Client confirmation",
        text: `Client to confirm version ${versionOf(e)}: ${job}`,
        clientId: e.clientId,
        ownerId: assignee,
        href,
      });
      /**
       * And the case that makes that row unanswerable: nobody at the client
       * has been given the right to confirm, so the return is waiting on a
       * person who does not exist. Worth its own row, because the fix is at
       * the firm's end and nothing else on screen would ever say so.
       */
      if (!canConfirm.has(String(e.clientId))) {
        add({
          key: `noconfirmer:${e._id}`,
          kind: "Client confirmation",
          severity: 3,
          text: `Nobody at this client can confirm figures, and ${job} is waiting for them`,
          clientId: e.clientId,
          ownerId: null,
          href: `/clients/${e.clientId}?tab=portal`,
        });
      }
    }

    if (!blocksFiling(e) && (e.milestones ?? []).some((m) => !m.filedOn)) {
      add({
        key: `file:${e._id}`,
        kind: "Filing",
        text: `Approved — file it and record the acknowledgement: ${job}`,
        clientId: e.clientId,
        ownerId: assignee,
        href,
      });
    }

    if (proofPending(e)) {
      add({
        key: `proof:${e._id}`,
        kind: "Filing",
        severity: 1,
        text: `Filed, acknowledgement not attached: ${job}`,
        clientId: e.clientId,
        ownerId: assignee,
        href,
      });
    }

    for (const item of e.checklist ?? []) {
      const itemId = String(item._id);

      if (["Received", "Format checked"].includes(item.status)) {
        add({
          key: `upload:${itemId}`,
          kind: "Uploads",
          text: `Upload to check: ${item.name} — ${job}`,
          clientId: e.clientId,
          ownerId: assignee,
          href,
          actions: [
            {
              act: "accept-upload",
              label: "Accept",
              id: String(e._id),
              itemId,
            },
          ],
        });
      }

      if (item.status === "Replacement requested") {
        add({
          key: `replace:${itemId}`,
          kind: "Waiting on clients",
          severity: 1,
          text: `Replacement awaited: ${item.name} — ${job}`,
          clientId: e.clientId,
          ownerId: assignee,
          href,
        });
      } else if (
        item.status === "Requested" &&
        item.requestedAt &&
        now.getTime() - item.requestedAt.getTime() > CHASE_AFTER_DAYS * DAY
      ) {
        add({
          key: `await:${itemId}`,
          kind: "Waiting on clients",
          severity: 1,
          text: `Not received for ${-daysUntil(item.requestedAt, now)} days: ${item.name} — ${job}`,
          clientId: e.clientId,
          ownerId: assignee,
          href,
        });
      }

      const reply = item.clientReply;
      if (reply?.kind === "cannot") {
        add({
          key: `cannot:${itemId}`,
          kind: "Waiting on clients",
          text: `Client cannot provide ${item.name} — decide how to proceed${
            reply.note ? ` (${reply.note})` : ""
          }`,
          clientId: e.clientId,
          ownerId: assignee,
          href,
        });
      }
      if (reply?.kind === "question" && reply.question && !reply.answer) {
        add({
          key: `question:${itemId}`,
          kind: "Waiting on clients",
          text: `Client asked and nobody has answered: “${reply.question.slice(0, 70)}”`,
          clientId: e.clientId,
          ownerId: assignee,
          href,
        });
      }
      if (
        reply?.kind === "delegated" &&
        !["Accepted", "Not required"].includes(item.status)
      ) {
        add({
          key: `delegated:${itemId}`,
          kind: "Waiting on clients",
          severity: 1,
          text: `${reply.delegateName || "Somebody else"} is to send ${item.name} — ${job}`,
          clientId: e.clientId,
          ownerId: assignee,
          href,
        });
      }
    }
  }

  // --- finished work and its money -----------------------------------------
  for (const e of finished) {
    const job = `${e.templateSnapshot?.name ?? "Work"} ${e.periodLabel || e.period}`;
    const state = feeState(e);
    const waiting = pendingWaiver(e);

    if (waiting) {
      add({
        key: `waiver:${e._id}`,
        kind: "Money",
        text: `Fee waiver asked for ${job} — ${waiting.reason}`,
        clientId: e.clientId,
        ownerId: PARTNER,
        href: "/billing?tab=ready",
        actions: [
          { act: "approve-waiver", label: "Approve", id: String(e._id) },
        ],
      });
    } else if (state.key === "fee-not-agreed") {
      add({
        key: `fee:${e._id}`,
        kind: "Money",
        severity: 1,
        text: `Fee not agreed: ${job}`,
        clientId: e.clientId,
        ownerId: ACCOUNTS,
        href: "/billing?tab=ready",
      });
    } else if (
      isChargeable(e) &&
      e.completedAt &&
      now.getTime() - e.completedAt.getTime() > UNBILLED_AFTER_DAYS * DAY
    ) {
      add({
        key: `unbilled:${e._id}`,
        kind: "Money",
        text: `Finished ${-daysUntil(e.completedAt, now)} days ago, not billed: ${job} · ${formatPaise(e.feePaise ?? 0)}`,
        clientId: e.clientId,
        ownerId: ACCOUNTS,
        href: `/invoices/new?client=${e.clientId}`,
      });
    }
  }

  for (const invoice of overdueInvoices) {
    const left = outstandingOf(invoice);
    if (left <= 0) continue;
    const by = -daysUntil(invoice.dueDate, now);
    const held = promiseHolds(invoice, now);
    add({
      key: `invoice:${invoice._id}`,
      kind: "Money",
      // over two months is a different conversation from over two weeks
      severity: held ? 1 : by > 60 ? 3 : 2,
      text: `Invoice ${invoice.number} overdue ${by} days · ${formatPaise(left)}${
        held ? ` · promised ${formatISTDate(promiseDate(invoice))}` : ""
      }`,
      clientId: invoice.clientId,
      ownerId: ACCOUNTS,
      href: `/invoices/${invoice._id}`,
    });
  }

  for (const client of unallocated) {
    for (const payment of client.payments) {
      add({
        key: `receipt:${payment.id}`,
        kind: "Money",
        severity: 1,
        text: `Receipt of ${formatPaise(payment.paise)} on ${formatISTDate(payment.date)}${
          payment.reference ? ` (${payment.reference})` : ""
        } is not allocated to an invoice`,
        clientId: client.clientId,
        ownerId: ACCOUNTS,
        href: `/clients/${client.clientId}?tab=ledger`,
      });
    }
  }

  // --- registers and records -----------------------------------------------
  for (const row of dscs) {
    const left = daysUntil(row.validTill, now);
    add({
      key: `dsc:${row._id}`,
      kind: "Registers",
      severity: left < 0 ? 3 : 1,
      text:
        left < 0
          ? `DSC expired ${-left} days ago: ${row.holderName}`
          : `DSC expires in ${left} days: ${row.holderName}`,
      clientId: row.clientId ?? null,
      ownerId: null,
      href: "/practice/dsc?soon=1",
    });
  }

  for (const client of clientRows) {
    const problems = [];
    if (client.pan) {
      const result = checkPAN(client.pan);
      if (!result.ok) problems.push(`PAN: ${result.reason}`);
    }
    for (const entry of client.gstins ?? []) {
      const result = checkGSTIN(entry.gstin);
      if (!result.ok) problems.push(`GSTIN ${entry.gstin}: ${result.reason}`);
    }
    if (problems.length) {
      add({
        key: `identity:${client._id}`,
        kind: "Client data",
        severity: 1,
        text: `${client.tradeName || client.legalName}: ${problems.join("; ")}`,
        clientId: client._id,
        ownerId: null,
        href: `/clients/${client._id}`,
      });
    }
  }

  /**
   * Spec section 9's warning, where everybody will see it: somebody is away
   * — or about to be — with work falling due while they are gone (P3-16).
   *
   * It is a partner's row because the answer is a decision about who takes
   * the work, and it names the cover rather than implying there is nobody:
   * a cover is required on every leave, so the question is only ever
   * whether watching it is enough.
   */
  if (work) {
    const soon = new Date(today.getTime() + 14 * DAY);
    const leaves = await (
      await import("../../models/Leave.js")
    ).default
      .find({ from: { $lte: soon }, to: { $gte: today } })
      .select("userId coverId from to kind")
      .limit(200)
      .lean();

    if (leaves.length) {
      const names = new Map(
        (
          await User.find({
            _id: {
              $in: leaves.flatMap((leave) => [leave.userId, leave.coverId]),
            },
          })
            .select("name")
            .lean()
        ).map((person) => [String(person._id), person.name]),
      );

      for (const leave of leaves) {
        const who = String(leave.userId);
        const due = open.filter((engagement) => {
          if (
            String(engagement.assigneeId ?? "") !== who &&
            String(engagement.reviewerId ?? "") !== who
          ) {
            return false;
          }
          const next = nextOpenMilestone(engagement);
          const date = next?.dueDate ?? engagement.internalDue ?? null;
          return date && coversDay(leave, new Date(date));
        });
        if (!due.length) continue;

        add({
          key: `away:${leave._id}`,
          kind: "Deadlines",
          severity: 2,
          text: `${names.get(who) ?? "Somebody"} is away ${formatISTDate(leave.from)} – ${formatISTDate(leave.to)} with ${due.length} ${due.length === 1 ? "job due" : "jobs due"} while they are gone. ${names.get(String(leave.coverId)) ?? "Their cover"} is covering`,
          clientId: null,
          ownerId: PARTNER,
          href: `/team/${who}/takeover`,
        });
      }
    }
  }

  /**
   * Client changes a partner has to decide on (P3-18a). The gap report
   * listed "identity changes held" as a row this page should have and
   * nothing produced one, because nothing held a change until now.
   */
  if (clients) {
    const waiting = await (
      await import("../../models/HeldChange.js")
    ).default
      .find({ state: "pending" })
      .select("clientId clientName label askedByName")
      .limit(200)
      .lean();

    for (const row of waiting) {
      add({
        key: `held:${row._id}`,
        kind: "Client data",
        severity: 2,
        text: `${row.clientName || "A client"}: ${row.label} changed by ${row.askedByName} and waiting for a partner`,
        clientId: row.clientId,
        ownerId: PARTNER,
        href: "/clients/changes",
      });
    }
  }

  for (const ask of asks) {
    add({
      key: `change:${ask._id}`,
      kind: "Client data",
      text: `${ask.createdByName} asked for a change and nobody has replied: “${ask.body.slice(0, 70)}”`,
      clientId: ask.clientId,
      ownerId: null,
      href: `/clients/${ask.clientId}?tab=activity`,
    });
  }

  return decorate(rows);
}

/** DSCs expiring within a month, or already expired. */
async function expiringDscs(actor, today) {
  const { default: Dsc } = await import("../../models/Dsc.js");
  return Dsc.find({
    ...(branchFilter(actor, "dsc") ?? {}),
    validTill: { $lt: new Date(today.getTime() + 30 * DAY) },
  })
    .select("holderName clientId validTill")
    .limit(500)
    .lean();
}

/**
 * Change requests a client sent from the portal that nobody has replied to.
 *
 * "Replied to" means a note written on that client *after* the request — the
 * same shape the action on the row produces. There is no answered flag, and
 * deliberately so: a flag is a thing to maintain, and the reply itself is
 * the evidence that the request was dealt with.
 *
 * ponytail: one note anywhere on the client counts as a reply to the oldest
 * outstanding request. Per-request threading is P3-17's inbox, and until
 * there is one, two requests a day apart are rare enough not to pay for it.
 */
async function unansweredChangeRequests(actor) {
  const scope = branchFilter(actor, "clients") ?? {};
  const visible = scope.branchId
    ? await Client.find(scope).select("_id").limit(3000).lean()
    : null;
  const clientFilter = visible
    ? { clientId: { $in: visible.map((c) => c._id) } }
    : {};

  const [requests, replies] = await Promise.all([
    Comment.find({
      ...clientFilter,
      entityType: "Client",
      kind: "Change request",
    })
      .select("clientId body createdByName occurredAt")
      .sort({ occurredAt: -1 })
      .limit(500)
      .lean(),
    Comment.find({ ...clientFilter, entityType: "Client", kind: "Note" })
      .select("clientId occurredAt")
      .sort({ occurredAt: -1 })
      .limit(2000)
      .lean(),
  ]);

  const lastReply = new Map();
  for (const reply of replies) {
    const key = String(reply.clientId);
    const at = reply.occurredAt?.getTime() ?? 0;
    if (at > (lastReply.get(key) ?? 0)) lastReply.set(key, at);
  }

  return requests.filter(
    (request) =>
      (lastReply.get(String(request.clientId)) ?? 0) <
      (request.occurredAt?.getTime() ?? 0),
  );
}

/** Put the client's and the owner's names on the rows, in two lookups. */
async function decorate(rows) {
  const clientIds = [
    ...new Set(
      rows
        .map((r) => r.clientId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const ownerIds = [
    ...new Set(
      rows
        .map((r) => r.ownerId)
        .filter((id) => id && id !== PARTNER && id !== ACCOUNTS)
        .map(String),
    ),
  ];

  const [clients, people] = await Promise.all([
    clientIds.length
      ? Client.find({ _id: { $in: clientIds } })
          .select("legalName tradeName")
          .lean()
      : [],
    ownerIds.length
      ? User.find({ _id: { $in: ownerIds } })
          .select("name")
          .lean()
      : [],
  ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const personName = new Map(people.map((u) => [String(u._id), u.name]));

  return rows.map((row) => ({
    ...row,
    clientId: row.clientId ? String(row.clientId) : null,
    clientName: row.clientId
      ? (clientName.get(String(row.clientId)) ?? "")
      : "",
    ownerName:
      row.ownerId === PARTNER
        ? "A partner"
        : row.ownerId === ACCOUNTS
          ? "Accounts"
          : row.ownerId
            ? (personName.get(String(row.ownerId)) ?? "")
            : "Any manager",
    actions: row.actions ?? [],
  }));
}
