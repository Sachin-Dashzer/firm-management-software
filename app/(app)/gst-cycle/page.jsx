import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import User from "@/models/User";
import { engagementQuery } from "@/lib/engagements/filter";
import { periodOptions } from "@/lib/engagements/period";
import {
  GST_CODE,
  GST_CYCLE_STAGES,
  cycleStage,
  cycleTally,
} from "@/lib/gst/cycle";
import { nextOpenMilestone } from "@/lib/engagements/milestones";
import { formatISTDate, daysUntil } from "@/lib/dates";
import { DueChip } from "../engagements/chips";

export const metadata = { title: "Monthly GST cycle · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Every GST client, one month at a time (P3-22b).
 *
 * The cycle itself is spread across five steps on purpose — the workbook
 * and the computation are P3-12, the two gates are P3-5, the filings are
 * P3-1 — and each of those lives on the job it belongs to. What was missing
 * was the one question a partner asks on the 9th of the month: *of my
 * eleven GST clients, who has not sent their data?* That is this page, and
 * it stores nothing of its own: `cycleStage()` reads the fields those steps
 * already write.
 *
 * Closed work is included, because a filed month is the answer to the
 * question and hiding it would make the board look permanently unfinished.
 */
export default async function GstCyclePage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const now = new Date();

  const months = periodOptions("monthly", now);
  await connectDB();

  const scoped = {
    ...engagementQuery(actor, { closed: "yes" }, now),
    "templateSnapshot.code": GST_CODE,
  };

  /**
   * Which month to open on. October's GST is worked on in November, so
   * "this month" is the wrong default half the time — and a board that
   * opens empty teaches people the page is broken. So: the most recent of
   * the six months offered that actually has GST work in it.
   */
  const present = await Engagement.distinct("period", {
    ...scoped,
    period: { $in: months.map((month) => month.code) },
  });
  const period = months.some((month) => month.code === params.period)
    ? params.period
    : (months.find((month) => present.includes(month.code))?.code ??
      months[1].code);

  const engagements = await Engagement.find({ ...scoped, period })
    .sort({ statutoryDue: 1 })
    .limit(500)
    .lean();

  const [clients, staff] = await Promise.all([
    Client.find({ _id: { $in: engagements.map((e) => e.clientId) } })
      .select("legalName tradeName")
      .lean(),
    User.find({
      _id: {
        $in: engagements.map((e) => e.assigneeId).filter(Boolean),
      },
    })
      .select("name")
      .lean(),
  ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const staffName = new Map(staff.map((u) => [String(u._id), u.name]));

  const tally = cycleTally(engagements);
  const stage = GST_CYCLE_STAGES.some((s) => s.key === params.stage)
    ? params.stage
    : null;

  const rows = engagements
    .map((engagement) => {
      const at = cycleStage(engagement);
      const next = nextOpenMilestone(engagement);
      const issues = Array.isArray(engagement.gstPrep?.issues)
        ? engagement.gstPrep.issues.length
        : 0;

      return {
        id: String(engagement._id),
        client: clientName.get(String(engagement.clientId)) ?? "Client",
        work: engagement.templateSnapshot?.name ?? "GST",
        who: staffName.get(String(engagement.assigneeId ?? "")) ?? "Nobody",
        stage: at,
        issues,
        submissions: engagement.gstPrep?.submissionCount ?? 0,
        next: next
          ? { name: next.name, date: next.dueDate }
          : engagement.statutoryDue
            ? { name: "Return", date: engagement.statutoryDue }
            : null,
        filings: (engagement.milestones ?? []).map((milestone) => ({
          name: milestone.name,
          filed: Boolean(milestone.filedOn),
        })),
      };
    })
    .filter((row) => !stage || row.stage.key === stage)
    .sort((a, b) => a.stage.index - b.stage.index);

  const label =
    months.find((month) => month.code === period)?.label ?? String(period);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Monthly GST cycle
          </h1>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Where each client&rsquo;s {label} has got to, from the data coming
            in to the return going in. Read off the work itself — there is no
            second record of a month to go stale.
          </p>
        </div>

        <form method="get" className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">Month</span>
            <select
              name="period"
              defaultValue={period}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              {months.map((month) => (
                <option key={month.code} value={month.code}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-control border-rule bg-sunk text-14 text-ink h-9 border px-3 font-medium"
          >
            Show
          </button>
        </form>
      </div>

      {engagements.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
          No GST work exists for {label}. Monthly engagements are generated by
          the runner from the service&rsquo;s recurrence (step 7), or created by
          hand from{" "}
          <Link
            href="/engagements/new"
            className="underline underline-offset-4"
          >
            New engagement
          </Link>
          .
        </p>
      ) : (
        <>
          {/* The eight stages, in order, as a strip you can filter by. */}
          <nav
            aria-label="Stages of the month"
            className="flex flex-wrap gap-2"
          >
            {tally.map((entry) => (
              <Link
                key={entry.key}
                href={
                  entry.key === stage
                    ? `/gst-cycle?period=${period}`
                    : `/gst-cycle?period=${period}&stage=${entry.key}`
                }
                aria-current={entry.key === stage ? "page" : undefined}
                title={entry.hint}
                className={`rounded-control text-13 flex items-baseline gap-2 border px-3 py-1.5 ${
                  entry.key === stage
                    ? "border-carbon bg-carbon-wash text-carbon"
                    : entry.count === 0
                      ? "border-rule text-ink-muted"
                      : "border-rule hover:bg-carbon-wash"
                }`}
              >
                <span>{entry.label}</span>
                {entry.count > 0 && (
                  <span className="num font-medium">{entry.count}</span>
                )}
              </Link>
            ))}
          </nav>

          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Returns</th>
                  <th className="px-3 py-2 font-medium">Next due</th>
                  <th className="px-3 py-2 font-medium">With</th>
                  <th className="px-3 py-2 font-medium">Sheet</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/engagements/${row.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {row.client}
                      </Link>
                      <span className="text-12 text-ink-muted block">
                        {row.work}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          row.stage.key === "awaiting-data" ||
                          row.stage.key === "corrections"
                            ? "text-waiting"
                            : row.stage.key === "filed"
                              ? "text-ink-muted"
                              : ""
                        }
                      >
                        {row.stage.label}
                      </span>
                    </td>
                    <td className="text-13 px-3 py-2">
                      {row.filings.length === 0 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        row.filings.map((filing) => (
                          <span
                            key={filing.name}
                            className={`mr-2 ${
                              filing.filed ? "text-filed" : "text-ink-muted"
                            }`}
                          >
                            {filing.name}
                            {filing.filed ? " ✓" : ""}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.next?.date ? (
                        <DueChip
                          label={row.next.name}
                          date={formatISTDate(row.next.date)}
                          days={daysUntil(row.next.date, now)}
                        />
                      ) : (
                        <span className="text-ink-muted text-13">—</span>
                      )}
                    </td>
                    <td className="text-13 px-3 py-2">{row.who}</td>
                    <td className="text-13 px-3 py-2">
                      {row.submissions === 0 ? (
                        <span className="text-ink-muted">not sent in</span>
                      ) : (
                        <>
                          <span className="num">{row.submissions}</span>{" "}
                          {row.submissions === 1 ? "upload" : "uploads"}
                          {row.issues > 0 && (
                            <span className="text-redpen">
                              {" "}
                              · {row.issues}{" "}
                              {row.issues === 1 ? "problem" : "problems"}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-ink-muted px-3 py-6 text-center"
                    >
                      Nothing is at that stage.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
