import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Leave from "@/models/Leave";
import Engagement from "@/models/Engagement";
import { engagementQuery } from "@/lib/engagements/filter";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { startOfISTDay, formatISTDate } from "@/lib/dates";
import {
  issueRows,
  filterIssues,
  countByKind,
  isMine,
  KINDS,
} from "@/lib/issues/list";
import IssuesList from "./IssuesList";

export const metadata = { title: "Issues · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Everything that needs attention, in one place (P3-6).
 *
 * The landing page for everyone in the firm. Nothing here is stored and
 * nothing is marked resolved: fix the record and the row is gone when the
 * page is next drawn.
 */
export default async function IssuesPage({ searchParams }) {
  const actor = await requireUser();
  const params = (await searchParams) ?? {};

  await connectDB();

  /**
   * Whose work this person is holding today (P3-16). The rows themselves
   * are unchanged — cover decides whose list a row falls into, never what
   * anybody may see, so this is read after `issueRows` has already applied
   * every scope.
   */
  const today = startOfISTDay(new Date());
  const covering = await Leave.find({
    coverId: actor.id,
    from: { $lte: today },
    to: { $gte: today },
  })
    .select("userId to")
    .lean();

  const absent = covering.length
    ? await User.find({ _id: { $in: covering.map((row) => row.userId) } })
        .select("name")
        .lean()
    : [];
  const absentName = new Map(absent.map((row) => [String(row._id), row.name]));

  const me = {
    ...actor,
    covering: covering.map((row) => String(row.userId)),
  };

  /**
   * **Covering does not widen access** (spec section 2, and the plan the
   * owner approved). An employee covering a colleague still sees only their
   * own work, so the colleague's rows are not in this list at all — and
   * saying nothing would be the worst of both: they were told they are
   * covering and shown an empty page.
   *
   * So the work they cannot see is counted and named as a count. Two
   * counts: everything open that is the absentee's, and the part of it
   * this reader was already allowed to see.
   */
  const theirs = covering.length
    ? {
        $or: [
          { assigneeId: { $in: covering.map((row) => row.userId) } },
          { reviewerId: { $in: covering.map((row) => row.userId) } },
        ],
      }
    : null;

  const [absentTotal, absentVisible] = theirs
    ? await Promise.all([
        Engagement.countDocuments({
          ...theirs,
          status: { $nin: CLOSED_STATUSES },
        }),
        Engagement.countDocuments({
          ...engagementQuery(actor, {}),
          ...theirs,
        }),
      ])
    : [0, 0];

  const all = await issueRows(actor);

  // a partner opens the firm's whole list; everybody else opens their own
  const who =
    params.who === "all" || params.who === "mine"
      ? params.who
      : actor.role === "partner"
        ? "all"
        : "mine";
  const kind = KINDS.includes(params.kind) ? params.kind : "";

  const inScope = all.filter((row) => (who === "all" ? true : isMine(row, me)));
  const rows = filterIssues(all, { who, kind }, me);

  /** How many of the reader's own list are there because of a cover. */
  const covered = inScope.filter(
    (row) =>
      row.ownerId &&
      me.covering.some((id) => String(id) === String(row.ownerId)),
  ).length;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Issues
        </h1>
        <p className="text-14 text-ink-muted max-w-[65ch]">
          Worked out live from the records. There is nothing to tick off — when
          the thing behind a row is dealt with, the row disappears by itself.
        </p>
      </div>

      {covering.length > 0 && (
        <p className="rounded-ledger border-rule bg-sunk text-13 border px-3 py-2">
          You are covering for{" "}
          {covering
            .map(
              (row) =>
                `${absentName.get(String(row.userId)) ?? "a colleague"} until ${formatISTDate(row.to)}`,
            )
            .join(", ")}
          .{" "}
          {covered > 0
            ? `${covered} ${covered === 1 ? "row is" : "rows are"} theirs.`
            : "Nothing of theirs is outstanding here."}{" "}
          The work is still on their name — covering means you watch it and get
          their reminders, not that it has moved.
          {absentTotal > absentVisible && (
            <span className="block">
              {absentTotal - absentVisible} of their open{" "}
              {absentTotal - absentVisible === 1 ? "job is" : "jobs are"}{" "}
              outside what you may see, so{" "}
              {absentTotal - absentVisible === 1 ? "it is" : "they are"} not
              listed above. Covering does not open a client to you. Ask a
              partner to move the work if it cannot wait.
            </span>
          )}
        </p>
      )}

      <IssuesList
        rows={rows}
        who={who}
        kind={kind}
        total={inScope.length}
        counts={countByKind(inScope)}
        kinds={KINDS}
      />
    </div>
  );
}
