import Link from "next/link";
import { requireUser } from "@/auth";
import { branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import {
  formatISTDate,
  financialYearLabel,
  daysUntil,
  startOfISTDay,
} from "@/lib/dates";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { DueChip, PriorityChip } from "../engagements/chips";
import RoleDashboard from "@/components/dashboard/RoleDashboard";

export const metadata = { title: "Today · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Where everybody lands (spec sections 10 and 15).
 *
 * My work in three columns — due, waiting on a client, waiting for my
 * review — is the bottom half for every role, because every role has
 * their own work. Above it sits the dashboard their job needs: the firm
 * overview for a partner, the review queue for a CA, the billing board
 * for accounts. An employee or an intern has no second dashboard: their
 * own work *is* the dashboard spec section 10 describes for them, and a
 * second screen saying the same thing twice would be furniture.
 */
export default async function TodayPage() {
  const actor = await requireUser();
  const now = new Date();

  await connectDB();

  const open = { status: { $nin: CLOSED_STATUSES } };
  const endOfToday = new Date(startOfISTDay(now).getTime() + 86_400_000);

  const [due, waiting, toReview] = await Promise.all([
    Engagement.find({
      ...open,
      assigneeId: actor.id,
      $or: [
        { internalDue: { $lt: endOfToday } },
        { statutoryDue: { $lt: endOfToday } },
      ],
    })
      .sort({ internalDue: 1 })
      .limit(20)
      .lean(),
    Engagement.find({
      ...open,
      assigneeId: actor.id,
      status: "Awaiting documents",
    })
      .sort({ internalDue: 1 })
      .limit(20)
      .lean(),
    Engagement.find({
      ...open,
      reviewerId: actor.id,
      status: { $in: ["Under review", "Filed / delivered"] },
    })
      .sort({ internalDue: 1 })
      .limit(20)
      .lean(),
  ]);

  const all = [...due, ...waiting, ...toReview];
  const clients = await Client.find({
    _id: { $in: all.map((e) => e.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  /**
   * The statutory dates falling in the next seven days, firm-wide within
   * this person's scope — the ledger line across the top of the day
   * (spec section 15). Only real statutory dates appear here: an internal
   * target is the firm's own promise, not the law's.
   */
  const weekAhead = await Engagement.find({
    ...(branchFilter(actor, "engagementsWork") ?? {}),
    status: { $nin: CLOSED_STATUSES },
    statutoryDue: {
      $ne: null,
      $lt: new Date(startOfISTDay(now).getTime() + 7 * 86_400_000),
    },
  })
    .select("statutoryDue templateSnapshot")
    .sort({ statutoryDue: 1 })
    .limit(500)
    .lean();

  const byDate = new Map();
  for (const engagement of weekAhead) {
    const key = formatISTDate(engagement.statutoryDue);
    const entry = byDate.get(key) ?? {
      date: key,
      services: new Set(),
      count: 0,
      overdue: daysUntil(engagement.statutoryDue) < 0,
    };
    entry.services.add(engagement.templateSnapshot?.code ?? "—");
    entry.count += 1;
    byDate.set(key, entry);
  }
  const statutoryWeek = [...byDate.values()].map((entry) => ({
    ...entry,
    services: [...entry.services],
  }));

  const columns = [
    {
      title: "Due today",
      empty: "Nothing due today.",
      rows: due,
    },
    {
      title: "Waiting on clients",
      empty: "No documents pending from clients.",
      rows: waiting,
    },
    {
      title: "Awaiting my review",
      empty: "Nothing waiting for your review.",
      rows: toReview,
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-28 font-semibold">Today</h1>
        <p className="num text-13 text-ink-muted">
          {formatISTDate(now)} · FY {financialYearLabel(now)}
        </p>
      </div>

      {/* The week's statutory dates: one ledger line across the top (spec 15). */}
      <section
        aria-label="Statutory dates this week"
        className="rounded-ledger border-rule bg-surface border px-4 py-3"
      >
        {statutoryWeek.length === 0 ? (
          <p className="text-13 text-ink-muted">
            No statutory dates fall in the next seven days.
          </p>
        ) : (
          <ul className="text-13 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            {statutoryWeek.map((entry) => (
              <li key={entry.date} className="flex items-baseline gap-2">
                <span className="num font-medium">{entry.date}</span>
                <span className={entry.overdue ? "text-redpen" : ""}>
                  {entry.services.join(", ")}
                </span>
                <Link
                  href={`/calendar?due=week`}
                  className="text-ink-muted underline underline-offset-4"
                >
                  {entry.count} {entry.count === 1 ? "job" : "jobs"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RoleDashboard actor={actor} now={now} />

      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((col) => (
          <section
            key={col.title}
            className="rounded-ledger border-rule bg-surface flex min-h-56 flex-col border"
          >
            <h2 className="border-rule text-13 text-ink-muted border-b px-4 py-2 font-medium tracking-wide uppercase">
              {col.title}
              {col.rows.length > 0 && (
                <span className="num text-ink-muted"> · {col.rows.length}</span>
              )}
            </h2>
            <div className="ledger-rule flex-1 px-4 py-3">
              {col.rows.length === 0 ? (
                <p className="text-14 text-ink-muted">{col.empty}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {col.rows.map((e) => {
                    const date = e.statutoryDue ?? e.internalDue;
                    return (
                      <li key={String(e._id)} className="flex flex-col gap-1">
                        <Link
                          href={`/engagements/${e._id}`}
                          className="text-14 font-medium underline underline-offset-4"
                        >
                          {clientName.get(String(e.clientId)) ?? "Client"}
                        </Link>
                        <span className="text-13 text-ink-muted">
                          {e.templateSnapshot?.name} ·{" "}
                          {e.periodLabel || e.period}
                        </span>
                        <span className="flex flex-wrap gap-2">
                          {date && (
                            <DueChip
                              label={e.statutoryDue ? "Statutory" : "Internal"}
                              date={formatISTDate(date)}
                              days={daysUntil(date)}
                            />
                          )}
                          <PriorityChip priority={e.priority} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
