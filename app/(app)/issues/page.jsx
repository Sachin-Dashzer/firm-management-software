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
import PageHead from "@/components/ui/PageHead";
import Screen from "@/components/ui/Screen";
import Segmented from "@/components/ui/Segmented";
import StatTile from "@/components/ui/StatTile";
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
  /**
   * How bad, as a filter (D104). The tiles above the list are the only
   * way to ask for it, and they are counted over `inScope` — before the
   * kind chips — because a tile that counts what the chips have already
   * narrowed zeroes its three neighbours the moment somebody uses one.
   */
  const sev = ["3", "2", "1"].includes(params.sev) ? Number(params.sev) : 0;

  const inScope = all.filter((row) => (who === "all" ? true : isMine(row, me)));
  const rows = filterIssues(all, { who, kind }, me).filter(
    (row) => !sev || row.severity === sev,
  );

  /** How many of the reader's own list are there because of a cover. */
  const covered = inScope.filter(
    (row) =>
      row.ownerId &&
      me.covering.some((id) => String(id) === String(row.ownerId)),
  ).length;

  /** The tiles, which are also the severity filter. */
  const severity = [3, 2, 1].map(
    (level) => inScope.filter((row) => row.severity === level).length,
  );

  /** A link that keeps the filters already on, and changes one of them. */
  const keep = (extra) => {
    const next = new URLSearchParams();
    if (who !== (actor.role === "partner" ? "all" : "mine")) {
      next.set("who", who);
    }
    if (kind) next.set("kind", kind);
    if (sev) next.set("sev", String(sev));
    for (const [key, value] of Object.entries(extra)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const tail = next.toString();
    return tail ? `?${tail}` : "";
  };

  return (
    <Screen>
      <PageHead
        title="Issues"
        sub="Worked out live from the records — there is nothing to tick off. When the thing behind a row is dealt with, the row goes."
      >
        <Segmented
          label="Whose issues"
          value={who}
          items={[
            {
              key: "mine",
              label: "Mine",
              href: `/issues${keep({ who: "mine" })}`,
            },
            {
              key: "all",
              label: "Everyone",
              href: `/issues${keep({ who: "all" })}`,
            },
          ]}
        />
      </PageHead>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatTile
          label="Everything"
          value={inScope.length}
          note={who === "mine" ? "on your desk" : "across the firm"}
          href={`/issues${keep({ sev: "" })}`}
          selected={!sev}
        />
        <StatTile
          label="Urgent"
          value={severity[0]}
          note="today, or it bites"
          tone="late"
          href={`/issues${keep({ sev: "3" })}`}
          selected={sev === 3}
        />
        <StatTile
          label="Today"
          value={severity[1]}
          note="before the day ends"
          tone="soon"
          href={`/issues${keep({ sev: "2" })}`}
          selected={sev === 2}
        />
        <StatTile
          label="This week"
          value={severity[2]}
          note="not pressing yet"
          href={`/issues${keep({ sev: "1" })}`}
          selected={sev === 1}
        />
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
    </Screen>
  );
}
