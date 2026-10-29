import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { groupRollup } from "@/lib/groups/summary";
import { formatPaise } from "@/lib/money";

export const metadata = { title: "Groups · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The groups list (P2-11): one line per owner — a person or a family — with
 * the businesses underneath them read together.
 *
 * ponytail: the whole firm's grouped clients are rolled up in memory and the
 * name search filters the result, rather than an aggregation and a text
 * index. Groups are counted in dozens where clients are counted in
 * thousands. If this ever slows down, the rollup in `lib/groups/summary.js`
 * is the one place to turn into a `$lookup` pipeline.
 */
export default async function GroupsPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "clients")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const search = String(params.q ?? "").trim();
  const seesMoney = can(actor, "view", "invoices");

  const all = await groupRollup(actor);
  const groups = search
    ? all.filter(
        (group) =>
          group.name.toLowerCase().includes(search.toLowerCase()) ||
          group.businesses.some((business) =>
            business.name.toLowerCase().includes(search.toLowerCase()),
          ),
      )
    : all;

  const businesses = groups.reduce((n, g) => n + g.businesses.length, 0);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Groups
          </h1>
          <p className="num text-13 text-ink-muted">
            {groups.length} {groups.length === 1 ? "group" : "groups"} ·{" "}
            {businesses} {businesses === 1 ? "business" : "businesses"}
            {search ? ` matching “${search}”` : ""}
          </p>
        </div>
        <Link
          href="/clients"
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          All clients
        </Link>
      </div>

      <p className="text-14 text-ink-muted max-w-[70ch]">
        A group is one owner. Each business under it is a client record of its
        own, with its own PAN, GSTINs, fees and invoices — so work is assigned
        and billed per business, and read together here.
      </p>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[16rem] flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Group or business name
          </span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Sharma, Agarwal Textiles…"
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-control border-rule bg-sunk text-14 text-ink h-9 border px-3 font-medium"
        >
          Search
        </button>
        {search && (
          <Link
            href="/groups"
            className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left font-normal">
              <th className="px-3 py-2 font-medium">Group</th>
              <th className="px-3 py-2 font-medium">Businesses</th>
              <th className="px-3 py-2 text-right font-medium">Open work</th>
              {seesMoney && (
                <th className="px-3 py-2 text-right font-medium">
                  Outstanding
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2">
                  <Link
                    href={`/groups/${group.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {group.name}
                  </Link>
                </td>
                <td className="text-13 text-ink-muted px-3 py-2">
                  {group.businesses.map((b) => b.name).join(" · ")}
                </td>
                <td className="num px-3 py-2 text-right">
                  {group.openWork || "—"}
                </td>
                {seesMoney && (
                  <td className="num px-3 py-2 text-right">
                    {group.outstandingPaise
                      ? formatPaise(group.outstandingPaise)
                      : "—"}
                    {group.overduePaise > 0 && (
                      <span className="text-12 text-redpen block">
                        {formatPaise(group.overduePaise)} overdue
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td
                  colSpan={seesMoney ? 4 : 3}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  {search
                    ? "No group matches that."
                    : "No client is in a group yet. Set “Group” on a client to put their businesses together."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
