import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, scopeOf, branchFilter, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Leave from "@/models/Leave";
import User from "@/models/User";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import TimeEntry from "@/models/TimeEntry";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import {
  coversDay,
  statusOf,
  leaveDays,
  attendanceMonth,
  LEAVE_KINDS,
} from "@/lib/team/leave";
import { formatISTDate, startOfISTDay, istParts, istDate } from "@/lib/dates";
import PageHead from "@/components/ui/PageHead";
import Segmented from "@/components/ui/Segmented";
import Requests from "./Requests";
import Attendance from "./Attendance";

export const metadata = { title: "Leave and attendance · PHMG" };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
/** How far ahead the board looks. A month is as far as anyone plans here. */
const AHEAD = 30;

/**
 * Leave, and the attendance month (owner request, 01-11-2026).
 *
 * Two tabs, because they answer two different questions and were being
 * asked of one screen:
 *
 *  - **Applications** — what is waiting on a decision, who is away now and
 *    next, and the work that falls due while they are gone. This is where
 *    leave is approved, declined, marked for somebody, and where the work
 *    is handed to the cover.
 *  - **Attendance** — the month as a grid, person by day. It is built from
 *    the timesheet and from approved leave, because this application has no
 *    clock-in and will not pretend to one: see `attendanceMonth`.
 *
 * An employee or an intern has `own` scope, so they get their own
 * applications and the ones they are covering, and the apply form. Not a
 * list of where their colleagues are.
 */
export default async function LeaveBoardPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "team")) redirect("/me");

  const params = (await searchParams) ?? {};
  const tab = params.tab === "attendance" ? "attendance" : "applications";

  const now = new Date();
  const today = startOfISTDay(now);

  await connectDB();

  const ownOnly = scopeOf(actor, "team") === "own";
  const mayDecide = can(actor, "approve", "leaveApprove");

  /**
   * Whose absences this person may read. A Partner sees the firm, a CA their
   * branches, and everybody else themselves plus whoever they cover.
   */
  let who = {};
  /** @type {any[]} */
  let colleagues = [];
  if (ownOnly) {
    who = { $or: [{ userId: actor.id }, { coverId: actor.id }] };
  } else {
    const scoped = branchFilter(actor, "team")
      ? { branchIds: { $in: actor.branchIds ?? [] } }
      : {};
    colleagues = await User.find({ ...scoped, active: true })
      .select("name role branchIds")
      .sort({ name: 1 })
      .lean();
    if (branchFilter(actor, "team")) {
      who = { userId: { $in: colleagues.map((person) => person._id) } };
    }
  }

  if (tab === "attendance") {
    return (
      <Shell tab={tab} ownOnly={ownOnly}>
        <AttendanceTab
          actor={actor}
          params={params}
          who={who}
          colleagues={colleagues}
          ownOnly={ownOnly}
          now={now}
        />
      </Shell>
    );
  }

  // --- the applications tab ------------------------------------------------

  const horizon = new Date(today.getTime() + AHEAD * DAY);

  /**
   * Everything pending, however far off, plus approved leave in force now or
   * starting inside the horizon. A pending application for March is the one
   * thing a decider must see in November — it is the whole reason they are
   * here — so it is not held to the 30-day window.
   */
  const leaves = await Leave.find({
    ...who,
    $or: [
      { status: "Pending" },
      { to: { $gte: today }, from: { $lt: horizon } },
    ],
  })
    .sort({ from: 1 })
    .limit(500)
    .lean();

  const people = await User.find({
    _id: {
      $in: [
        ...new Set([
          ...leaves.map((row) => String(row.userId)),
          ...leaves.map((row) => String(row.coverId ?? "")).filter(Boolean),
        ]),
      ],
    },
  })
    .select("name role")
    .lean();
  const personName = new Map(
    people.map((person) => [String(person._id), person.name]),
  );
  const personRole = new Map(
    people.map((person) => [String(person._id), person.role]),
  );

  /**
   * Work that falls due inside somebody's absence. One query for every
   * absence on the board, bucketed below — a query per person would be
   * eleven round trips for a five-person firm.
   *
   * It covers pending applications too, because "what falls due while they
   * are gone" is exactly what the decider needs in front of them before
   * saying yes, and it is the list they tick to hand the work over.
   */
  const owners = [...new Set(leaves.map((row) => String(row.userId)))];
  const dueWindow = leaves.reduce(
    (latest, row) => (new Date(row.to) > latest ? new Date(row.to) : latest),
    today,
  );

  const work = owners.length
    ? await Engagement.find({
        status: { $nin: CLOSED_STATUSES },
        assigneeId: { $in: owners },
        $or: [
          { statutoryDue: { $gte: today, $lte: dueWindow } },
          { statutoryDue: null, internalDue: { $gte: today, $lte: dueWindow } },
        ],
      })
        .select(
          "assigneeId clientId templateSnapshot period periodLabel statutoryDue internalDue",
        )
        .sort({ statutoryDue: 1, internalDue: 1 })
        .limit(500)
        .lean()
    : [];

  const clients = await Client.find({
    _id: { $in: work.map((row) => row.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((row) => [String(row._id), row.tradeName || row.legalName]),
  );

  const rows = leaves.map((leave) => {
    const falls = work
      .filter(
        (engagement) =>
          String(engagement.assigneeId) === String(leave.userId) &&
          // the day it falls due, against the days they are away
          coversDay(leave, engagement.statutoryDue ?? engagement.internalDue),
      )
      .map((engagement) => ({
        id: String(engagement._id),
        client: clientName.get(String(engagement.clientId)) ?? "Client",
        work: engagement.templateSnapshot?.name ?? "Work",
        period: engagement.periodLabel || engagement.period,
        due: formatISTDate(engagement.statutoryDue ?? engagement.internalDue),
      }));

    return {
      id: String(leave._id),
      userId: String(leave.userId),
      person: personName.get(String(leave.userId)) ?? "Somebody",
      role: ROLE_LABELS[personRole.get(String(leave.userId))] ?? "",
      cover: leave.coverId
        ? (personName.get(String(leave.coverId)) ?? "Somebody")
        : "",
      coverId: String(leave.coverId ?? ""),
      kind: leave.kind,
      status: statusOf(leave),
      days: leaveDays(leave),
      from: formatISTDate(leave.from),
      to: formatISTDate(leave.to),
      startsIn: Math.round(
        (startOfISTDay(leave.from).getTime() - today.getTime()) / DAY,
      ),
      note: leave.note ?? "",
      decisionNote: leave.decisionNote ?? "",
      decidedByName: leave.approvedByName ?? "",
      decidedOn: leave.approvedAt ? formatISTDate(leave.approvedAt) : "",
      current: statusOf(leave) === "Approved" && coversDay(leave, now),
      mine: String(leave.userId) === actor.id,
      falls,
    };
  });

  /**
   * Who may be named as a cover. Active colleagues the reader can see, minus
   * nobody — the server refuses a cover who is away, and the error says who
   * and when, which is more use than a name quietly missing from a list.
   */
  const coverChoices = (
    colleagues.length
      ? colleagues
      : await User.find({ active: true })
          .select("name role")
          .sort({ name: 1 })
          .lean()
  ).map((person) => ({
    id: String(person._id),
    name: person.name,
    role: ROLE_LABELS[person.role] ?? person.role,
  }));

  return (
    <Shell tab={tab} ownOnly={ownOnly}>
      <Requests
        rows={rows}
        people={coverChoices}
        kinds={LEAVE_KINDS}
        mayDecide={mayDecide}
        ownOnly={ownOnly}
        actorId={actor.id}
        actorIsPartner={actor.role === "partner"}
        ahead={AHEAD}
      />
    </Shell>
  );
}

/** The head and the two tabs, around whichever one is open. */
function Shell({ tab, ownOnly, children }) {
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-4 md:p-6">
      <PageHead
        title="Leave and attendance"
        sub={
          ownOnly
            ? "Your own leave, the work you are holding for somebody else, and your month."
            : "What is waiting on a decision, who is away, and the month as it was actually worked."
        }
      >
        <Link
          href="/team"
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          The team
        </Link>
      </PageHead>

      <Segmented
        label="Leave or attendance"
        value={tab}
        items={[
          {
            key: "applications",
            label: "Leave",
            href: "/team/leave",
          },
          {
            key: "attendance",
            label: "Attendance",
            href: "/team/leave?tab=attendance",
          },
        ]}
      />

      {children}
    </div>
  );
}

/**
 * The month grid. Its own component because it asks different questions of
 * the database — the timesheet, and the whole month rather than the horizon.
 */
async function AttendanceTab({ actor, params, who, colleagues, ownOnly, now }) {
  const here = istParts(now);
  const asked = String(params.month ?? "");
  const match = /^(\d{4})-(\d{2})$/.exec(asked);
  const year = match ? Number(match[1]) : here.year;
  const month = match ? Number(match[2]) : here.month;
  const valid = month >= 1 && month <= 12 && year >= 2020 && year <= 2100;
  const [y, m] = valid ? [year, month] : [here.year, here.month];

  const first = istDate(y, m, 1);
  const next = istDate(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1);

  /** The people on the grid: the reader's scope, or just the reader. */
  const people = ownOnly
    ? await User.find({ _id: actor.id }).select("name role").lean()
    : colleagues;

  const ids = people.map((person) => person._id);

  const [leaves, time] = await Promise.all([
    // any leave that touches the month at all, both ends counted
    Leave.find({
      ...(ownOnly ? who : { userId: { $in: ids } }),
      from: { $lt: next },
      to: { $gte: first },
    }).lean(),
    TimeEntry.find({
      userId: { $in: ids },
      on: { $gte: first, $lt: next },
      minutes: { $gt: 0 },
    })
      .select("userId on minutes")
      .lean(),
  ]);

  const grid = attendanceMonth({
    people,
    leaves,
    time,
    year: y,
    month: m,
    now,
  });

  return (
    <Attendance
      grid={grid}
      year={y}
      month={m}
      thisMonth={here.year === y && here.month === m}
    />
  );
}
