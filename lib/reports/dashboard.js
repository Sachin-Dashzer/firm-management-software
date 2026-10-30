// @ts-check

import Engagement from "../../models/Engagement.js";
import Notice from "../../models/Notice.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import { can, branchFilter } from "../permissions.js";
import { engagementQuery } from "../engagements/filter.js";
import { isChargeable } from "../engagements/scope.js";
import { noticeQuery, nextDue, isDrafted } from "../practice/notices.js";
import {
  loadForEach,
  COMFORT_JOB_LIMIT,
  rebalanceHint,
} from "../team/workload.js";
import { tierOf } from "../services/catalog.js";
import { formatPaise } from "../money.js";
import { loadHeads } from "../compliance/headsQuery.js";
import { deadlineTerrain } from "./terrain.js";
import {
  byBranch,
  unbilled,
  receivables,
  collections,
  billedInMonth,
  unallocatedTotal,
  dscExpiringTile,
} from "./figures.js";
import {
  startOfISTDay,
  istParts,
  istHour,
  financialYearStart,
  daysUntil,
} from "../dates.js";

/**
 * Everything on the firm dashboard, in one call (P3-34 phase 3).
 *
 * The shape of this file follows the rule the whole screen is built on:
 * **every figure is a filter, and its link is that filter in the URL.** A
 * tile that counted something the list cannot reproduce is a tile nobody
 * can check, and a dashboard nobody checks is decoration.
 *
 * Each section is `null` when the actor may not see it, rather than empty —
 * empty means "nothing today", `null` means "not yours", and a screen that
 * confuses the two tells a CA the firm has no money coming in.
 *
 * The reads run in one `Promise.all` per band. They are independent, and on
 * a serverless function in Mumbai the round trips are the whole cost.
 */

const DAY = 86_400_000;

/**
 * Which bucket of the pipeline a job is in, for the stacked bar.
 *
 * Pure and exported so it can be tested without a database, because the
 * failure here is silent: a bucket rule that quietly drops "On hold" makes
 * the bar's total disagree with the job board, and nobody reports a total
 * that is merely a little low.
 *
 * "Done, to bill" is the one bucket that is not a status. Work that is
 * filed, or completed and not yet invoiced, is finished for the person who
 * did it and unfinished for the firm — which is exactly the thing a partner
 * is looking at this bar to find.
 *
 * @param {Array<{status: string, billingStatus?: string, scope?: string}>} engagements
 */
export function wipBuckets(engagements) {
  const counts = {
    scheduled: 0,
    awaiting: 0,
    progress: 0,
    hold: 0,
    review: 0,
    toBill: 0,
  };

  for (const row of engagements) {
    switch (row.status) {
      case "Scheduled":
        counts.scheduled += 1;
        break;
      case "Awaiting documents":
        counts.awaiting += 1;
        break;
      case "In progress":
        counts.progress += 1;
        break;
      case "On hold":
        // held work is still in progress as far as the bar is concerned —
        // it is somebody's, it is not done, and hiding it would make the
        // total disagree with the job board
        counts.hold += 1;
        break;
      case "Under review":
        counts.review += 1;
        break;
      case "Filed / delivered":
        counts.toBill += 1;
        break;
      case "Completed":
        if (row.billingStatus !== "Billed" && isChargeable(row)) {
          counts.toBill += 1;
        }
        break;
      default:
        // Cancelled, and anything a later migration adds
        break;
    }
  }

  const total =
    counts.scheduled +
    counts.awaiting +
    counts.progress +
    counts.hold +
    counts.review +
    counts.toBill;

  return {
    total,
    onHold: counts.hold,
    segments: [
      {
        key: "scheduled",
        label: "Not started",
        value: counts.scheduled,
        className: "bg-rule",
        href: "/engagements?status=Scheduled",
      },
      {
        key: "awaiting",
        label: "Waiting on client docs",
        value: counts.awaiting,
        className: "bg-waiting",
        href: "/engagements?status=Awaiting%20documents",
      },
      {
        key: "progress",
        label: "In progress",
        value: counts.progress + counts.hold,
        className: "bg-carbon",
        href: "/engagements?status=In%20progress",
      },
      {
        key: "review",
        label: "Under review",
        value: counts.review,
        className: "bg-carbon/45",
        href: "/engagements?status=Under%20review",
      },
      {
        key: "toBill",
        label: "Done, to bill",
        value: counts.toBill,
        className: "bg-filed",
        href: "/billing?tab=ready",
      },
    ],
  };
}

/**
 * The next few statutory dates, as chips.
 *
 * Grouped by service and date, because "GSTR-1 on the 11th" is one deadline
 * the firm meets twenty-four times, not twenty-four deadlines. A chip per
 * client would be a wall of chips saying one thing.
 *
 * @param {Array<any>} engagements open work with a statutory date
 * @param {Date} now
 */
export function deadlineChips(engagements, now, limit = 3) {
  const today = startOfISTDay(now);
  const horizon = new Date(today.getTime() + 15 * DAY);

  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const row of engagements) {
    if (!row.statutoryDue) continue;
    const due = startOfISTDay(new Date(row.statutoryDue));
    if (due < today || due > horizon) continue;

    const name = row.templateSnapshot?.name ?? "Filing";
    const key = `${String(row.serviceTemplateId)}:${due.getTime()}`;
    const entry = groups.get(key) ?? {
      key,
      name,
      due,
      days: daysUntil(due, now),
      count: 0,
      service: String(row.serviceTemplateId ?? ""),
    };
    entry.count += 1;
    groups.set(key, entry);
  }

  return [...groups.values()]
    .sort((a, b) => a.due - b.due || b.count - a.count)
    .slice(0, limit)
    .map((chip) => ({
      ...chip,
      tone: chip.days <= 1 ? "late" : chip.days <= 7 ? "soon" : "neutral",
      /**
       * `due=week` covers seven days and `due=month` thirty, which are the
       * two windows `engagementQuery` understands. A chip fifteen days out
       * needs the wider one or its link opens an empty list.
       */
      href: `/engagements?service=${chip.service}&due=${chip.days <= 7 ? "week" : "month"}`,
    }));
}

/** Morning until noon IST, afternoon until five, evening after. */
export function greeting(now = new Date()) {
  const hour = istHour(now);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The whole screen.
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {Date} now
 */
export async function firmDashboard(actor, now = new Date()) {
  const seesWork = can(actor, "view", "engagementsWork");
  const seesMoney = can(actor, "view", "invoices");
  const seesTeam = can(actor, "view", "team");
  const seesNotices = can(actor, "view", "practice");
  const seesCompliance = seesWork;

  const today = startOfISTDay(now);

  /**
   * One read of the open work, used by four sections.
   *
   * The buckets, the deadline chips, the missed-dates tile and the team
   * load all ask about the same rows, and asking four times would be four
   * round trips to Mumbai for one answer.
   */
  const open = seesWork
    ? await Engagement.find(engagementQuery(actor, {}, now))
        .select(
          "status billingStatus scope statutoryDue internalDue serviceTemplateId templateSnapshot assigneeId reviewerId clientId branchId",
        )
        .limit(20000)
        .lean()
    : [];

  const [
    missing,
    noDraftCount,
    dueSoonCount,
    unbilledTotal,
    dsc,
    reviewRows,
    noticeRows,
    branches,
  ] = await Promise.all([
    seesCompliance
      ? loadHeads(actor, { fy: financialYearStart(now), now }).then(
          (heads) => heads.totals.missing,
        )
      : null,
    seesNotices
      ? Notice.countDocuments(noticeQuery(actor, { show: "nodraft" }, now))
      : null,
    seesNotices ? dueRepliesCount(actor, now) : null,
    seesMoney ? unbilled(actor) : null,
    can(actor, "view", "dsc") ? dscExpiringTile(actor, now) : null,
    seesWork ? reviewQueue(actor, open, now) : null,
    seesNotices ? noticeDiary(actor, now) : null,
    Branch.find({}).select("code name").sort({ code: 1 }).lean(),
  ]);

  const [terrain, money, team, branchRows, caught] = await Promise.all([
    seesWork ? deadlineTerrain(actor, branches, { now }) : null,
    seesMoney ? moneyBand(actor, now) : null,
    seesTeam ? teamLoad(actor, open, now) : null,
    seesWork && branches.length > 1 ? byBranch(actor, branches, now) : null,
    seesWork ? caughtThisWeek(actor, missing, now) : null,
  ]);

  return {
    greeting: greeting(now),
    chips: seesWork ? deadlineChips(open, now) : [],

    needsAction: needsActionTiles({
      actor,
      open,
      today,
      missing,
      noDraftCount,
      dueSoonCount,
      unbilledTotal,
      dsc,
    }),

    wip: seesWork ? wipBuckets(open) : null,
    review: reviewRows,
    notices: noticeRows,
    terrain,
    money,
    team,
    branches: branchRows,
    caught,
  };
}

/**
 * The five tiles, in the reference's order.
 *
 * A tile is dropped only when the person may not see that area at all. A
 * zero still shows — "nothing is overdue" is a thing a partner wants to be
 * told on a Monday, and a row that changes length with the data is a row
 * nobody can read at a glance.
 */
function needsActionTiles({
  actor,
  open,
  today,
  missing,
  noDraftCount,
  dueSoonCount,
  unbilledTotal,
  dsc,
}) {
  const tiles = [];

  if (can(actor, "view", "engagementsWork")) {
    const missed = open.filter(
      (row) => row.statutoryDue && new Date(row.statutoryDue) < today,
    ).length;
    tiles.push({
      key: "missed",
      label: "Statutory dates missed",
      value: missed,
      note: "open jobs past a due date",
      tone: "late",
      href: "/engagements?due=overdue",
    });
  }

  if (noDraftCount != null) {
    tiles.push({
      key: "nodraft",
      label: "Replies, no draft",
      value: noDraftCount,
      note: `of ${dueSoonCount ?? noDraftCount} notice replies due in 7 days`,
      tone: "soon",
      href: "/practice/notices?show=nodraft",
    });
  }

  if (missing != null) {
    tiles.push({
      key: "missing",
      label: "Periods with no job",
      value: missing,
      note: "filings nobody has opened yet",
      tone: "info",
      href: "/compliance#never-opened",
    });
  }

  if (unbilledTotal) {
    tiles.push({
      key: "unbilled",
      label: "Finished, not billed",
      value: unbilledTotal.paise,
      paise: true,
      note: `${unbilledTotal.count} ${unbilledTotal.count === 1 ? "job" : "jobs"} ready to invoice`,
      tone: "good",
      href: "/billing?tab=ready",
    });
  }

  if (dsc) {
    tiles.push({
      key: "dsc",
      label: "DSCs expiring",
      value: dsc.value,
      note: dsc.note,
      tone: "soon",
      href: dsc.href,
    });
  }

  return tiles;
}

/**
 * Replies owed inside the week, drafted or not — the denominator the
 * "no draft" tile is a fraction of.
 */
async function dueRepliesCount(actor, now) {
  const week = new Date(startOfISTDay(now).getTime() + 7 * DAY);
  return Notice.countDocuments({
    ...noticeQuery(actor, {}, now),
    submissions: {
      $elemMatch: { filedOn: null, dueDate: { $ne: null, $lte: week } },
    },
  });
}

/**
 * What is waiting for this person to sign off.
 *
 * A partner with no personal reviews sees the firm's queue instead, under a
 * heading that says so. The alternative — an empty panel on the busiest
 * screen in the firm — tells a partner who delegates reviewing that nothing
 * is waiting, which is the opposite of true.
 */
async function reviewQueue(actor, open, now) {
  const underReview = open.filter((row) => row.status === "Under review");
  const mine = underReview.filter(
    (row) => String(row.reviewerId ?? "") === String(actor.id),
  );

  const rows = mine.length > 0 ? mine : underReview;
  const scoped = mine.length > 0;

  const sorted = rows
    .slice()
    .sort((a, b) => dueOf(a) - dueOf(b))
    .slice(0, 6);

  const [clients, people] = await Promise.all([
    import("../../models/Client.js").then(({ default: Client }) =>
      Client.find({ _id: { $in: sorted.map((r) => r.clientId) } })
        .select("legalName tradeName")
        .lean(),
    ),
    User.find({ _id: { $in: sorted.map((r) => r.assigneeId).filter(Boolean) } })
      .select("name")
      .lean(),
  ]);

  const nameOf = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const staffOf = new Map(people.map((u) => [String(u._id), u.name]));

  return {
    scoped,
    total: rows.length,
    rows: sorted.map((row) => ({
      id: String(row._id),
      client: nameOf.get(String(row.clientId)) ?? "—",
      service: row.templateSnapshot?.name ?? "—",
      period: row.templateSnapshot?.periodLabel ?? row.periodLabel ?? "",
      level: row.templateSnapshot?.level ?? null,
      tier: tierOf(row.templateSnapshot?.level),
      assignee: staffOf.get(String(row.assigneeId)) ?? "—",
      due: dueOf(row) === Infinity ? null : new Date(dueOf(row)),
      days:
        dueOf(row) === Infinity ? null : daysUntil(new Date(dueOf(row)), now),
    })),
  };
}

/** The statutory date where there is one, the firm's own target otherwise. */
function dueOf(row) {
  const due = row.statutoryDue ?? row.internalDue ?? null;
  return due ? new Date(due).getTime() : Infinity;
}

/**
 * The next open matters, by what the firm owes next on each.
 *
 * Exported since D104, because the notice register shows the same diary
 * down its right-hand side and the chip rules — hearing, draft ready, no
 * draft, and when "no draft" turns from amber to red — must be the same
 * sentence in both places or the dashboard and the register will one day
 * disagree about the same Monday.
 */
export async function noticeDiary(actor, now, limit = 5) {
  const rows = await Notice.find(noticeQuery(actor, {}, now))
    .select("clientId law section kind period submissions hearings")
    .limit(500)
    .lean();

  const withDue = rows
    .map((notice) => ({ notice, next: nextDue(notice, now) }))
    .filter((row) => row.next)
    .sort((a, b) => a.next.date - b.next.date)
    .slice(0, limit);

  const { default: Client } = await import("../../models/Client.js");
  const clients = await Client.find({
    _id: { $in: withDue.map((row) => row.notice.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const nameOf = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  return withDue.map(({ notice, next }) => {
    const owed = (notice.submissions ?? [])
      .filter((row) => !row.filedOn && row.dueDate)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

    const hearing = next.what === "Hearing";
    const drafted = owed ? isDrafted(owed) : false;

    return {
      id: String(notice._id),
      client: nameOf.get(String(notice.clientId)) ?? "—",
      law: notice.law ?? "",
      what: notice.section || notice.kind || "",
      period: notice.period ?? "",
      date: next.date,
      days: next.days,
      chip: hearing
        ? { label: "Hearing", tone: "info" }
        : drafted
          ? { label: "Draft ready", tone: "good" }
          : { label: "No draft", tone: next.days < 0 ? "late" : "soon" },
    };
  });
}

/** Billed, collected, owed — and what has not been matched to an invoice. */
async function moneyBand(actor, now) {
  const [billed, collected, owed, unmatched] = await Promise.all([
    billedInMonth(actor, now),
    collections(actor, now),
    receivables(actor, now),
    unallocatedTotal(actor),
  ]);

  return {
    month: istParts(now).month,
    billedPaise: billed,
    collectedPaise: collected.thisMonth,
    receivablePaise: owed.ageing.total ?? 0,
    unallocatedPaise: unmatched,
    ageing: ageingSegments(owed.ageing),
  };
}

/**
 * The ageing buckets as a bar, in the keys `ageReceivables` already
 * returns rather than in a second set of them.
 *
 * The colour walks from neutral to red pen across the five, because age is
 * the only thing these buckets measure and the oldest is the one somebody
 * has to ring about today.
 */
export function ageingSegments(ageing) {
  const shape = [
    { key: "current", label: "Not due", className: "bg-rule" },
    { key: "0-30", label: "0–30 d", className: "bg-carbon/45" },
    { key: "31-60", label: "31–60 d", className: "bg-waiting/70" },
    { key: "61-90", label: "61–90 d", className: "bg-waiting" },
    { key: "90+", label: "90+ d", className: "bg-redpen" },
  ];

  return shape.map((bucket) => ({
    ...bucket,
    value: ageing?.[bucket.key] ?? 0,
    display: formatPaise(ageing?.[bucket.key] ?? 0),
    href: "/billing?tab=collections",
  }));
}

/**
 * Who is carrying what, against the comfort limit.
 *
 * Interns with nothing on their desk are left out: a rail of zero-length
 * bars under the busy ones says only that the firm has interns.
 */
async function teamLoad(actor, open, now) {
  const scope = branchFilter(actor, "team") ?? {};
  const people = await User.find({ ...scope, active: true })
    .select("name role")
    .sort({ name: 1 })
    .lean();

  const loads = loadForEach(
    open,
    people.map((u) => String(u._id)),
    now,
  );

  const rows = people
    .map((person) => {
      const load = loads.get(String(person._id));
      return {
        id: String(person._id),
        name: shortName(person.name),
        role: person.role,
        load: load?.asAssignee ?? 0,
        byTier: load?.byTier ?? null,
      };
    })
    .filter((row) => row.load > 0 || row.role !== "intern")
    .sort((a, b) => b.load - a.load);

  return {
    limit: COMFORT_JOB_LIMIT,
    rows,
    hint: rebalanceHint(rows, COMFORT_JOB_LIMIT),
  };
}

/**
 * What the system noticed that nobody asked it to look for.
 *
 * **Every card here comes from a detector that already exists.** The
 * reference shows four, one of which is an MSME-creditor check that only
 * runs inside the trial-balance screen and cannot answer a firm-wide
 * question — so it is not here, and no sentence was written to fill the
 * space it left. A panel of plausible-sounding findings is worse than an
 * empty one: it is the only panel on the screen a partner has no way to
 * check.
 *
 * @param {object} actor
 * @param {number|null} missing from `loadHeads`
 * @param {Date} now
 */
async function caughtThisWeek(actor, missing, now) {
  const weekAgo = new Date(startOfISTDay(now).getTime() - 7 * DAY);
  /** @type {Array<{key: string, title: string, what: string, href: string}>} */
  const cards = [];

  if (missing) {
    cards.push({
      key: "missing",
      title: `${missing} filing ${missing === 1 ? "period" : "periods"}`,
      what: "no one opened a job for them — see the compliance grid",
      href: "/compliance#never-opened",
    });
  }

  // a certificate signed and not billed, which is the firm working for free
  // until somebody notices
  if (can(actor, "view", "udin") && can(actor, "view", "invoices")) {
    const { default: Udin } = await import("../../models/Udin.js");
    const recent = await Udin.find({
      ...(branchFilter(actor, "udin") ?? {}),
      generatedOn: { $gte: weekAgo },
      revokedAt: null,
      engagementId: { $ne: null },
    })
      .select("engagementId clientId")
      .limit(200)
      .lean();

    if (recent.length > 0) {
      const unbilledIds = await Engagement.find({
        _id: { $in: recent.map((row) => row.engagementId) },
        billingStatus: "Unbilled",
      })
        .select("clientId")
        .limit(200)
        .lean();

      if (unbilledIds.length > 0) {
        let who = "";
        const clientIds = [
          ...new Set(unbilledIds.map((row) => String(row.clientId))),
        ];
        if (clientIds.length === 1) {
          const { default: Client } = await import("../../models/Client.js");
          const client = await Client.findById(clientIds[0])
            .select("legalName tradeName")
            .lean();
          if (client) who = ` — ${client.tradeName || client.legalName}`;
        }

        cards.push({
          key: "udin",
          title: `${unbilledIds.length} UDIN ${unbilledIds.length === 1 ? "certificate" : "certificates"}`,
          what: `signed but not invoiced${who}`,
          href: "/billing?tab=ready",
        });
      }
    }
  }

  /**
   * Whatever else Issues found this week, worst severity first, using the
   * detector's own words. Nothing is summarised into a new sentence —
   * these cards link to the row that produced them.
   */
  const { issueRows } = await import("../issues/list.js");
  const rows = await issueRows(actor, now);
  /** @type {Map<string, {count: number, severity: number}>} */
  const byKind = new Map();
  for (const row of rows) {
    const entry = byKind.get(row.kind) ?? { count: 0, severity: 0 };
    entry.count += 1;
    entry.severity = Math.max(entry.severity, row.severity ?? 1);
    byKind.set(row.kind, entry);
  }

  const extra = [...byKind.entries()]
    .sort((a, b) => b[1].severity - a[1].severity || b[1].count - a[1].count)
    .slice(0, 4 - cards.length)
    .map(([kind, entry]) => ({
      key: `issue:${kind}`,
      title: `${entry.count} ${kind.toLowerCase()}`,
      what: "flagged on the Issues screen this week",
      href: `/issues?kind=${encodeURIComponent(kind)}`,
    }));

  return [...cards, ...extra].slice(0, 4);
}

/** "Ankit Saxena" becomes "Ankit S." — a rail of full names is a wall. */
export function shortName(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "—";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
