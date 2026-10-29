import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, scopeOf, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Leave from "@/models/Leave";
import User from "@/models/User";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { coversDay } from "@/lib/team/leave";
import { formatISTDate, startOfISTDay, daysUntil } from "@/lib/dates";

export const metadata = { title: "Leave and cover · PHMG" };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
/** How far ahead the board looks. A month is as far as anyone plans here. */
const AHEAD = 30;

/**
 * Who is away, who is covering, and what falls due while they are gone
 * (P3-22b, over P3-16).
 *
 * Recording an absence stays on the person's own record, where the overlap
 * checks and the cover rules live. What was missing is the firm-wide view,
 * and in particular the warning spec section 9 asks for in so many words:
 * *the system warns if a person on leave has engagements due.* That warning
 * cannot be given on one person's page, because the person reading it is
 * the one who is away.
 *
 * An employee or an intern has `own` scope on the team area, so they get
 * their own absences and the ones they are covering — which is the useful
 * half for them, and not a list of where their colleagues are.
 */
export default async function LeaveBoardPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "team")) redirect("/me");

  const now = new Date();
  const today = startOfISTDay(now);
  const horizon = new Date(today.getTime() + AHEAD * DAY);

  await connectDB();

  const ownOnly = scopeOf(actor, "team") === "own";

  /**
   * Whose absences this person may read. A Partner sees the firm, a CA their
   * branches, and everybody else themselves plus whoever they cover.
   */
  let who = {};
  if (ownOnly) {
    who = { $or: [{ userId: actor.id }, { coverId: actor.id }] };
  } else if (branchFilter(actor, "team")) {
    const colleagues = await User.find({
      branchIds: { $in: actor.branchIds ?? [] },
    })
      .select("_id")
      .lean();
    who = { userId: { $in: colleagues.map((person) => person._id) } };
  }

  /** In force now, or starting inside the horizon. */
  const leaves = await Leave.find({
    ...who,
    to: { $gte: today },
    from: { $lt: horizon },
  })
    .sort({ from: 1 })
    .limit(500)
    .lean();

  const people = await User.find({
    _id: {
      $in: [
        ...new Set([
          ...leaves.map((row) => String(row.userId)),
          ...leaves.map((row) => String(row.coverId)),
        ]),
      ],
    },
  })
    .select("name role")
    .lean();
  const personName = new Map(
    people.map((person) => [String(person._id), person.name]),
  );

  /**
   * Work that falls due inside somebody's absence. One query for every
   * absence on the board, bucketed below — a query per person would be
   * eleven round trips for a five-person firm.
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
        due: engagement.statutoryDue ?? engagement.internalDue,
      }));

    return {
      id: String(leave._id),
      userId: String(leave.userId),
      person: personName.get(String(leave.userId)) ?? "Somebody",
      cover: personName.get(String(leave.coverId)) ?? "Nobody",
      kind: leave.kind,
      from: leave.from,
      to: leave.to,
      note: leave.note ?? "",
      approvedByName: leave.approvedByName ?? "",
      current: coversDay(leave, now),
      falls,
    };
  });

  const away = rows.filter((row) => row.current);
  const coming = rows.filter((row) => !row.current);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Leave and cover
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          {ownOnly
            ? "Your own absences, and the work you are holding for somebody else."
            : `Who is away now and in the next ${AHEAD} days, who holds their work, and what falls due while they are gone. An absence is recorded on the person's own record.`}
        </p>
      </div>

      <Section
        title="Away now"
        empty="Nobody is away today."
        rows={away}
        now={now}
      />
      <Section
        title={`Coming up, next ${AHEAD} days`}
        empty="No leave is booked in the next month."
        rows={coming}
        now={now}
      />

      {!ownOnly && (
        <p className="text-13 text-ink-muted">
          Past leave stays on each person&rsquo;s record —{" "}
          <Link href="/team" className="underline underline-offset-4">
            the team list
          </Link>{" "}
          is the way to it.
        </p>
      )}
    </div>
  );
}

/** One half of the board. Absences, each with the work it crosses. */
function Section({ title, empty, rows, now }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-13 text-ink-muted font-medium">
        {title}
        {rows.length > 0 && <span className="num"> · {rows.length}</span>}
      </h2>

      {rows.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
          {empty}
        </p>
      ) : (
        rows.map((row) => (
          <article
            key={row.id}
            className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-16 font-medium">
                <Link
                  href={`/team/${row.userId}?tab=leave`}
                  className="underline underline-offset-4"
                >
                  {row.person}
                </Link>
                <span className="text-13 text-ink-muted">
                  {" "}
                  · {row.kind.toLowerCase()}
                </span>
              </h3>
              <p className="num text-13 text-ink-muted">
                {formatISTDate(row.from)} to {formatISTDate(row.to)}
                {!row.current && ` · in ${daysUntil(row.from, now)} days`}
              </p>
            </div>

            <p className="text-14">
              Covered by <strong>{row.cover}</strong>
              {row.note && (
                <span className="text-ink-muted"> · {row.note}</span>
              )}
            </p>

            {row.falls.length === 0 ? (
              <p className="text-13 text-ink-muted">
                Nothing of theirs falls due while they are away.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-13 text-redpen font-medium">
                  {row.falls.length}{" "}
                  {row.falls.length === 1 ? "job falls" : "jobs fall"} due while
                  they are away — {row.cover} holds{" "}
                  {row.falls.length === 1 ? "it" : "them"}.
                </p>
                <ul className="flex flex-col gap-1">
                  {row.falls.map((job) => (
                    <li key={job.id} className="text-13">
                      <Link
                        href={`/engagements/${job.id}`}
                        className="underline underline-offset-4"
                      >
                        {job.client}
                      </Link>{" "}
                      <span className="text-ink-muted">
                        {job.work} · {job.period} · due{" "}
                        <span className="num">{formatISTDate(job.due)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
}
