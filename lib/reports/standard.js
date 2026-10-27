// @ts-check

import Engagement from "../../models/Engagement.js";
import Client from "../../models/Client.js";
import Invoice from "../../models/Invoice.js";
import Branch from "../../models/Branch.js";
import User from "../../models/User.js";
import { branchFilter, seesOnlyOwnRecords } from "../permissions.js";
import { engagementQuery } from "../engagements/filter.js";
import { outstandingOf } from "../billing/allocation.js";
import { daysUntil, istParts, istDate, formatISTDate } from "../dates.js";
import { PRACTICE_REPORTS } from "./practice.js";
import { isChargeable, scopeLine, feeState } from "../engagements/scope.js";
import { atRisk, targets } from "../engagements/risk.js";

/**
 * The standard reports of spec section 10.
 *
 * Each one returns columns and rows, nothing else: the screen renders
 * them, the Excel route writes them and the PDF route prints them from the
 * same call. One definition per report, three outputs — otherwise the
 * printed version slowly stops matching the screen.
 *
 * Every report takes the actor and applies their branch scope, because a
 * report is just a list with a nicer heading.
 *
 * @typedef {object} Report
 * @property {string} key
 * @property {string} title
 * @property {string} what          one line, for the index
 * @property {Array<{header: string, key: string, kind?: string}>} columns
 * @property {Array<Record<string, any>>} rows
 * @property {string} [note]        what was filtered, printed above the table
 * @property {Array<{label: string, value: string}>} [totals]
 */

/** Dates out of the filter bar, as a Mongo range. */
export function dateRange(params = {}) {
  const from = params.from ? new Date(`${params.from}T00:00:00+05:30`) : null;
  const to = params.to ? new Date(`${params.to}T23:59:59+05:30`) : null;
  if (!from && !to) return null;
  return {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
}

/** The filters in words, so a printed report says what it is. */
export function describeFilters(params = {}, names = {}) {
  const parts = [];
  if (params.from || params.to) {
    parts.push(
      `${params.from ? formatISTDate(new Date(`${params.from}T00:00:00+05:30`)) : "the beginning"} to ${
        params.to
          ? formatISTDate(new Date(`${params.to}T00:00:00+05:30`))
          : "today"
      }`,
    );
  }
  if (params.branch) parts.push(`branch ${names.branch ?? params.branch}`);
  if (params.client) parts.push(`client ${names.client ?? params.client}`);
  if (params.service) parts.push(`service ${names.service ?? params.service}`);
  if (params.assignee)
    parts.push(`assigned to ${names.assignee ?? params.assignee}`);
  if (params.status) parts.push(`status ${params.status}`);
  return parts.length ? `Filtered: ${parts.join(", ")}.` : "No filters.";
}

/** Client and people names, looked up once per report. */
async function lookups(rows) {
  const [clients, branches, people] = await Promise.all([
    Client.find({ _id: { $in: rows.map((r) => r.clientId).filter(Boolean) } })
      .select("legalName tradeName code")
      .lean(),
    Branch.find({}).select("code name").lean(),
    User.find({}).select("name").lean(),
  ]);

  return {
    clientName: new Map(
      clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
    ),
    clientCode: new Map(clients.map((c) => [String(c._id), c.code])),
    branchCode: new Map(branches.map((b) => [String(b._id), b.code])),
    personName: new Map(people.map((u) => [String(u._id), u.name])),
  };
}

/**
 * Engagement status, and its sibling the overdue report — the same report
 * with one filter set, which is why they are one function.
 *
 * @param {object} actor
 * @param {Record<string, string>} params
 */
export async function engagementStatus(actor, params = {}) {
  const overdueOnly = params.report === "overdue";
  const query = engagementQuery(actor, {
    ...params,
    ...(overdueOnly ? { due: "overdue" } : {}),
  });

  const created = dateRange(params);
  if (created) query.createdAt = created;
  if (params.client) query.clientId = params.client;

  const rows = await Engagement.find(query)
    .sort({ statutoryDue: 1, internalDue: 1 })
    .limit(5000)
    .lean();

  const names = await lookups(rows);

  return {
    key: overdueOnly ? "overdue" : "status",
    title: overdueOnly ? "Overdue work" : "Engagement status",
    what: overdueOnly
      ? "Everything past its date and not filed, oldest first."
      : "Every engagement with its status, dates and who has it.",
    columns: [
      { header: "Code", key: "code" },
      { header: "Client", key: "client" },
      { header: "Branch", key: "branch" },
      { header: "Service", key: "service" },
      { header: "Period", key: "period" },
      { header: "Status", key: "status" },
      { header: "Assignee", key: "assignee" },
      { header: "Reviewer", key: "reviewer" },
      { header: "Statutory due", key: "statutoryDue", kind: "date" },
      { header: "Our target", key: "internalDue", kind: "date" },
      { header: "Days late", key: "daysLate", kind: "int" },
      { header: "Fee", key: "fee", kind: "money" },
      { header: "Billing", key: "billing" },
    ],
    rows: rows.map((row) => {
      const due = row.statutoryDue ?? row.internalDue ?? null;
      const left = due ? daysUntil(due) : null;
      return {
        code: row.code,
        client: names.clientName.get(String(row.clientId)) ?? "",
        branch: names.branchCode.get(String(row.branchId)) ?? "",
        service: row.templateSnapshot?.name ?? "",
        period: row.periodLabel || row.period,
        status: row.status,
        assignee: names.personName.get(String(row.assigneeId)) ?? "",
        reviewer: names.personName.get(String(row.reviewerId)) ?? "",
        statutoryDue: row.statutoryDue,
        internalDue: row.internalDue,
        daysLate: left !== null && left < 0 ? -left : null,
        fee: row.feePaise ?? 0,
        billing: row.billingStatus,
      };
    }),
    totals: [{ label: "Engagements", value: String(rows.length) }],
  };
}

/**
 * What clients still owe us in documents (spec section 10), one row per
 * engagement with the items named — a list of clients with no items is not
 * something anybody can act on.
 */
export async function pendingDocuments(actor, params = {}) {
  const query = engagementQuery(actor, params);
  query.checklist = {
    $elemMatch: {
      side: "client",
      status: { $in: ["Pending", "Requested"] },
      mandatory: true,
    },
  };
  if (params.client) query.clientId = params.client;

  const rows = await Engagement.find(query)
    .sort({ internalDue: 1 })
    .limit(2000)
    .lean();
  const names = await lookups(rows);

  return {
    key: "pending-documents",
    title: "Documents awaited from clients",
    what: "Mandatory items a client has not sent, oldest deadline first.",
    columns: [
      { header: "Client", key: "client" },
      { header: "Work", key: "service" },
      { header: "Period", key: "period" },
      { header: "Status", key: "status" },
      { header: "Our target", key: "internalDue", kind: "date" },
      { header: "Waiting for", key: "items", width: 50 },
      { header: "Items", key: "count", kind: "int" },
      { header: "Asked", key: "asked" },
    ],
    rows: rows.map((row) => {
      const waiting = (row.checklist ?? []).filter(
        (item) =>
          item.side === "client" &&
          ["Pending", "Requested"].includes(item.status),
      );
      return {
        client: names.clientName.get(String(row.clientId)) ?? "",
        service: row.templateSnapshot?.name ?? "",
        period: row.periodLabel || row.period,
        status: row.status,
        internalDue: row.internalDue,
        items: waiting.map((item) => item.name).join("; "),
        count: waiting.length,
        asked: waiting.some((item) => item.status === "Requested")
          ? "Yes"
          : "Not yet",
      };
    }),
    totals: [{ label: "Engagements waiting", value: String(rows.length) }],
  };
}

/**
 * Revenue, grouped the way the question was asked (spec section 10:
 * by client, service, branch and month).
 */
export async function revenue(actor, params = {}) {
  const by = ["client", "service", "branch", "month"].includes(params.by)
    ? params.by
    : "client";

  const scope = branchFilter(actor, "invoices") ?? {};
  const query = {
    ...scope,
    status: { $nin: ["Draft", "Cancelled"] },
    ...(params.branch ? { branchId: params.branch } : {}),
    ...(params.client ? { clientId: params.client } : {}),
  };
  const range = dateRange(params);
  if (range) query.date = range;

  const invoices = await Invoice.find(query)
    .select("clientId branchId date lines subtotalPaise totalPaise")
    .limit(10000)
    .lean();

  const lines = invoices.flatMap((invoice) =>
    (invoice.lines ?? []).map((line) => ({ ...line, invoice })),
  );
  const engagements = await Engagement.find({
    _id: { $in: lines.map((line) => line.engagementId).filter(Boolean) },
  })
    .select("templateSnapshot")
    .lean();
  const serviceOf = new Map(
    engagements.map((e) => [String(e._id), e.templateSnapshot?.name]),
  );

  const names = await lookups(invoices);

  /** @type {Map<string, {label: string, net: number, jobs: number}>} */
  const groups = new Map();
  for (const line of lines) {
    let label;
    if (by === "client") {
      label = names.clientName.get(String(line.invoice.clientId)) ?? "Unknown";
    } else if (by === "branch") {
      label = names.branchCode.get(String(line.invoice.branchId)) ?? "Unknown";
    } else if (by === "service") {
      label = serviceOf.get(String(line.engagementId)) || "Other / ad hoc";
    } else {
      const { year, month } = istParts(new Date(line.invoice.date));
      label = formatISTDate(istDate(year, month, 1)).slice(3);
    }

    const entry = groups.get(label) ?? { label, net: 0, jobs: 0 };
    entry.net += line.netPaise || line.amountPaise || 0;
    entry.jobs += 1;
    groups.set(label, entry);
  }

  const rows = [...groups.values()].sort((a, b) =>
    by === "month" ? a.label.localeCompare(b.label) : b.net - a.net,
  );

  return {
    key: "revenue",
    title: `Revenue by ${by}`,
    what: "Billed work for the period, from issued invoices.",
    columns: [
      {
        header: by === "month" ? "Month" : by[0].toUpperCase() + by.slice(1),
        key: "label",
        width: 32,
      },
      { header: "Lines", key: "jobs", kind: "int" },
      { header: "Billed (before tax)", key: "net", kind: "money" },
    ],
    rows,
    totals: [
      {
        label: "Billed before tax",
        value: String(rows.reduce((sum, row) => sum + row.net, 0)),
      },
    ],
  };
}

/**
 * How long work actually takes against the standard on the service
 * (spec section 10). Only completed work: an unfinished job has no
 * turnaround, and counting it as fast would be a lie.
 */
export async function turnaround(actor, params = {}) {
  const scope = branchFilter(actor, "engagementsWork") ?? {};
  const query = {
    ...scope,
    status: "Completed",
    completedAt: { $ne: null },
    ...(params.branch ? { branchId: params.branch } : {}),
  };
  const range = dateRange(params);
  if (range) query.completedAt = { $ne: null, ...range };

  const rows = await Engagement.find(query)
    .select("templateSnapshot startedAt completedAt createdAt")
    .limit(10000)
    .lean();

  /** @type {Map<string, {label: string, jobs: number, days: number[], standard: number|null}>} */
  const groups = new Map();
  for (const row of rows) {
    const label = row.templateSnapshot?.name ?? "Unknown service";
    const from = row.startedAt ?? row.createdAt;
    if (!from) continue;

    const days = Math.max(
      0,
      Math.round(
        (new Date(row.completedAt).getTime() - new Date(from).getTime()) /
          86_400_000,
      ),
    );

    const entry = groups.get(label) ?? {
      label,
      jobs: 0,
      days: [],
      standard: row.templateSnapshot?.turnaroundDays ?? null,
    };
    entry.jobs += 1;
    entry.days.push(days);
    groups.set(label, entry);
  }

  const result = [...groups.values()].map((entry) => {
    const sorted = [...entry.days].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    return {
      label: entry.label,
      jobs: entry.jobs,
      median,
      slowest: sorted[sorted.length - 1] ?? 0,
      standard: entry.standard,
      // "over" is the one the firm acts on: the promise against the reality
      over:
        entry.standard === null || entry.standard === undefined
          ? null
          : median - entry.standard,
    };
  });

  return {
    key: "turnaround",
    title: "Turnaround per service",
    what: "How long completed work took, against the standard on the service.",
    columns: [
      { header: "Service", key: "label", width: 36 },
      { header: "Completed jobs", key: "jobs", kind: "int" },
      { header: "Typical days", key: "median", kind: "int" },
      { header: "Slowest", key: "slowest", kind: "int" },
      { header: "Standard", key: "standard", kind: "int" },
      { header: "Over standard", key: "over", kind: "int" },
    ],
    rows: result.sort((a, b) => (b.over ?? -999) - (a.over ?? -999)),
    totals: [{ label: "Services", value: String(result.length) }],
  };
}

/**
 * Clients gained and lost by month (spec section 10). "Lost" is a client
 * closed, not one who has gone quiet — the system only knows what somebody
 * recorded.
 */
export async function clientChurn(actor, params = {}) {
  /**
   * Scoped by client, not by branch.
   *
   * `reports/[report]` only asks `can(actor, "view", "clients")` with no
   * record in hand, which a record-level scope answers yes to — so an
   * employee could run this and get a month-by-month count of every client
   * in their office. It is also a report that means nothing at three
   * clients, so the honest answer for a record-scoped role is to say so
   * rather than to narrow it.
   */
  if (seesOnlyOwnRecords(actor, "clients")) {
    return {
      key: "clients",
      title: "New and lost clients",
      what: "A firm-level trend. It needs the whole client list, which your role sees one client at a time.",
      columns: [{ header: "Month", key: "month" }],
      rows: [],
      refused: true,
    };
  }

  const scope = branchFilter(actor, "clients") ?? {};
  const range = dateRange(params) ?? {};

  const [created, closed] = await Promise.all([
    Client.find({
      ...scope,
      ...(Object.keys(range).length ? { createdAt: range } : {}),
    })
      .select("createdAt")
      .limit(20000)
      .lean(),
    Client.find({
      ...scope,
      status: "Closed",
      ...(Object.keys(range).length ? { updatedAt: range } : {}),
    })
      .select("updatedAt")
      .limit(20000)
      .lean(),
  ]);

  /** @type {Map<string, {label: string, joined: number, left: number}>} */
  const months = new Map();
  const bump = (date, field) => {
    const { year, month } = istParts(new Date(date));
    const label = formatISTDate(istDate(year, month, 1)).slice(3);
    const entry = months.get(label) ?? { label, joined: 0, left: 0 };
    entry[field] += 1;
    months.set(label, entry);
  };

  for (const client of created) bump(client.createdAt, "joined");
  for (const client of closed) bump(client.updatedAt, "left");

  const rows = [...months.values()]
    .map((row) => ({ ...row, net: row.joined - row.left }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    key: "clients",
    title: "New and lost clients",
    what: "Clients taken on and clients closed, by month.",
    columns: [
      { header: "Month", key: "label" },
      { header: "Taken on", key: "joined", kind: "int" },
      { header: "Closed", key: "left", kind: "int" },
      { header: "Net", key: "net", kind: "int" },
    ],
    rows,
    totals: [
      {
        label: "Net change",
        value: String(rows.reduce((sum, row) => sum + row.net, 0)),
      },
    ],
  };
}

/** Receivables ageing as a report, from the same helper the screen uses. */
export async function receivablesReport(actor, params = {}) {
  const scope = branchFilter(actor, "invoices") ?? {};
  const invoices = await Invoice.find({
    ...scope,
    status: { $in: ["Sent", "Partially paid", "Disputed"] },
    ...(params.client ? { clientId: params.client } : {}),
    ...(params.branch ? { branchId: params.branch } : {}),
  })
    .select(
      "number date dueDate clientId branchId totalPaise paidPaise tdsCreditedPaise status",
    )
    .sort({ dueDate: 1 })
    .limit(10000)
    .lean();

  const names = await lookups(invoices);
  const rows = invoices
    .map((invoice) => {
      const owed = outstandingOf(invoice);
      const late = invoice.dueDate ? -daysUntil(invoice.dueDate) : null;
      return {
        number: invoice.number ?? "",
        client: names.clientName.get(String(invoice.clientId)) ?? "",
        branch: names.branchCode.get(String(invoice.branchId)) ?? "",
        date: invoice.date,
        dueDate: invoice.dueDate,
        daysLate: late !== null && late > 0 ? late : null,
        total: invoice.totalPaise ?? 0,
        outstanding: owed,
        status: invoice.status,
      };
    })
    .filter((row) => row.outstanding > 0);

  return {
    key: "receivables",
    title: "Receivables",
    what: "Every unpaid invoice with what is left on it and how late it is.",
    columns: [
      { header: "Invoice", key: "number" },
      { header: "Client", key: "client", width: 30 },
      { header: "Branch", key: "branch" },
      { header: "Dated", key: "date", kind: "date" },
      { header: "Due", key: "dueDate", kind: "date" },
      { header: "Days late", key: "daysLate", kind: "int" },
      { header: "Invoice total", key: "total", kind: "money" },
      { header: "Outstanding", key: "outstanding", kind: "money" },
      { header: "Status", key: "status" },
    ],
    rows,
    totals: [
      {
        label: "Outstanding",
        value: String(rows.reduce((sum, row) => sum + row.outstanding, 0)),
      },
    ],
  };
}

/**
 * Work that can still be saved (P3-5).
 *
 * Not a Mongo query: "at risk" depends on the next open milestone, the
 * approval's version and working-day arithmetic, none of which a filter can
 * express. So the open work is read and `atRisk()` decides — the same
 * function the list chip and the engagement page use, so the three cannot
 * disagree.
 *
 * It is a report rather than a filter on the list for that reason: reports
 * already shape rows in JavaScript, and a list filter that post-filtered one
 * page would report a different number from the tile above it.
 */
export async function atRiskReport(actor, params = {}) {
  const query = engagementQuery(actor, params);
  if (params.client) query.clientId = params.client;

  const open = await Engagement.find(query)
    .sort({ statutoryDue: 1 })
    .limit(5000)
    .lean();

  const rows = open
    .map((row) => ({ row, why: atRisk(row) }))
    .filter((r) => r.why);

  const names = await lookups(rows.map((r) => r.row));

  return {
    key: "at-risk",
    title: "At risk",
    what: "The statutory date has not passed, but one of our own targets has. Acting now still works.",
    columns: [
      { header: "Code", key: "code" },
      { header: "Client", key: "client", width: 30 },
      { header: "Branch", key: "branch" },
      { header: "Work", key: "service", width: 30 },
      { header: "Period", key: "period" },
      { header: "Status", key: "status" },
      { header: "Assignee", key: "assignee" },
      { header: "Statutory due", key: "statutoryDue", kind: "date" },
      { header: "Days left", key: "left", kind: "int" },
      { header: "Why", key: "why", width: 46 },
    ],
    rows: rows.map(({ row, why }) => {
      const t = targets(row);
      return {
        code: row.code,
        client: names.clientName.get(String(row.clientId)) ?? "",
        branch: names.branchCode.get(String(row.branchId)) ?? "",
        service: row.templateSnapshot?.name ?? "",
        period: row.periodLabel || row.period,
        status: row.status,
        assignee: names.personName.get(String(row.assigneeId)) ?? "",
        statutoryDue: t?.statutory ?? row.statutoryDue,
        left: t?.statutory ? daysUntil(t.statutory) : null,
        why,
      };
    }),
    totals: [{ label: "At risk", value: String(rows.length) }],
  };
}

/** Finished work nobody has invoiced. */
export async function unbilledReport(actor, params = {}) {
  const scope = branchFilter(actor, "invoices") ?? {};
  const rows = await Engagement.find({
    ...scope,
    billingStatus: "Unbilled",
    status: { $in: ["Filed / delivered", "Completed"] },
    ...(params.branch ? { branchId: params.branch } : {}),
    ...(params.client ? { clientId: params.client } : {}),
  })
    .sort({ completedAt: 1 })
    .limit(5000)
    .lean();

  const names = await lookups(rows);

  return {
    key: "unbilled",
    title: "Unbilled work",
    what: "Work that is finished and has not been invoiced.",
    columns: [
      { header: "Code", key: "code" },
      { header: "Client", key: "client", width: 30 },
      { header: "Branch", key: "branch" },
      { header: "Work", key: "service", width: 30 },
      { header: "Period", key: "period" },
      { header: "Finished", key: "completedAt", kind: "date" },
      { header: "Waiting days", key: "waiting", kind: "int" },
      { header: "Fee agreed", key: "fee", kind: "money" },
      { header: "How it is paid for", key: "scope", width: 40 },
    ],
    rows: rows.map((row) => ({
      code: row.code,
      client: names.clientName.get(String(row.clientId)) ?? "",
      branch: names.branchCode.get(String(row.branchId)) ?? "",
      service: row.templateSnapshot?.name ?? "",
      period: row.periodLabel || row.period,
      completedAt: row.completedAt,
      waiting: row.completedAt ? -daysUntil(row.completedAt) : null,
      fee: row.feePaise ?? 0,
      /**
       * Waived and retainer work stays on this report with its reason
       * (P3-4). Dropping it would make the report shrink every time a
       * partner waived a fee, and the question "what did we do and not
       * charge for" is one the firm has to be able to answer.
       */
      scope: scopeLine(row) || feeState(row).label,
    })),
    totals: [
      {
        label: "Fees not yet billed",
        value: String(
          rows
            .filter(isChargeable)
            .reduce((sum, row) => sum + (row.feePaise ?? 0), 0),
        ),
      },
    ],
  };
}

/** Every report this step builds, for the index and the routes. */
export const REPORTS = {
  status: { run: engagementStatus, area: "engagementsWork", pdf: true },
  overdue: { run: engagementStatus, area: "engagementsWork", pdf: true },
  "pending-documents": { run: pendingDocuments, area: "documents", pdf: true },
  revenue: { run: revenue, area: "invoices", pdf: false },
  turnaround: { run: turnaround, area: "engagementsWork", pdf: false },
  clients: { run: clientChurn, area: "clients", pdf: false },
  receivables: { run: receivablesReport, area: "invoices", pdf: false },
  unbilled: { run: unbilledReport, area: "invoices", pdf: false },
  "at-risk": { run: atRiskReport, area: "engagementsWork", pdf: true },
  // what the Phase 2 modules made answerable (P2-10c)
  ...PRACTICE_REPORTS,
};

/**
 * Run one report by name, with the permission check that belongs to it.
 * @param {string} key
 * @param {object} actor
 * @param {Record<string, string>} params
 */
export async function runReport(key, actor, params = {}) {
  const definition = REPORTS[key];
  if (!definition) return null;
  return definition.run(actor, { ...params, report: key });
}
