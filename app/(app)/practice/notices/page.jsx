import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Notice from "@/models/Notice";
import Client from "@/models/Client";
import User from "@/models/User";
import RuleConfirmation from "@/models/RuleConfirmation";
import { formatISTDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import {
  NOTICE_KINDS,
  NOTICE_LAWS,
  NOTICE_STAGES,
  allLawRules,
} from "@/lib/practice/noticeLaw";
import {
  nextDue,
  isOverdue,
  isDrafted,
  adjournments,
  lawClocks,
  noticeQuery,
} from "@/lib/practice/notices";
import { noticeDiary } from "@/lib/reports/dashboard";
import PageHead from "@/components/ui/PageHead";
import Screen from "@/components/ui/Screen";
import StatTile from "@/components/ui/StatTile";
import NoticeDiary from "@/components/dashboard/firm/NoticeDiary";
import NoticeList from "./NoticeList";

export const metadata = { title: "Notices · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Every notice the firm is answering (P3-11).
 *
 * The starter catalog treats a notice as one job with one due date, which
 * is how you track a letter rather than a matter. This is the register of
 * the matters: what is owed next on each, what is overdue, and how much is
 * at stake.
 */
export default async function NoticesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const stage = NOTICE_STAGES.includes(params.stage) ? params.stage : "";
  /** The menu's own filters (P3-22a): one law, or the ones with no draft. */
  const law = NOTICE_LAWS.includes(params.law) ? params.law : "";
  /**
   * `week` and `demand` joined `nodraft` in D104: they are the tiles
   * above the table, and a tile whose figure cannot be opened is a figure
   * nobody can check. Neither is a database condition — both are read off
   * the dates and amounts already on each row — so only `nodraft` reaches
   * `noticeQuery`.
   */
  const show = ["nodraft", "week", "demand"].includes(params.show)
    ? params.show
    : "";

  await connectDB();

  /**
   * `noticeQuery` is the one definition of what each notices link means,
   * shared with the badge beside it (P3-22a) — a badge that counts
   * differently from the page it opens is a number nobody trusts twice.
   */
  const [notices, confirmations, diary] = await Promise.all([
    Notice.find(noticeQuery(actor, { stage, law, show }))
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    RuleConfirmation.find({ confirmedAt: { $ne: null } })
      .select("kind key confirmedAt")
      .lean(),
    /** The rail: what is owed next, in the order it falls due (D104). */
    noticeDiary(actor, new Date(), 8),
  ]);

  /**
   * The tiles count every open matter in scope, not what the chips have
   * left. They are the filter, so counting them after themselves would
   * empty the other three the first time one was used — and on the
   * default view this is the same set as `notices`, so no second query
   * runs for the page everybody opens.
   */
  const openSet =
    stage || show === "demand" || show === "week" || show === "nodraft"
      ? await Notice.find(noticeQuery(actor, { law }))
          .select("stage risk stakePaise demandPaise submissions hearings")
          .limit(500)
          .lean()
      : notices;

  const [clients, people] = await Promise.all([
    Client.find({ _id: { $in: notices.map((row) => row.clientId) } })
      .select("legalName tradeName")
      .lean(),
    User.find({ active: true }).select("name").lean(),
  ]);
  const clientName = new Map(
    clients.map((row) => [String(row._id), row.tradeName || row.legalName]),
  );
  const personName = new Map(people.map((row) => [String(row._id), row.name]));

  const rows = notices.map((notice) => {
    const next = nextDue(notice);
    const clocks = lawClocks(notice, confirmations);
    return {
      id: String(notice._id),
      client: clientName.get(String(notice.clientId)) ?? "Client",
      clientId: String(notice.clientId),
      law: notice.law,
      kindLabel: NOTICE_KINDS[notice.kind]?.label ?? notice.kind,
      section: notice.section,
      period: notice.period,
      din: notice.din,
      stage: notice.stage,
      risk: notice.risk,
      /** What has gone in and what is still owed, which is the matter. */
      filed: (notice.submissions ?? []).filter((row) => row.filedOn).length,
      owed: (notice.submissions ?? []).filter(
        (row) => !row.filedOn && row.dueDate,
      ).length,
      hearings: (notice.hearings ?? []).filter((row) => row.heldOn).length,
      stake: notice.stakePaise ? formatPaise(notice.stakePaise) : "",
      demand: notice.demandPaise ? formatPaise(notice.demandPaise) : "",
      assignee: notice.assigneeId
        ? (personName.get(String(notice.assigneeId)) ?? "")
        : "",
      partner: notice.partnerId
        ? (personName.get(String(notice.partnerId)) ?? "")
        : "",
      next: next
        ? { what: next.what, date: formatISTDate(next.date), days: next.days }
        : null,
      overdue: isOverdue(notice),
      adjournments: adjournments(notice, clocks),
      /** How much of the law behind this matter nobody has checked yet. */
      unconfirmed: clocks.filter((clock) => !clock.confirmed).length,
    };
  });

  /** The two cuts that are read off the row rather than asked of Mongo. */
  const visible = rows.filter((row) =>
    show === "week"
      ? row.next && row.next.days <= 7
      : show === "demand"
        ? Boolean(row.demand)
        : true,
  );

  /** The next submission owed on a matter, drafted or not. */
  const owedOn = (notice) =>
    (notice.submissions ?? [])
      .filter((row) => !row.filedOn && row.dueDate)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0] ?? null;

  const withinWeek = openSet.filter((notice) => {
    const next = nextDue(notice);
    return next && next.days <= 7;
  });
  const tiles = {
    open: openSet.length,
    highRisk: openSet.filter((notice) => notice.risk === "High").length,
    week: withinWeek.length,
    noDraft: withinWeek.filter((notice) => {
      const owed = owedOn(notice);
      return owed && !isDrafted(owed);
    }).length,
    demand: openSet.reduce((sum, n) => sum + (n.demandPaise ?? 0), 0),
    stake: openSet.reduce((sum, n) => sum + (n.stakePaise ?? 0), 0),
  };

  /** A link that keeps the law chip, and changes which cut is shown. */
  const keep = (next) => {
    const params = new URLSearchParams();
    if (law) params.set("law", law);
    if (next) params.set("show", next);
    const tail = params.toString();
    return `/practice/notices${tail ? `?${tail}` : ""}`;
  };

  // the whole table, so the strip can say how much of it is still unchecked
  const total = allLawRules().length;
  const confirmed = confirmations.length;

  return (
    <Screen>
      <PageHead
        title="Notices and litigation"
        sub="Each one is a matter, not a job: several submissions with their own dates and acknowledgements, hearings that get put off, and limits that come from the statute rather than from the notice."
      >
        {can(actor, "edit", "practice") && (
          <Link
            href="/practice/notices/new"
            className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 leading-8 font-medium"
          >
            Open a matter
          </Link>
        )}
      </PageHead>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatTile
          label="Open matters"
          value={tiles.open}
          note={
            tiles.highRisk > 0
              ? `${tiles.highRisk} high risk`
              : "none high risk"
          }
          href={keep("")}
          selected={!show && !stage}
        />
        <StatTile
          label="Due in 7 days"
          value={tiles.week}
          note="replies, submissions or hearings"
          tone="soon"
          href={keep("week")}
          selected={show === "week"}
        />
        <StatTile
          label="Due in 7 days, no draft"
          value={tiles.noDraft}
          note="nobody has picked the reply up"
          tone="late"
          href={keep("nodraft")}
          selected={show === "nodraft"}
        />
        <StatTile
          label="Demand in dispute"
          value={tiles.demand}
          paise
          note={`tax at stake ${formatPaise(tiles.stake)}`}
          href={keep("demand")}
          selected={show === "demand"}
        />
      </div>

      {confirmed < total && (
        <p className="rounded-ledger border-waiting/40 bg-waiting-wash text-12 shrink-0 border px-3 py-2">
          <strong className="num">
            {total - confirmed} of {total}
          </strong>{" "}
          rules in the notice-law table are still a first draft nobody has
          confirmed, so no limitation date computed from them is shown anywhere.
          Open a matter to confirm the rules that apply to it.
        </p>
      )}

      {/*
        Two columns at `xl`, where there is width for a diary beside a
        seven-column table; one column below it, scrolling as a whole, so
        the rail is reached by scrolling past the matters rather than
        being stranded under a region that does not move.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:overflow-y-auto xl:flex-row xl:overflow-y-visible">
        <NoticeList
          rows={visible}
          stage={stage}
          stages={NOTICE_STAGES}
          law={law}
          show={show}
        />
        <aside className="w-full shrink-0 xl:w-[21rem] xl:overflow-y-auto">
          <NoticeDiary rows={diary} title="Up next" link={null} />
        </aside>
      </div>
    </Screen>
  );
}
