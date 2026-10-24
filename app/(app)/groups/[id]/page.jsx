import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import ClientGroup from "@/models/ClientGroup";
import Engagement from "@/models/Engagement";
import User from "@/models/User";
import { engagementQuery } from "@/lib/engagements/filter";
import { groupRollup } from "@/lib/groups/summary";
import { formatPaise } from "@/lib/money";
import { formatISTDate, daysUntil } from "@/lib/dates";
import { StatusChip } from "../../clients/page";
import { StatusChip as WorkChip, DueChip } from "../../engagements/chips";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  await connectDB();
  const group = await ClientGroup.findById(id).select("name").lean();
  return { title: `${group?.name ?? "Group"} · PHMG` };
}

/**
 * One group (P2-11): the businesses under one owner, their open work and what
 * they owe, read together.
 *
 * Every figure comes from `lib/groups/summary.js`, which scopes the
 * businesses, the work and the money separately — so an employee on one
 * business of a family sees that business and no more, and the totals add up
 * to what they can see rather than to the group.
 */
export default async function GroupPage({ params }) {
  const actor = await requireUser();
  if (!can(actor, "view", "clients")) redirect("/today");

  const { id } = await params;
  await connectDB();

  const group = await ClientGroup.findById(id).select("name notes").lean();
  if (!group) notFound();

  const seesMoney = can(actor, "view", "invoices");
  const [rollup] = await groupRollup(actor, [id]);
  const businesses = rollup?.businesses ?? [];

  const clientIds = businesses.map((b) => b.id);
  const [work, team] = await Promise.all([
    clientIds.length
      ? Engagement.find({
          ...engagementQuery(actor, {}),
          clientId: { $in: clientIds },
        })
          .sort({ statutoryDue: 1, internalDue: 1 })
          .limit(200)
          .lean()
      : [],
    User.find({ active: true }).select("name").lean(),
  ]);

  const personName = new Map(team.map((u) => [String(u._id), u.name]));
  const businessName = new Map(businesses.map((b) => [b.id, b.name]));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-3">
        <div>
          <Link
            href="/groups"
            className="text-13 text-ink-muted underline underline-offset-4"
          >
            Groups
          </Link>
          <h1 className="font-display text-28 font-semibold">{group.name}</h1>
          <p className="num text-13 text-ink-muted">
            {businesses.length}{" "}
            {businesses.length === 1 ? "business" : "businesses"}
          </p>
        </div>
        {group.notes && <p className="text-14 max-w-[70ch]">{group.notes}</p>}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Businesses" value={businesses.length} />
        <Figure label="Open work" value={rollup?.openWork ?? 0} />
        {seesMoney && (
          <Figure
            label="Outstanding"
            value={formatPaise(rollup?.outstandingPaise ?? 0)}
            note={
              rollup?.overduePaise
                ? `${formatPaise(rollup.overduePaise)} overdue`
                : null
            }
          />
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20 font-semibold">The businesses</h2>
        <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Business</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Open work</th>
                {seesMoney && (
                  <th className="px-3 py-2 text-right font-medium">
                    Outstanding
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => (
                <tr
                  key={business.id}
                  className="border-rule border-b last:border-0"
                >
                  <td className="num text-13 px-3 py-2">{business.code}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/clients/${business.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {business.name}
                    </Link>
                    {business.name !== business.legalName && (
                      <span className="text-12 text-ink-muted block">
                        {business.legalName}
                      </span>
                    )}
                  </td>
                  <td className="text-13 px-3 py-2">{business.entityType}</td>
                  <td className="px-3 py-2">
                    <StatusChip status={business.status} />
                  </td>
                  <td className="num px-3 py-2 text-right">
                    {business.openWork || "—"}
                  </td>
                  {seesMoney && (
                    <td className="num px-3 py-2 text-right">
                      {business.outstandingPaise
                        ? formatPaise(business.outstandingPaise)
                        : "—"}
                      {business.overduePaise > 0 && (
                        <span className="text-12 text-redpen block">
                          {formatPaise(business.overduePaise)} overdue
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {businesses.length === 0 && (
                <tr>
                  <td
                    colSpan={seesMoney ? 6 : 5}
                    className="text-ink-muted px-3 py-6 text-center"
                  >
                    Nothing in this group that you can see.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-20 font-semibold">
            Open work across the group
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/engagements?group=${id}`}
              className="rounded-ledger border-rule text-13 hover:bg-carbon-wash h-8 border px-3 leading-8"
            >
              Open in the engagement list
            </Link>
            {seesMoney && (
              <Link
                href={`/invoices/receivables?group=${id}`}
                className="rounded-ledger border-rule text-13 hover:bg-carbon-wash h-8 border px-3 leading-8"
              >
                What the group owes
              </Link>
            )}
          </div>
        </div>
        <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                <th className="px-3 py-2 font-medium">Business</th>
                <th className="px-3 py-2 font-medium">Work</th>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">With</th>
              </tr>
            </thead>
            <tbody>
              {work.map((e) => {
                const due = e.statutoryDue ?? e.internalDue;
                return (
                  <tr
                    key={String(e._id)}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="text-13 px-3 py-2">
                      {businessName.get(String(e.clientId)) ?? "Business"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/engagements/${e._id}`}
                        className="underline underline-offset-4"
                      >
                        {e.templateSnapshot?.name ?? "Work"}
                      </Link>
                    </td>
                    <td className="text-13 px-3 py-2">
                      {e.periodLabel || e.period}
                    </td>
                    <td className="px-3 py-2">
                      <WorkChip status={e.status} />
                    </td>
                    <td className="px-3 py-2">
                      {due ? (
                        <DueChip
                          label={e.statutoryDue ? "Statutory" : "Internal"}
                          date={formatISTDate(due)}
                          days={daysUntil(due)}
                        />
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="text-13 px-3 py-2">
                      {personName.get(String(e.assigneeId)) ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {work.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-ink-muted px-3 py-6 text-center"
                  >
                    No open work in this group.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Figure({ label, value, note = null }) {
  return (
    <div className="rounded-ledger border-rule bg-surface border p-3">
      <p className="num font-display text-20">{value}</p>
      <p className="text-12 text-ink-muted">{label}</p>
      {note && <p className="text-12 text-redpen">{note}</p>}
    </div>
  );
}
