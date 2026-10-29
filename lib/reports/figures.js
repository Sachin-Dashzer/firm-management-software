// @ts-check

import Engagement from "../../models/Engagement.js";
import Invoice from "../../models/Invoice.js";
import Payment from "../../models/Payment.js";
import { engagementQuery } from "../engagements/filter.js";
import { branchFilter } from "../permissions.js";
import { isChargeable } from "../engagements/scope.js";
import { atRisk } from "../engagements/risk.js";
import { outstandingOf, ageReceivables } from "../billing/allocation.js";
import {
  startOfISTDay,
  istParts,
  istDate,
  financialYearRange,
} from "../dates.js";

/**
 * The numbers on the dashboards (spec section 10).
 *
 * The rule in spec section 17 is that every figure on a dashboard matches
 * the list underneath it. The only way to be sure of that is to stop
 * computing figures separately: a tile here is a **filter**, counted with
 * the same `engagementQuery` the list screen and the export use, and its
 * link is that same filter in the URL.
 *
 * So a tile cannot drift from its list. If the two ever disagree it is
 * because the query builder is wrong, which the list would show too —
 * rather than because a dashboard did its own arithmetic.
 */

/**
 * @typedef {object} Tile
 * @property {string} label
 * @property {number} value
 * @property {string} href
 * @property {string} [tone}  "plain" | "late" | "soon"
 */

/** A tile defined by the filter behind it. */
async function countOf(actor, label, params, tone = "plain") {
  const count = await Engagement.countDocuments(engagementQuery(actor, params));
  const search = new URLSearchParams(params).toString();
  return {
    label,
    value: count,
    href: `/engagements${search ? `?${search}` : ""}`,
    tone,
  };
}

/**
 * Open, overdue and due-this-week, which is the shape of every dashboard
 * in spec section 10 whoever is looking.
 *
 * @param {object} actor
 * @param {Record<string, string>} [scope] extra filter, e.g. {mine: "1"}
 */
export async function workTiles(actor, scope = {}) {
  return Promise.all([
    countOf(actor, "Open", { ...scope }),
    countOf(actor, "Overdue", { ...scope, due: "overdue" }, "late"),
    countOf(actor, "Due this week", { ...scope, due: "week" }, "soon"),
    countOf(actor, "Awaiting documents", {
      ...scope,
      status: "Awaiting documents",
    }),
    countOf(actor, "Under review", { ...scope, status: "Under review" }),
  ]);
}

/**
 * Open work by branch, for the partner's overview. Each row links to that
 * branch's list, filtered the same way the number was counted.
 */
export async function byBranch(actor, branches) {
  const rows = await Promise.all(
    branches.map(async (branch) => {
      const id = String(branch._id);
      const [open, overdue] = await Promise.all([
        Engagement.countDocuments(engagementQuery(actor, { branch: id })),
        Engagement.countDocuments(
          engagementQuery(actor, { branch: id, due: "overdue" }),
        ),
      ]);
      return {
        id,
        code: branch.code,
        name: branch.name,
        open,
        overdue,
        href: `/engagements?branch=${id}`,
      };
    }),
  );

  // a branch with nothing open is not worth a row on a dashboard
  return rows.filter((row) => row.open > 0 || row.overdue > 0);
}

/**
 * Open work whose deadline is still ahead but whose own target has gone
 * (P3-5).
 *
 * Counted in JavaScript because `atRisk()` reads the next open milestone,
 * the approval's version and working days — none of which a Mongo filter can
 * express. It reads the same function the list and the report do, so the
 * tile cannot disagree with the list it opens.
 */
export async function atRiskTile(actor, now = new Date()) {
  const rows = await Engagement.find(engagementQuery(actor, {}, now))
    .select("status milestones internalDue review version templateSnapshot")
    .limit(5000)
    .lean();

  const count = rows.filter((row) => atRisk(row, now)).length;
  return { count, href: "/reports/at-risk" };
}

/**
 * Work finished and not invoiced (spec section 10), in rupees as well as
 * in jobs — the figure the firm loses money by not looking at.
 */
export async function unbilled(actor) {
  const scope = branchFilter(actor, "invoices") ?? {};
  const rows = await Engagement.find({
    ...scope,
    billingStatus: "Unbilled",
    status: { $in: ["Filed / delivered", "Completed"] },
  })
    .select("feePaise scope")
    .limit(5000)
    .lean();

  /**
   * Waived and retainer work is finished and unbilled, and it is not money
   * the firm is owed (P3-4). Counting it here would make the headline figure
   * a number nobody could reconcile — which is the fault this step exists to
   * fix, not one to move somewhere else.
   */
  const chargeable = rows.filter(isChargeable);

  return {
    count: chargeable.length,
    paise: chargeable.reduce((sum, row) => sum + (row.feePaise ?? 0), 0),
    // the ones settled another way, so the tile can say they are not missing
    settled: rows.length - chargeable.length,
    href: "/billing?tab=ready",
  };
}

/** What is owed and how old it is (spec section 7's ageing, reused). */
export async function receivables(actor, now = new Date()) {
  const scope = branchFilter(actor, "invoices") ?? {};
  // the soft-delete plugin already hides deleted invoices from every query
  const invoices = await Invoice.find({
    ...scope,
    status: { $in: ["Sent", "Partially paid", "Disputed"] },
  })
    .select("totalPaise paidPaise tdsCreditedPaise dueDate status")
    .limit(10000)
    .lean();

  // .lean() has no virtuals, so the outstanding figure is computed by the
  // same helper the invoice screens use
  const withOutstanding = invoices.map((invoice) => ({
    ...invoice,
    outstandingPaise: outstandingOf(invoice),
  }));

  const ageing = ageReceivables(withOutstanding, now);
  const overdue = withOutstanding.filter(
    (invoice) =>
      invoice.dueDate && new Date(invoice.dueDate) < startOfISTDay(now),
  );

  return {
    ageing,
    overdueCount: overdue.length,
    overduePaise: overdue.reduce(
      (sum, invoice) => sum + invoice.outstandingPaise,
      0,
    ),
    href: "/billing?tab=collections",
  };
}

/**
 * Money in, this month against last (spec section 10). Payments, not
 * invoices: collections are what reached the bank.
 */
export async function collections(actor, now = new Date()) {
  const scope = branchFilter(actor, "invoices") ?? {};
  const { year, month } = istParts(now);

  const thisMonthStart = istDate(year, month, 1);
  const lastMonthStart = istDate(
    month === 1 ? year - 1 : year,
    month === 1 ? 12 : month - 1,
    1,
  );

  const payments = await Payment.find({
    ...scope,
    date: { $gte: lastMonthStart },
  })
    .select("amountPaise date allocations")
    .limit(10000)
    .lean();

  let thisMonth = 0;
  let lastMonth = 0;
  /**
   * How much of this month's money has not been put against an invoice yet
   * (P3-3).
   *
   * The figure above is right either way — it is what reached the bank, by
   * the date it reached it — but read on its own it sounds reconciled. This
   * line says how much of it still has to be placed, so nobody takes the
   * total for a tidy one.
   */
  let unallocated = 0;
  for (const payment of payments) {
    const when = new Date(payment.date);
    if (when >= thisMonthStart) {
      thisMonth += payment.amountPaise ?? 0;
      const used = (payment.allocations ?? []).reduce(
        (sum, a) => sum + (a.amountPaise ?? 0),
        0,
      );
      unallocated += Math.max(0, (payment.amountPaise ?? 0) - used);
    } else lastMonth += payment.amountPaise ?? 0;
  }

  return {
    thisMonth,
    lastMonth,
    unallocated,
    href: "/invoices?tab=payments",
  };
}

/**
 * Clients holding credit: money received that is not against any invoice
 * (P3-3).
 *
 * `suggestAllocation` has always said "whatever is left is an advance:
 * credit on the client, not lost", and it was true — but the only place it
 * appeared was a sentence at the moment of entry. After that it was
 * invisible, and an advance nobody can see is an advance nobody applies.
 */
export async function advances(actor) {
  const scope = branchFilter(actor, "invoices") ?? {};

  const payments = await Payment.find({ ...scope })
    .select("clientId amountPaise allocations date reference")
    .sort({ date: -1 })
    .limit(5000)
    .lean();

  const byClient = new Map();
  for (const payment of payments) {
    const used = (payment.allocations ?? []).reduce(
      (sum, a) => sum + (a.amountPaise ?? 0),
      0,
    );
    const left = Math.max(0, (payment.amountPaise ?? 0) - used);
    if (left === 0) continue;

    const key = String(payment.clientId);
    const row = byClient.get(key) ?? { clientId: key, paise: 0, payments: [] };
    row.paise += left;
    row.payments.push({
      id: String(payment._id),
      date: payment.date,
      paise: left,
      reference: payment.reference ?? "",
    });
    byClient.set(key, row);
  }

  return [...byClient.values()].sort((a, b) => b.paise - a.paise);
}

/**
 * Revenue by service category for the financial year (spec section 10),
 * from issued invoices rather than from fees agreed — what was billed is
 * the only revenue there is.
 */
export async function revenueByCategory(actor, now = new Date()) {
  const scope = branchFilter(actor, "invoices") ?? {};
  const { start, end } = financialYearRange(now);

  const invoices = await Invoice.find({
    ...scope,
    status: { $nin: ["Draft", "Cancelled"] },
    date: { $gte: start, $lt: end },
  })
    .select("lines")
    .limit(10000)
    .lean();

  // an invoice line names the work, not the kind of work, so the category
  // comes from the engagement's snapshot of the service it was created from
  const lines = invoices.flatMap((invoice) => invoice.lines ?? []);
  const engagements = await Engagement.find({
    _id: { $in: lines.map((line) => line.engagementId).filter(Boolean) },
  })
    .select("templateSnapshot")
    .lean();
  const categoryOf = new Map(
    engagements.map((e) => [String(e._id), e.templateSnapshot?.category]),
  );

  /** @type {Map<string, number>} */
  const byCategory = new Map();
  for (const line of lines) {
    // a line typed in by hand with no engagement behind it is still revenue
    const category =
      categoryOf.get(String(line.engagementId)) || "Other / ad hoc";
    byCategory.set(
      category,
      (byCategory.get(category) ?? 0) +
        (line.netPaise || line.amountPaise || 0),
    );
  }

  return [...byCategory.entries()]
    .map(([label, paise]) => ({ label, paise }))
    .sort((a, b) => b.paise - a.paise);
}

/**
 * How often work comes back, by the person who did it (spec section 10's
 * rework rate).
 *
 * Shown as "n of m jobs came back", not as a bare percentage: three out of
 * four reads very differently from thirty out of forty, and a percentage
 * hides which one it is.
 */
export async function reworkRate(actor, now = new Date()) {
  const scope = branchFilter(actor, "engagementsWork") ?? {};
  const { start } = financialYearRange(now);

  const rows = await Engagement.find({
    ...scope,
    createdAt: { $gte: start },
    assigneeId: { $ne: null },
  })
    .select("assigneeId reworkCount")
    .limit(20000)
    .lean();

  /** @type {Map<string, {jobs: number, returned: number}>} */
  const byPerson = new Map();
  for (const row of rows) {
    const key = String(row.assigneeId);
    const entry = byPerson.get(key) ?? { jobs: 0, returned: 0 };
    entry.jobs += 1;
    if ((row.reworkCount ?? 0) > 0) entry.returned += 1;
    byPerson.set(key, entry);
  }

  return [...byPerson.entries()]
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => b.returned - a.returned || b.jobs - a.jobs);
}

/** Payments entered today, for the accounts dashboard. */
export async function paymentsToday(actor, now = new Date()) {
  const scope = branchFilter(actor, "invoices") ?? {};
  const today = startOfISTDay(now);

  const payments = await Payment.find({
    ...scope,
    date: { $gte: today },
  })
    .select("amountPaise")
    .limit(1000)
    .lean();

  return {
    count: payments.length,
    paise: payments.reduce((sum, p) => sum + (p.amountPaise ?? 0), 0),
    href: "/invoices?tab=payments",
  };
}

/**
 * TDS the client said they would deduct and which has not been credited
 * against a payment yet (spec section 10: TDS pending reconciliation).
 */
export async function tdsPending(actor) {
  const scope = branchFilter(actor, "invoices") ?? {};
  const invoices = await Invoice.find({
    ...scope,
    tdsExpectedPaise: { $gt: 0 },
    status: { $nin: ["Draft", "Cancelled"] },
  })
    .select("tdsExpectedPaise tdsCreditedPaise")
    .limit(5000)
    .lean();

  const rows = invoices.filter(
    (invoice) =>
      (invoice.tdsExpectedPaise ?? 0) > (invoice.tdsCreditedPaise ?? 0),
  );

  return {
    count: rows.length,
    paise: rows.reduce(
      (sum, invoice) =>
        sum +
        ((invoice.tdsExpectedPaise ?? 0) - (invoice.tdsCreditedPaise ?? 0)),
      0,
    ),
    href: "/invoices?tds=pending",
  };
}

/**
 * Certificates about to lapse, for the dashboard (P2-7).
 *
 * Returns `null` when there is nothing to say. A tile reading zero that
 * never moves is furniture, and the register is one click away in the rail
 * for anybody who wants to check.
 *
 * Counted within the person's own branches, like every other tile, and it
 * links to the same filter it counted — so the number and the list behind it
 * cannot drift apart.
 *
 * @param {object} actor
 * @param {Date} [now]
 */
export async function dscExpiringTile(actor, now = new Date()) {
  const { default: Dsc } = await import("../../models/Dsc.js");

  const start = startOfISTDay(now);
  const [soon, expired] = await Promise.all([
    Dsc.countDocuments({
      ...(branchFilter(actor, "dsc") ?? {}),
      validTill: {
        $gte: start,
        $lte: new Date(start.getTime() + 30 * 86_400_000),
      },
    }),
    Dsc.countDocuments({
      ...(branchFilter(actor, "dsc") ?? {}),
      validTill: { $lt: start },
    }),
  ]);

  if (soon === 0 && expired === 0) return null;

  return {
    label: "DSCs expiring",
    value: soon,
    href: "/practice/dsc?soon=1",
    tone: expired > 0 || soon > 0 ? "late" : "plain",
    note: expired > 0 ? `${expired} already expired` : "within 30 days",
  };
}
