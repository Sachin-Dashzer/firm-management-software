// @ts-check

import Engagement from "../../models/Engagement.js";
import Client from "../../models/Client.js";
import User from "../../models/User.js";
import Udin from "../../models/Udin.js";
import Dsc from "../../models/Dsc.js";
import ClientAccess from "../../models/ClientAccess.js";
import ClientUser from "../../models/ClientUser.js";
import DocumentModel from "../../models/Document.js";
import { branchFilter, ROLE_LABELS } from "../permissions.js";
import { daysLate } from "../practice/books.js";
import { dscState } from "../practice/dsc.js";
import { tierOf } from "../services/catalog.js";
import { CLOSED_STATUSES } from "../engagements/status.js";
import { daysUntil, financialYearStart, istDate } from "../dates.js";

/**
 * The reports the Phase 2 modules made answerable (P2-10c).
 *
 * Everything here reads data that already exists — `filedOn` and
 * `assurance` from P2-8a, the two registers from P2-7, the grants from
 * P2-2, the portal accounts from P2-9, and `reworkCount`, which has been
 * collected since Step 5 and read by exactly one dashboard tile.
 *
 * Same shape as `standard.js`: columns and rows, scoped to the reader,
 * rendered by the screen and written by the Excel route from one call.
 *
 * **None of these is one of the five still waiting on time tracking.**
 * Timesheet, utilisation, realisation, profitability and intern exposure
 * need hours, which nothing in Phase 2 records.
 */

/** The financial year asked for, or the current one. */
function yearFrom(params, now = new Date()) {
  const thisYear = financialYearStart(now);
  const asked = Number(params.fy);
  const start =
    Number.isInteger(asked) && asked >= thisYear - 8 && asked <= thisYear
      ? asked
      : thisYear;
  return {
    start,
    range: { $gte: istDate(start, 4, 1), $lt: istDate(start + 1, 4, 1) },
    label: `FY ${start}-${String(start + 1).slice(2)}`,
  };
}

/** Names for a set of ids, in one query. */
async function namesFor(model, ids, field = "name") {
  const found = await model
    .find({ _id: { $in: [...new Set(ids.filter(Boolean))].map(String) } })
    .select(field)
    .lean();
  return new Map(found.map((row) => [String(row._id), row[field]]));
}

/**
 * What went in on time, and what did not (P2-8a's `filedOn`, reported).
 *
 * Grouped by service, because "are we late with GST returns" is a question
 * about a process and "is this client always late" is a question about a
 * client — and the first one is the one a firm can fix. Work with no
 * statutory deadline recorded is counted separately rather than called
 * punctual: the due-date master leaves dates blank until a partner
 * confirms the rule, and calling those on time would flatter the firm
 * with its own missing data.
 */
export async function filingPunctuality(actor, params = {}) {
  const year = yearFrom(params);
  const scope = branchFilter(actor, "engagementsWork") ?? {};

  const engagements = await Engagement.find({
    ...scope,
    filedOn: { ...year.range },
    ...(params.service ? { serviceTemplateId: params.service } : {}),
    ...(params.client ? { clientId: params.client } : {}),
  })
    .select("filedOn statutoryDue templateSnapshot.name clientId")
    .limit(20000)
    .lean();

  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const row of engagements) {
    const label = row.templateSnapshot?.name ?? "Other work";
    const entry = groups.get(label) ?? {
      label,
      filed: 0,
      onTime: 0,
      late: 0,
      noDeadline: 0,
      lateDays: [],
    };
    entry.filed += 1;
    if (!row.statutoryDue) entry.noDeadline += 1;
    else {
      const late = daysLate(row.filedOn, row.statutoryDue);
      if (late > 0) {
        entry.late += 1;
        entry.lateDays.push(late);
      } else entry.onTime += 1;
    }
    groups.set(label, entry);
  }

  const rows = [...groups.values()].map((entry) => {
    const judged = entry.onTime + entry.late;
    return {
      label: entry.label,
      filed: entry.filed,
      onTime: entry.onTime,
      late: entry.late,
      noDeadline: entry.noDeadline,
      worst: entry.lateDays.length ? Math.max(...entry.lateDays) : 0,
      // only out of the ones we can actually judge
      rate: judged ? Math.round((entry.onTime / judged) * 100) : null,
    };
  });

  const totals = rows.reduce(
    (sum, row) => ({
      filed: sum.filed + row.filed,
      late: sum.late + row.late,
      noDeadline: sum.noDeadline + row.noDeadline,
    }),
    { filed: 0, late: 0, noDeadline: 0 },
  );

  return {
    key: "punctuality",
    title: `Filing punctuality — ${year.label}`,
    what: "What went in on time, what went in late, and by how long.",
    columns: [
      { header: "Service", key: "label", width: 36 },
      { header: "Filed", key: "filed", kind: "int" },
      { header: "On time", key: "onTime", kind: "int" },
      { header: "Late", key: "late", kind: "int" },
      { header: "On time %", key: "rate", kind: "int" },
      { header: "Worst (days late)", key: "worst", kind: "int" },
      { header: "No deadline recorded", key: "noDeadline", kind: "int" },
    ],
    rows: rows.sort((a, b) => b.late - a.late || b.filed - a.filed),
    note:
      totals.noDeadline > 0
        ? `${totals.noDeadline} of ${totals.filed} filings have no statutory deadline recorded against them, so they are not judged either way. Confirm the due-date rules in Settings to include them.`
        : "",
    totals: [
      { label: "Filed", value: String(totals.filed) },
      { label: "Late", value: String(totals.late) },
    ],
  };
}

/**
 * Every audit and what was said about it (P2-8a's `assurance`, reported).
 *
 * One row per engagement rather than a summary: a partner reviewing the
 * year's files wants the list, and the modified ones are what they are
 * looking for.
 */
export async function auditOpinions(actor, params = {}) {
  const year = yearFrom(params);
  const scope = branchFilter(actor, "engagementsWork") ?? {};

  const engagements = await Engagement.find({
    ...scope,
    "templateSnapshot.category": "Audit and Assurance",
    $or: [
      { periodStart: year.range },
      { periodStart: null, createdAt: year.range },
    ],
  })
    .select(
      "clientId code status periodLabel period udin assurance templateSnapshot.name",
    )
    .limit(5000)
    .lean();

  const clients = await namesFor(
    Client,
    engagements.map((e) => e.clientId),
    "legalName",
  );

  const rows = engagements.map((row) => ({
    client: clients.get(String(row.clientId)) ?? "A client",
    service: row.templateSnapshot?.name ?? "",
    period: row.periodLabel || row.period || "",
    auditType: row.assurance?.auditType ?? "",
    opinion: row.assurance?.opinion || "Not recorded",
    reportDate: row.assurance?.reportDate ?? null,
    udin: row.udin ?? "",
    status: row.status,
  }));

  const modified = rows.filter((row) =>
    ["Qualified", "Adverse", "Disclaimer"].includes(row.opinion),
  ).length;
  // an audit with nothing recorded is not a clean audit, and counting it as
  // one is the mistake this report exists to prevent
  const unrecorded = rows.filter(
    (row) => row.opinion === "Not recorded" || row.opinion === "Not yet issued",
  ).length;

  return {
    key: "opinions",
    title: `Audit opinions — ${year.label}`,
    what: "Every audit, its type, and what the report said.",
    columns: [
      { header: "Client", key: "client", width: 32 },
      { header: "Audit", key: "service", width: 26 },
      { header: "Period", key: "period" },
      { header: "Type", key: "auditType" },
      { header: "Opinion", key: "opinion" },
      { header: "Report dated", key: "reportDate", kind: "date" },
      { header: "UDIN", key: "udin", width: 20 },
      { header: "Status", key: "status" },
    ],
    rows: rows.sort((a, b) => a.client.localeCompare(b.client)),
    totals: [
      { label: "Audits", value: String(rows.length) },
      { label: "Modified opinions", value: String(modified) },
      { label: "No opinion recorded", value: String(unrecorded) },
    ],
  };
}

/** What the firm signed this year, by member (P2-7). */
export async function udinSummary(actor, params = {}) {
  const year = yearFrom(params);
  const scope = branchFilter(actor, "udin") ?? {};

  const udins = await Udin.find({ ...scope, generatedOn: year.range })
    .select("memberId membershipNo documentType generatedOn revokedAt")
    .limit(20000)
    .lean();

  const members = await namesFor(
    User,
    udins.map((u) => u.memberId),
  );

  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const row of udins) {
    const key = row.memberId ? String(row.memberId) : "unattributed";
    const entry = groups.get(key) ?? {
      member: row.memberId
        ? (members.get(key) ?? "A former member")
        : "Not recorded against a member",
      membershipNo: row.membershipNo ?? "",
      signed: 0,
      revoked: 0,
      last: null,
    };
    entry.signed += 1;
    if (row.revokedAt) entry.revoked += 1;
    if (!entry.last || row.generatedOn > entry.last)
      entry.last = row.generatedOn;
    groups.set(key, entry);
  }

  const rows = [...groups.values()];

  return {
    key: "udin-summary",
    title: `UDINs issued — ${year.label}`,
    what: "What the firm has signed this year, and who signed it.",
    columns: [
      { header: "Member", key: "member", width: 30 },
      { header: "Membership no.", key: "membershipNo" },
      { header: "Signed", key: "signed", kind: "int" },
      { header: "Revoked", key: "revoked", kind: "int" },
      { header: "Most recent", key: "last", kind: "date" },
    ],
    rows: rows.sort((a, b) => b.signed - a.signed),
    totals: [
      { label: "UDINs", value: String(udins.length) },
      {
        label: "Revoked",
        value: String(udins.filter((u) => u.revokedAt).length),
      },
    ],
  };
}

/** Whose certificate runs out when (P2-7). */
export async function certificatesExpiring(actor, params = {}) {
  const scope = branchFilter(actor, "dsc") ?? {};
  const within = Number(params.days) > 0 ? Number(params.days) : 90;
  const now = new Date();

  const certificates = await Dsc.find({
    ...scope,
    validTill: { $lte: new Date(now.getTime() + within * 86_400_000) },
  })
    .sort({ validTill: 1 })
    .limit(2000)
    .lean();

  const clients = await namesFor(
    Client,
    certificates.map((c) => c.clientId),
    "legalName",
  );

  const rows = certificates.map((row) => {
    const state = dscState(row.validTill, now);
    return {
      client: clients.get(String(row.clientId)) ?? "A client",
      holder: row.holderName,
      role: row.holderRole ?? "",
      certClass: row.certClass ?? "",
      validTill: row.validTill ?? null,
      days: row.validTill ? daysUntil(row.validTill, now) : null,
      state: state.label,
    };
  });

  return {
    key: "certificates",
    title: `Certificates expiring within ${within} days`,
    what: "Digital signature certificates, soonest first, with whose they are.",
    columns: [
      { header: "Client", key: "client", width: 32 },
      { header: "Whose", key: "holder", width: 24 },
      { header: "Role", key: "role" },
      { header: "Class", key: "certClass" },
      { header: "Expires", key: "validTill", kind: "date" },
      { header: "Days left", key: "days", kind: "int" },
      { header: "State", key: "state" },
    ],
    rows,
    totals: [
      { label: "Certificates", value: String(rows.length) },
      {
        label: "Already expired",
        value: String(rows.filter((r) => (r.days ?? 1) < 0).length),
      },
    ],
  };
}

/**
 * How often work comes back from review (`reworkCount`, since Step 5).
 *
 * By the person who did it, because that is who learns from it — and the
 * number is deliberately shown beside the jobs they finished, so somebody
 * with three sent back out of a hundred is not read the same way as
 * somebody with three out of four.
 */
export async function reworkReport(actor, params = {}) {
  const year = yearFrom(params);
  const scope = branchFilter(actor, "engagementsWork") ?? {};

  const engagements = await Engagement.find({
    ...scope,
    status: { $in: CLOSED_STATUSES },
    completedAt: year.range,
  })
    .select("assigneeId reworkCount templateSnapshot.name")
    .limit(20000)
    .lean();

  const people = await namesFor(
    User,
    engagements.map((e) => e.assigneeId),
  );

  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const row of engagements) {
    const key = row.assigneeId ? String(row.assigneeId) : "unassigned";
    const entry = groups.get(key) ?? {
      person: row.assigneeId
        ? (people.get(key) ?? "A former colleague")
        : "Nobody assigned",
      finished: 0,
      sentBack: 0,
      times: 0,
    };
    entry.finished += 1;
    if ((row.reworkCount ?? 0) > 0) {
      entry.sentBack += 1;
      entry.times += row.reworkCount;
    }
    groups.set(key, entry);
  }

  const rows = [...groups.values()].map((entry) => ({
    ...entry,
    rate: entry.finished
      ? Math.round((entry.sentBack / entry.finished) * 100)
      : 0,
  }));

  return {
    key: "rework",
    title: `Work sent back from review — ${year.label}`,
    what: "How often finished work came back, by the person who did it.",
    columns: [
      { header: "Who", key: "person", width: 30 },
      { header: "Finished", key: "finished", kind: "int" },
      { header: "Sent back at least once", key: "sentBack", kind: "int" },
      { header: "Times in all", key: "times", kind: "int" },
      { header: "Rate %", key: "rate", kind: "int" },
    ],
    rows: rows.sort((a, b) => b.rate - a.rate || b.finished - a.finished),
    totals: [
      {
        label: "Jobs finished",
        value: String(rows.reduce((n, r) => n + r.finished, 0)),
      },
      {
        label: "Sent back",
        value: String(rows.reduce((n, r) => n + r.sentBack, 0)),
      },
    ],
  };
}

/** Who is carrying the senior work, and who is not (P2-4's tiers). */
export async function tierMix(actor, params = {}) {
  const year = yearFrom(params);
  const scope = branchFilter(actor, "engagementsWork") ?? {};

  const engagements = await Engagement.find({
    ...scope,
    $or: [
      { periodStart: year.range },
      { periodStart: null, createdAt: year.range },
    ],
  })
    .select("assigneeId templateSnapshot.level")
    .limit(20000)
    .lean();

  const people = await namesFor(
    User,
    engagements.map((e) => e.assigneeId),
    "name role",
  );
  const roles = await User.find({
    _id: {
      $in: [...new Set(engagements.map((e) => String(e.assigneeId)))].filter(
        Boolean,
      ),
    },
  })
    .select("role")
    .lean();
  const roleOf = new Map(roles.map((r) => [String(r._id), r.role]));

  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const row of engagements) {
    const key = row.assigneeId ? String(row.assigneeId) : "unassigned";
    const entry = groups.get(key) ?? {
      person: row.assigneeId
        ? (people.get(key) ?? "A former colleague")
        : "Nobody assigned",
      role: ROLE_LABELS[roleOf.get(key)] ?? "",
      A: 0,
      B: 0,
      C: 0,
      total: 0,
    };
    const tier = tierOf(row.templateSnapshot?.level);
    if (tier) entry[tier] += 1;
    entry.total += 1;
    groups.set(key, entry);
  }

  const rows = [...groups.values()];

  return {
    key: "tier-mix",
    title: `Work by tier — ${year.label}`,
    what: "A, B and C work per person: who is carrying the senior jobs.",
    columns: [
      { header: "Who", key: "person", width: 30 },
      { header: "Role", key: "role", width: 20 },
      { header: "A", key: "A", kind: "int" },
      { header: "B", key: "B", kind: "int" },
      { header: "C", key: "C", kind: "int" },
      { header: "All work", key: "total", kind: "int" },
    ],
    rows: rows.sort((a, b) => b.A - a.A || b.total - a.total),
    totals: [
      {
        label: "A-tier jobs",
        value: String(rows.reduce((n, r) => n + r.A, 0)),
      },
      { label: "People", value: String(rows.length) },
    ],
  };
}

/**
 * Who can see a client they do not work on (P2-2's grants).
 *
 * A governance sheet: a partner should be able to answer "who has been
 * given access to what, and why" without opening thirty client files.
 */
export async function accessGrants(actor, params = {}) {
  const scope = branchFilter(actor, "clientAccess") ?? {};
  const now = new Date();
  const openOnly = params.open !== "0";

  const grants = await ClientAccess.find({
    ...scope,
    ...(openOnly ? { active: true } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const [people, clients] = await Promise.all([
    namesFor(
      User,
      grants.map((g) => g.userId),
    ),
    namesFor(
      Client,
      grants.map((g) => g.clientId),
      "legalName",
    ),
  ]);

  const rows = grants.map((grant) => ({
    person: people.get(String(grant.userId)) ?? "A former colleague",
    client: clients.get(String(grant.clientId)) ?? "A client",
    sections: (grant.sections ?? []).join(", "),
    reason: grant.reason ?? "",
    grantedBy: grant.grantedByName ?? "",
    grantedAt: grant.createdAt ?? null,
    expires: grant.expiresAt ?? null,
    state: !grant.active
      ? "Revoked"
      : grant.expiresAt && grant.expiresAt <= now
        ? "Expired"
        : "Open",
  }));

  return {
    key: "grants",
    title: openOnly ? "Open client access grants" : "All client access grants",
    what: "Who can see a client they do not work on, and why they were given it.",
    columns: [
      { header: "Who", key: "person", width: 28 },
      { header: "Client", key: "client", width: 32 },
      { header: "Sections", key: "sections", width: 36 },
      { header: "Reason", key: "reason", width: 44 },
      { header: "Given by", key: "grantedBy", width: 22 },
      { header: "Given", key: "grantedAt", kind: "date" },
      { header: "Lapses", key: "expires", kind: "date" },
      { header: "State", key: "state" },
    ],
    rows,
    note: openOnly ? "Open grants only. Add ?open=0 for the full history." : "",
    totals: [
      { label: "Grants", value: String(rows.length) },
      {
        label: "Without an end date",
        value: String(
          rows.filter((r) => !r.expires && r.state === "Open").length,
        ),
      },
    ],
  };
}

/** Which clients can sign in, and whether they ever have (P2-9). */
export async function portalActivity(actor, params = {}) {
  const scope = branchFilter(actor, "clientPortalUsers") ?? {};

  const accounts = await ClientUser.find(scope)
    .sort({ lastLoginAt: -1 })
    .limit(5000)
    .lean();

  const clientIds = [...new Set(accounts.map((a) => String(a.clientId)))];
  const [clients, shared] = await Promise.all([
    namesFor(Client, clientIds, "legalName"),
    DocumentModel.aggregate([
      {
        $match: {
          clientId: { $in: accounts.map((a) => a.clientId) },
          sharedWithClient: true,
          deletedAt: null,
        },
      },
      { $group: { _id: "$clientId", n: { $sum: 1 } } },
    ]),
  ]);
  const sharedWith = new Map(shared.map((row) => [String(row._id), row.n]));

  const rows = accounts.map((account) => ({
    client: clients.get(String(account.clientId)) ?? "A client",
    person: account.name,
    email: account.email,
    active: account.active === false ? "Closed" : "Open",
    twoFactor: account.totpRequired ? "Required" : "No",
    lastLoginAt: account.lastLoginAt ?? null,
    everSignedIn: account.lastLoginAt ? "Yes" : "Never",
    documents: sharedWith.get(String(account.clientId)) ?? 0,
  }));

  return {
    key: "portal",
    title: "Client portal accounts",
    what: "Who outside the firm can sign in, when they last did, and what they have been given.",
    columns: [
      { header: "Client", key: "client", width: 32 },
      { header: "Who", key: "person", width: 26 },
      { header: "Email", key: "email", width: 30 },
      { header: "Access", key: "active" },
      { header: "2FA", key: "twoFactor" },
      { header: "Last signed in", key: "lastLoginAt", kind: "date" },
      { header: "Ever", key: "everSignedIn" },
      { header: "Documents shared", key: "documents", kind: "int" },
    ],
    rows,
    totals: [
      { label: "Accounts", value: String(rows.length) },
      {
        label: "Never signed in",
        value: String(rows.filter((r) => r.everSignedIn === "Never").length),
      },
    ],
  };
}

/** Registered into `REPORTS` by `standard.js`. */
export const PRACTICE_REPORTS = {
  punctuality: {
    run: filingPunctuality,
    area: "engagementsWork",
    pdf: true,
  },
  opinions: { run: auditOpinions, area: "practice", pdf: true },
  "udin-summary": { run: udinSummary, area: "udin", pdf: false },
  certificates: { run: certificatesExpiring, area: "dsc", pdf: false },
  rework: { run: reworkReport, area: "dashboards", pdf: false },
  "tier-mix": { run: tierMix, area: "dashboards", pdf: false },
  grants: { run: accessGrants, area: "clientAccess", pdf: false },
  portal: { run: portalActivity, area: "clientPortalUsers", pdf: false },
};
