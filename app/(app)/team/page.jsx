import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import {
  branchFilter,
  can,
  scopeOf,
  ROLES,
  ROLE_LABELS,
} from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Branch from "@/models/Branch";
import Engagement from "@/models/Engagement";
import { formatISTDate } from "@/lib/dates";
import { loadForEach } from "@/lib/team/workload";
import NewPerson from "./NewPerson";

export const metadata = { title: "Team · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The team (spec section 9's team record, from the outside).
 *
 * A Partner sees the firm; a CA sees their own branches and can open a
 * record but change nothing on it (owner decision D2). An employee or an
 * intern has `team: view/own`, which means this list is not for them — their
 * own record is `/me`.
 */
export default async function TeamPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "team")) redirect("/me");

  // `team: view/own` is one record, and that record already has its own page
  if (scopeOf(actor, "team") === "own") redirect("/me");

  const params = (await searchParams) ?? {};
  const wantBranch = String(params.branch ?? "");
  const wantRole = String(params.role ?? "");
  const wantSenior = String(params.senior ?? "");
  const showInactive = params.inactive === "1";

  await connectDB();

  /** @type {Record<string, any>} */
  const query = {};
  const scope = branchFilter(actor, "team");
  if (scope) query.branchIds = { $in: actor.branchIds };
  if (wantBranch) query.branchIds = { $in: [wantBranch] };
  if (wantRole) query.role = wantRole;
  if (wantSenior) query.reportingTo = wantSenior;
  if (!showInactive) query.active = true;

  const [people, branches] = await Promise.all([
    User.find(query).sort({ role: 1, name: 1 }).limit(500).lean(),
    Branch.find(scope ? { _id: { $in: actor.branchIds } } : {})
      .select("code name")
      .sort({ code: 1 })
      .lean(),
  ]);

  const ids = people.map((p) => p._id);

  // one query for everybody's work, then the arithmetic in lib/team/workload
  const engagements = await Engagement.find({
    $or: [{ assigneeId: { $in: ids } }, { reviewerId: { $in: ids } }],
  })
    .select(
      "status statutoryDue internalDue assigneeId reviewerId reworkCount templateSnapshot.level",
    )
    .limit(10000)
    .lean();

  const load = loadForEach(engagements, ids.map(String));

  const seniors = await User.find({ role: { $in: ["ca", "partner"] } })
    .select("name")
    .sort({ name: 1 })
    .lean();
  const seniorName = new Map(seniors.map((s) => [String(s._id), s.name]));
  const branchCode = new Map(branches.map((b) => [String(b._id), b.code]));

  const mayAdmin = can(actor, "edit", "usersSettings");

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Team
          </h1>
          <p className="text-14 text-ink-muted">
            {people.length} {people.length === 1 ? "person" : "people"}
            {scope ? " in your branches" : " across the firm"}
            {showInactive ? ", including those who have left" : ""}
          </p>
        </div>
        <Link
          href="/team/export"
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          Export
        </Link>
      </header>

      {mayAdmin && (
        <NewPerson
          branches={branches.map((b) => ({
            id: String(b._id),
            code: b.code,
            name: b.name,
          }))}
          seniors={seniors.map((s) => ({
            id: String(s._id),
            name: s.name,
          }))}
        />
      )}

      {/* filters as a plain GET form, so they live in the URL */}
      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted">Office</span>
          <select
            name="branch"
            defaultValue={wantBranch}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          >
            <option value="">All</option>
            {branches.map((b) => (
              <option key={String(b._id)} value={String(b._id)}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted">Role</span>
          <select
            name="role"
            defaultValue={wantRole}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          >
            <option value="">All</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted">Reporting to</span>
          <select
            name="senior"
            defaultValue={wantSenior}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          >
            <option value="">Anyone</option>
            {seniors.map((s) => (
              <option key={String(s._id)} value={String(s._id)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-14 flex h-9 items-center gap-2">
          <input
            type="checkbox"
            name="inactive"
            value="1"
            defaultChecked={showInactive}
            className="accent-carbon"
          />
          Include people who have left
        </label>
        <button
          type="submit"
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3"
        >
          Apply
        </button>
      </form>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <caption className="sr-only">
            The firm&rsquo;s team, with what is on each desk
          </caption>
          <thead>
            <tr className="border-rule text-13 text-ink-muted border-b text-left">
              <th scope="col" className="px-3 py-2 font-normal">
                Name
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                Role
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                Offices
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                Reports to
              </th>
              <th scope="col" className="px-3 py-2 text-right font-normal">
                Open
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                A · B · C
              </th>
              <th scope="col" className="px-3 py-2 text-right font-normal">
                Overdue
              </th>
              <th scope="col" className="px-3 py-2 text-right font-normal">
                To review
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                2FA
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const figures = load.get(String(person._id));
              return (
                <tr
                  key={String(person._id)}
                  className="border-rule border-b last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/team/${person._id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {person.name}
                    </Link>
                    <span className="text-13 text-ink-muted block">
                      {person.email}
                      {person.active === false ? " · left the firm" : ""}
                    </span>
                  </td>
                  <td className="text-13 px-3 py-2">
                    {ROLE_LABELS[person.role] ?? person.role}
                  </td>
                  <td className="text-13 px-3 py-2 font-mono">
                    {(person.branchIds ?? [])
                      .map((id) => branchCode.get(String(id)) ?? "?")
                      .join(" ")}
                  </td>
                  <td className="text-13 px-3 py-2">
                    {person.reportingTo ? (
                      (seniorName.get(String(person.reportingTo)) ?? "—")
                    ) : person.role === "partner" ? (
                      "—"
                    ) : (
                      <span className="text-waiting">Not set</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {figures?.asAssignee ?? 0}
                  </td>
                  {/* three counts, so who carries the crucial work is visible */}
                  <td className="text-13 px-3 py-2 font-mono tabular-nums">
                    <span
                      className={
                        figures?.byTier?.A ? "text-brass-ink" : "text-ink-muted"
                      }
                    >
                      {figures?.byTier?.A ?? 0}
                    </span>
                    <span className="text-ink-muted">
                      {" · "}
                      {figures?.byTier?.B ?? 0} · {figures?.byTier?.C ?? 0}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono tabular-nums ${
                      figures?.overdue ? "text-redpen" : "text-ink-muted"
                    }`}
                  >
                    {figures?.overdue ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {figures?.awaitingMyReview ?? 0}
                  </td>
                  <td className="text-13 px-3 py-2">
                    {person.totpEnabledAt ? (
                      <span className="text-filed">On</span>
                    ) : (
                      <span className="text-waiting">Not yet</span>
                    )}
                    {person.lastLoginAt && (
                      <span className="text-ink-muted block">
                        {formatISTDate(person.lastLoginAt)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {people.length === 0 && (
              <tr>
                <td colSpan={9} className="text-14 text-ink-muted px-3 py-8">
                  Nobody matches those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-13 text-ink-muted">
        A/B/C tier counts per person arrive with the hierarchy work in the next
        step.
      </p>
    </div>
  );
}
