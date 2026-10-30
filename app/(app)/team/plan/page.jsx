import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { branchFilter, can, scopeOf } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import Leave from "@/models/Leave";
import ServiceTemplate from "@/models/ServiceTemplate";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { planFor, weeksFrom } from "@/lib/team/plan";
import PlanBoard from "./PlanBoard";

export const metadata = { title: "The week · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The week, person by person, in two lanes (P3-16).
 *
 * Spec section 9 asks for a workload board of "open engagements and hours
 * due this week vs capacity". The lanes are the part worth building: a job
 * is in its preparer's week four working days before the statutory date and
 * in its reviewer's week two (P3-5), which are often different weeks — so a
 * board with one row per person shows a reviewer nothing until the work
 * lands on them, which is the day before it is due.
 */
export default async function PlanPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "team")) redirect("/issues");
  if (scopeOf(actor, "team") === "own") redirect("/me");

  const params = (await searchParams) ?? {};
  const weeks = weeksFrom(new Date(), 5);
  const offset = Number(params.week);
  const chosen =
    Number.isInteger(offset) && offset >= 0 && offset < weeks.length
      ? weeks[offset]
      : weeks[0];

  await connectDB();

  const peopleQuery = { active: true };
  if (branchFilter(actor, "team")) {
    peopleQuery.branchIds = { $in: actor.branchIds };
  }

  const [people, engagements] = await Promise.all([
    User.find(peopleQuery)
      .select("name role capacityHours")
      .sort({ role: 1, name: 1 })
      .limit(200)
      .lean(),
    Engagement.find({
      ...(branchFilter(actor, "engagementsWork") ?? {}),
      status: { $nin: CLOSED_STATUSES },
    })
      .select(
        "code status clientId assigneeId reviewerId periodLabel period milestones internalDue review templateSnapshot",
      )
      .limit(3000)
      .lean(),
  ]);

  /**
   * Leave that touches this week, plus the Monday itself for "who is
   * covering whom right now".
   */
  const leaves = await Leave.find({
    userId: { $in: people.map((row) => row._id) },
    from: { $lt: chosen.end },
    to: { $gte: chosen.start },
  }).lean();

  const plan = planFor({
    engagements,
    people,
    leaves,
    week: chosen,
    now: new Date(),
  });

  const clients = await Client.find({
    _id: {
      $in: [
        ...new Set(
          plan.rows.flatMap((row) =>
            [...row.prepare.jobs, ...row.review.jobs].map(
              (job) => job.clientId,
            ),
          ),
        ),
      ],
    },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((row) => [String(row._id), row.tradeName || row.legalName]),
  );

  const named = (job) => ({
    ...job,
    client: clientName.get(job.clientId) ?? "A client",
  });

  const personName = new Map(people.map((row) => [String(row._id), row.name]));

  /**
   * How much of the catalog has an effort estimate, so the board can say
   * why it is counting jobs rather than hours instead of just doing it.
   */
  const [services, estimated] = await Promise.all([
    ServiceTemplate.countDocuments({ active: true }),
    ServiceTemplate.countDocuments({
      active: true,
      effortHours: { $ne: null, $gt: 0 },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            The week
          </h1>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Two lanes for each person, because they are two different weeks:
            work is due to be prepared four working days before its statutory
            date and reviewed two. A reviewer&rsquo;s week fills up before the
            work reaches them.
          </p>
        </div>
        <Link href="/team" className="text-13 underline underline-offset-4">
          The team
        </Link>
      </div>

      {estimated < services && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          <strong>
            {services - estimated} of {services}
          </strong>{" "}
          services have no effort estimate, so lanes containing them are counted
          in jobs rather than hours. A part-total would read as the whole and
          say somebody is free when they are not. Set the hours on{" "}
          <Link
            href="/settings/services"
            className="underline underline-offset-4"
          >
            the service catalog
          </Link>
          .
        </p>
      )}

      <PlanBoard
        weeks={weeks.map((week, index) => ({
          index,
          label: week.label,
          current: week.label === chosen.label,
        }))}
        week={chosen.label}
        rows={plan.rows.map((row) => ({
          ...row,
          prepare: { ...row.prepare, jobs: row.prepare.jobs.map(named) },
          review: { ...row.review, jobs: row.review.jobs.map(named) },
          away: row.away.map((leave) => ({
            ...leave,
            cover: personName.get(leave.coverId) ?? "somebody",
          })),
          covering: row.covering.map((entry) => ({
            ...entry,
            name: personName.get(entry.userId) ?? "a colleague",
          })),
        }))}
        warnings={plan.warnings.map((warning) => ({
          ...warning,
          cover: personName.get(warning.away[0]?.coverId ?? "") ?? "somebody",
        }))}
        unscheduled={plan.unscheduled}
      />
    </div>
  );
}
