import Link from "next/link";
import { requireUser } from "@/auth";
import { branchFilter, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import {
  formatISTDate,
  istInputDate,
  financialYearLabel,
  daysUntil,
  startOfISTDay,
} from "@/lib/dates";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { DueChip, PriorityChip } from "../engagements/chips";
import { hasRoleDashboard } from "@/components/dashboard/RoleDashboard";
import TierBadge from "@/components/ledger/TierBadge";
import Todo from "@/models/Todo";
import { bucketOf } from "@/lib/todos/list";
import TodoLines from "../todos/TodoLines";

export const metadata = { title: "My tasks · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Everything on your own desk (spec sections 10 and 15).
 *
 * My work in three columns — due, waiting on a client, waiting for my
 * review — is every role's own page, because every role has their own work.
 * The dashboard a job needs (a partner's overview, a CA's review queue, an
 * accounts billing board) moved to `/dashboard` in P3-22b: the prototype's
 * menu names them as two screens, and here they were two halves of one
 * scroll. An employee and an intern have no second dashboard — their own
 * work *is* the dashboard spec section 10 describes for them — so for them
 * no link to it is drawn.
 */
export default async function MyDayPage() {
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

  /**
   * My own to-dos that are late or due today (P3-22c).
   *
   * On this page rather than only on `/todos`, because a to-do list nobody
   * passes daily is a list nobody keeps — and ticking one off from here is
   * the same action, through the same component, so the two screens cannot
   * disagree about what finished means.
   */
  const todos = await Todo.find({
    ownerId: actor.id,
    done: false,
    dueDate: { $ne: null, $lt: endOfToday },
  })
    .sort({ dueDate: 1 })
    .limit(20)
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

  const seesDashboard =
    hasRoleDashboard(actor) && can(actor, "view", "dashboards");

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-24 font-bold tracking-tight">
          My tasks
        </h1>
        <p className="num text-13 text-ink-muted">
          {formatISTDate(now)} · FY {financialYearLabel(now)}
          {seesDashboard && (
            <>
              {" · "}
              <Link href="/dashboard" className="underline underline-offset-4">
                Firm dashboard
              </Link>
            </>
          )}
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
                  href={`/calendar?view=calendar&due=week`}
                  className="text-ink-muted underline underline-offset-4"
                >
                  {entry.count} {entry.count === 1 ? "job" : "jobs"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {todos.length > 0 && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border px-4 py-3">
          <h2 className="text-13 text-ink-muted font-medium">
            My to-dos, late or due today
            <span className="num"> · {todos.length}</span>
            {" · "}
            <Link
              href="/todos"
              className="text-ink-muted font-normal normal-case underline underline-offset-4"
            >
              the whole list
            </Link>
          </h2>
          <TodoLines
            rows={todos.map((todo) => ({
              id: String(todo._id),
              title: todo.title,
              note: todo.note ?? "",
              ownerId: String(todo.ownerId),
              ownerName: "",
              clientId: "",
              client: "",
              due: formatISTDate(todo.dueDate),
              dueInput: istInputDate(todo.dueDate),
              late: bucketOf(todo, now) === "overdue",
              done: false,
              doneAt: "",
              doneByName: "",
              mayChange: true,
            }))}
          />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((col) => (
          <section
            key={col.title}
            className="rounded-ledger border-rule bg-surface flex min-h-56 flex-col border"
          >
            <h2 className="border-rule text-13 text-ink-muted border-b px-4 py-2 font-medium">
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
                        <span className="text-13 text-ink-muted flex items-center gap-1.5">
                          <TierBadge level={e.templateSnapshot?.level} />
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
