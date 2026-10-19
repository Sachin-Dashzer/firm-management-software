// @ts-check

import Engagement from "../models/Engagement.js";
import Client from "../models/Client.js";
import Invoice from "../models/Invoice.js";
import User from "../models/User.js";
import { connectDB } from "../lib/db.js";
import { loadRules } from "../lib/mailer/rules.js";
import { notify } from "../lib/mailer/notify.js";
import { digestFor, weeklyFor } from "../lib/mailer/digest.js";
import { daysUntil, formatISTDate, startOfISTDay } from "../lib/dates.js";
import { SWEEP_OPEN_STATUSES } from "../lib/mailer/sweep.js";

const appUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );

/**
 * The 9 AM digest (spec section 12).
 *
 * One pass reads every open engagement once and sorts it into people's
 * piles in memory, rather than running three queries per member of staff.
 * With four branches and a few thousand live engagements that is one
 * read, and the firm can grow a long way before it stops being.
 *
 * Nobody is emailed an empty digest.
 *
 * @param {{ now?: Date, limit?: number }} [options]
 */
export async function dailyDigest(options = {}) {
  await connectDB();

  const now = options.now ?? new Date();
  const rules = await loadRules({ fresh: true });
  if (!rules.dailyDigest?.enabled) return { skipped: "rule switched off" };

  const { engagements, clientName } = await openWork(
    now,
    options.limit ?? 2000,
  );
  const users = await User.find({ active: true })
    .select("name email role")
    .lean();

  const endOfToday = startOfISTDay(now).getTime() + 86_400_000;
  const piles = new Map();
  const pile = (id) => {
    const key = String(id);
    if (!piles.has(key)) {
      piles.set(key, { overdue: [], dueToday: [], toReview: [] });
    }
    return piles.get(key);
  };

  const firmOverdue = [];
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  for (const engagement of engagements) {
    const due = engagement.statutoryDue ?? engagement.internalDue ?? null;
    const row = {
      clientName: clientName.get(String(engagement.clientId)) ?? "Client",
      service: engagement.templateSnapshot?.name ?? "work",
      period: engagement.periodLabel || engagement.period,
      statutoryDue: engagement.statutoryDue,
      internalDue: engagement.internalDue,
      assigneeName: nameById.get(String(engagement.assigneeId)) ?? "",
    };

    if (engagement.assigneeId && due) {
      if (due.getTime() < startOfISTDay(now).getTime()) {
        pile(engagement.assigneeId).overdue.push(row);
      } else if (due.getTime() < endOfToday) {
        pile(engagement.assigneeId).dueToday.push(row);
      }
    }

    if (
      engagement.reviewerId &&
      ["Under review", "Filed / delivered"].includes(engagement.status)
    ) {
      pile(engagement.reviewerId).toReview.push(row);
    }

    if (
      due &&
      due.getTime() < startOfISTDay(now).getTime() &&
      !["Filed / delivered", "Completed", "Cancelled"].includes(
        engagement.status,
      )
    ) {
      firmOverdue.push(row);
    }
  }

  const stamp = formatISTDate(now);
  let sent = 0;
  const empty = [];

  for (const user of users) {
    const mine = piles.get(String(user._id)) ?? {
      overdue: [],
      dueToday: [],
      toReview: [],
    };
    // partners see the firm's overdue list here instead of one email per
    // overdue job
    const built = digestFor(
      {
        ...mine,
        firmOverdue: user.role === "partner" ? firmOverdue : [],
      },
      now,
    );

    if (built.empty) {
      empty.push(user.name);
      continue;
    }

    const result = await notify({
      template: "dailyDigest",
      to: [{ id: String(user._id), name: user.name, email: user.email }],
      values: { date: stamp, lines: built.lines, link: `${appUrl()}/today` },
      // the bell already shows everything in it; one email is the point
      inApp: false,
      dedupeKey: `dailyDigest:${user._id}:${stamp}`,
    });

    if (result[0]?.status === "queued" || result[0]?.status === "held")
      sent += 1;
  }

  return { people: users.length, sent, nothingToSay: empty.length };
}

/**
 * The partners' Monday summary (spec section 12).
 *
 * Counts, not lists: a partner wants to know whether the week was normal
 * before deciding where to look.
 *
 * @param {{ now?: Date }} [options]
 */
export async function weeklySummary(options = {}) {
  await connectDB();

  const now = options.now ?? new Date();
  const rules = await loadRules({ fresh: true });
  if (!rules.weeklySummary?.enabled) return { skipped: "rule switched off" };

  const weekAgo = new Date(startOfISTDay(now).getTime() - 7 * 86_400_000);
  const todayStart = startOfISTDay(now);

  const [
    started,
    completed,
    awaitingReview,
    unbilled,
    overdueRows,
    invoices,
    partners,
  ] = await Promise.all([
    Engagement.countDocuments({ createdAt: { $gte: weekAgo } }),
    Engagement.countDocuments({
      status: "Completed",
      updatedAt: { $gte: weekAgo },
    }),
    Engagement.countDocuments({
      status: { $in: ["Under review", "Filed / delivered"] },
    }),
    Engagement.countDocuments({
      status: "Completed",
      billingStatus: "Unbilled",
    }),
    Engagement.find({
      status: { $nin: ["Filed / delivered", "Completed", "Cancelled"] },
      $or: [
        { statutoryDue: { $lt: todayStart } },
        { statutoryDue: null, internalDue: { $lt: todayStart } },
      ],
    })
      .select("assigneeId")
      .limit(2000)
      .lean(),
    Invoice.find({
      status: { $in: ["Sent", "Partially paid", "Disputed"] },
      deletedAt: null,
    })
      .select("totalPaise paidPaise tdsCreditedPaise dueDate")
      .limit(5000)
      .lean(),
    User.find({ active: true, role: "partner" }).select("name email").lean(),
  ]);

  let receivablePaise = 0;
  let overduePaise = 0;
  for (const invoice of invoices) {
    const outstanding = Math.max(
      0,
      (invoice.totalPaise ?? 0) -
        (invoice.paidPaise ?? 0) -
        (invoice.tdsCreditedPaise ?? 0),
    );
    receivablePaise += outstanding;
    if (invoice.dueDate && daysUntil(invoice.dueDate, now) < 0) {
      overduePaise += outstanding;
    }
  }

  const staff = await User.find({ active: true }).select("name").lean();
  const nameById = new Map(staff.map((u) => [String(u._id), u.name]));
  const perPerson = new Map();
  for (const row of overdueRows) {
    const key = row.assigneeId ? String(row.assigneeId) : "";
    perPerson.set(key, (perPerson.get(key) ?? 0) + 1);
  }

  const built = weeklyFor({
    started,
    completed,
    overdue: overdueRows.length,
    awaitingReview,
    unbilled,
    receivablePaise,
    overduePaise,
    byPerson: [...perPerson.entries()]
      .map(([id, overdue]) => ({
        name: nameById.get(id) ?? "Unassigned",
        overdue,
      }))
      .sort((a, b) => b.overdue - a.overdue)
      .slice(0, 10),
  });

  const stamp = formatISTDate(now);
  let sent = 0;

  for (const partner of partners) {
    const result = await notify({
      template: "weeklySummary",
      to: [
        { id: String(partner._id), name: partner.name, email: partner.email },
      ],
      values: {
        date: stamp,
        lines: built.lines,
        link: `${appUrl()}/engagements`,
      },
      inApp: false,
      dedupeKey: `weeklySummary:${partner._id}:${stamp}`,
    });
    if (result[0]?.status === "queued" || result[0]?.status === "held")
      sent += 1;
  }

  return { partners: partners.length, sent };
}

/** Open work with a date on it, plus the client names to print. */
async function openWork(now, limit) {
  const engagements = await Engagement.find({
    status: SWEEP_OPEN_STATUSES,
  })
    .select(
      "clientId templateSnapshot.name period periodLabel status statutoryDue internalDue assigneeId reviewerId",
    )
    .sort({ statutoryDue: 1, internalDue: 1 })
    .limit(limit)
    .lean();

  const clients = await Client.find({
    _id: { $in: [...new Set(engagements.map((e) => String(e.clientId)))] },
  })
    .select("legalName tradeName")
    .lean();

  return {
    engagements,
    clientName: new Map(
      clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
    ),
  };
}

export default dailyDigest;
