import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, scopeOf, ROLES, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Branch from "@/models/Branch";
import Engagement from "@/models/Engagement";
import { formatISTDate } from "@/lib/dates";
import { loadForEach } from "@/lib/team/workload";
import { teamQuery } from "@/lib/team/filters";
import PageHead from "@/components/ui/PageHead";
import Segmented from "@/components/ui/Segmented";
import Chip from "@/components/ui/Chip";
import NewPerson from "./NewPerson";
import ActiveToggle from "./ActiveToggle";

export const metadata = { title: "Team · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The team (spec section 9's team record, from the outside).
 *
 * A Partner sees the firm; a CA sees their own branches and can open a
 * record but change nothing on it (owner decision D2). An employee or an
 * intern has `team: view/own`, which means this list is not for them — their
 * own record is `/me`.
 *
 * Every filter decision is in `lib/team/filters.js`, which the export route
 * asks the same question, so the spreadsheet cannot be wider than the screen
 * that produced it.
 */
export default async function TeamPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "team")) redirect("/me");

  // `team: view/own` is one record, and that record already has its own page
  if (scopeOf(actor, "team") === "own") redirect("/me");

  const params = (await searchParams) ?? {};
  const { query, withDeleted, chosen, allowed, dropped } = teamQuery(
    actor,
    params,
  );

  await connectDB();

  const [people, branches] = await Promise.all([
    User.find(query)
      .setOptions({ withDeleted })
      .sort({ active: -1, role: 1, name: 1 })
      .limit(500)
      .lean(),
    // every office this person may see, whichever one is filtered to
    Branch.find(allowed ? { _id: { $in: allowed } } : {})
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

  /**
   * How many people each status would show, under the other three filters.
   * The badge is the reason somebody thinks to look at it at all — "nobody
   * matches those filters" does not tell you that two people are switched
   * off.
   */
  const withoutStatus = { ...query };
  delete withoutStatus.active;
  const [activeCount, inactiveCount] = await Promise.all([
    User.countDocuments({ ...withoutStatus, active: true }),
    User.countDocuments({ ...withoutStatus, active: false }).setOptions({
      withDeleted: true,
    }),
  ]);

  const seniors = await User.find({ role: { $in: ["ca", "partner"] } })
    .select("name active")
    .sort({ name: 1 })
    .lean();
  const seniorName = new Map(seniors.map((s) => [String(s._id), s.name]));
  const branchCode = new Map(branches.map((b) => [String(b._id), b.code]));

  const mayAdmin = can(actor, "edit", "usersSettings");
  const filtered = Boolean(chosen.branch || chosen.role || chosen.senior);

  /** The same filters, carried to another status or to the spreadsheet. */
  const withStatus = (status) => {
    const next = new URLSearchParams();
    if (chosen.branch) next.set("branch", chosen.branch);
    if (chosen.role) next.set("role", chosen.role);
    if (chosen.senior) next.set("senior", chosen.senior);
    if (status !== "active") next.set("status", status);
    const qs = next.toString();
    return qs ? `?${qs}` : "";
  };

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-4 md:p-6">
      <PageHead
        title="Team"
        sub={
          chosen.status === "inactive"
            ? "People whose accounts are switched off. Their work and their history stay exactly where they are."
            : scopeOf(actor, "team") === "all"
              ? "Everyone at the firm, and what is on each desk."
              : "Your offices, and what is on each desk."
        }
      >
        <Link
          href={`/team/export${withStatus(chosen.status)}`}
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          Export to Excel
        </Link>
      </PageHead>

      {dropped && (
        <p
          role="status"
          className="rounded-ledger border-waiting/40 bg-waiting-soft text-13 text-waiting shrink-0 border px-3 py-2"
        >
          That office is not one of yours, so the list is showing your own.
        </p>
      )}

      {mayAdmin && (
        <div className="shrink-0">
          <NewPerson
            branches={branches.map((b) => ({
              id: String(b._id),
              code: b.code,
              name: b.name,
            }))}
            seniors={seniors
              .filter((s) => s.active !== false)
              .map((s) => ({ id: String(s._id), name: s.name }))}
          />
        </div>
      )}

      {/* filters as a plain GET form, so they live in the URL and a filtered
          list can be sent to somebody as a link */}
      <form
        method="get"
        className="rounded-ledger border-rule bg-surface grid shrink-0 gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {/* the status choice travels with the form as well as with the
            pills above the table, or submitting would reset it */}
        <input type="hidden" name="status" value={chosen.status} />
        <Filter
          label="Office"
          name="branch"
          value={chosen.branch}
          empty="Every office"
          options={branches.map((b) => [
            String(b._id),
            `${b.code} — ${b.name}`,
          ])}
        />
        <Filter
          label="Role"
          name="role"
          value={chosen.role}
          empty="Every role"
          options={ROLES.map((role) => [role, ROLE_LABELS[role]])}
        />
        <Filter
          label="Reporting to"
          name="senior"
          value={chosen.senior}
          empty="Anyone"
          options={seniors.map((s) => [
            String(s._id),
            s.active === false ? `${s.name} (left)` : s.name,
          ])}
        />
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-control border-rule bg-sunk text-14 text-ink h-9 border px-3 font-medium"
          >
            Filter
          </button>
          {filtered && (
            <Link
              href={`/team${chosen.status === "active" ? "" : `?status=${chosen.status}`}`}
              className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Which accounts to show"
          value={chosen.status}
          items={[
            {
              key: "active",
              label: "Working here",
              href: `/team${withStatus("active")}`,
              badge: { value: activeCount },
            },
            {
              key: "inactive",
              label: "Switched off",
              href: `/team${withStatus("inactive")}`,
              badge: { value: inactiveCount },
            },
            {
              key: "all",
              label: "Everyone",
              href: `/team${withStatus("all")}`,
              badge: { value: activeCount + inactiveCount },
            },
          ]}
        />
        <p className="num text-13 text-ink-muted">
          {people.length} {people.length === 1 ? "person" : "people"} shown
        </p>
      </div>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <caption className="sr-only">
            The firm&rsquo;s team, with what is on each desk
          </caption>
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left">
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Offices</Th>
              <Th>Joined</Th>
              <Th>Reports to</Th>
              <Th right>Open</Th>
              <Th className="hidden lg:table-cell">A · B · C</Th>
              <Th right>Overdue</Th>
              <Th right>To review</Th>
              <Th className="hidden lg:table-cell">2FA</Th>
              {mayAdmin && <Th right>Account</Th>}
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const figures = load.get(String(person._id));
              const off = person.active === false;
              return (
                <tr
                  key={String(person._id)}
                  className="border-rule hover:bg-carbon-wash border-b last:border-0"
                >
                  <Td>
                    <div className="flex items-center gap-2.5">
                      {/* the same monogram as the left rail's, at row size */}
                      <span
                        aria-hidden="true"
                        className={`rounded-ledger text-11 grid size-8 shrink-0 place-items-center font-bold ${
                          off
                            ? "bg-sunk text-faint"
                            : "bg-carbon-soft text-carbon"
                        }`}
                      >
                        {initials(person.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link
                            href={`/team/${person._id}`}
                            className={`font-medium underline-offset-4 hover:underline ${
                              off ? "text-ink-muted" : "text-carbon"
                            }`}
                          >
                            {person.name}
                          </Link>
                          {/* the one mark on the row: a dimmed name is not a
                              statement, and a CA reading the list has no
                              Account column to read it from */}
                          {off && (
                            <Chip tone="neutral">
                              {person.deletedAt ? "Offboarded" : "Switched off"}
                            </Chip>
                          )}
                        </span>
                        <span className="text-13 text-ink-muted block truncate">
                          {person.email}
                        </span>
                      </span>
                    </div>
                  </Td>
                  <Td className="text-13">
                    {ROLE_LABELS[person.role] ?? person.role}
                  </Td>
                  <Td className="num text-13">
                    {(person.branchIds ?? [])
                      .map((id) => branchCode.get(String(id)) ?? "?")
                      .join(" ")}
                  </Td>
                  <Td className="num text-13">
                    {person.joiningDate ? (
                      <>
                        {formatISTDate(person.joiningDate)}
                        <span className="text-12 text-faint block">
                          {tenure(person.joiningDate)}
                        </span>
                      </>
                    ) : (
                      <span className="text-faint">Not recorded</span>
                    )}
                  </Td>
                  <Td className="text-13">
                    {person.reportingTo ? (
                      (seniorName.get(String(person.reportingTo)) ?? "—")
                    ) : person.role === "partner" ? (
                      "—"
                    ) : (
                      <span className="text-waiting">Not set</span>
                    )}
                  </Td>
                  <Td right className="num">
                    {figures?.asAssignee ?? 0}
                  </Td>
                  {/* three counts, so who carries the crucial work is visible */}
                  <Td className="num text-13 hidden lg:table-cell">
                    <span
                      className={
                        figures?.byTier?.A ? "text-carbon-ink" : "text-faint"
                      }
                    >
                      {figures?.byTier?.A ?? 0}
                    </span>
                    <span className="text-faint">
                      {" · "}
                      {figures?.byTier?.B ?? 0} · {figures?.byTier?.C ?? 0}
                    </span>
                  </Td>
                  <Td
                    right
                    className={`num ${figures?.overdue ? "text-redpen font-medium" : "text-faint"}`}
                  >
                    {figures?.overdue ?? 0}
                  </Td>
                  <Td right className="num">
                    {figures?.awaitingMyReview ?? 0}
                  </Td>
                  <Td className="text-13 hidden lg:table-cell">
                    {person.totpEnabledAt ? (
                      <span className="text-filed">On</span>
                    ) : (
                      <span className="text-waiting">Not yet</span>
                    )}
                    {person.lastLoginAt && (
                      <span className="num text-12 text-faint block">
                        {formatISTDate(person.lastLoginAt)}
                      </span>
                    )}
                  </Td>
                  {mayAdmin && (
                    <Td right>
                      {person.deletedAt ? (
                        <span className="text-13 text-faint">—</span>
                      ) : String(person._id) === actor.id ? (
                        <span className="text-13 text-faint">You</span>
                      ) : (
                        <ActiveToggle
                          userId={String(person._id)}
                          name={person.name}
                          active={!off}
                        />
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
            {people.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="text-14 text-ink-muted px-3 py-10 text-center"
                >
                  {chosen.status === "inactive"
                    ? "Nobody’s account is switched off."
                    : filtered
                      ? "Nobody matches those filters."
                      : "Nobody here yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * First name and last, the way the left rail does it — the same person has
 * to read the same in both places, or the monogram stops being a monogram.
 */
function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ""))
    .toUpperCase()
    .slice(0, 2);
}

/**
 * How long they have been here, under the date.
 *
 * Whole years and months, because "6 yrs 4 mo" is the figure somebody
 * actually wants off a team list and working it out from 17-06-2019 in your
 * head is the reason they were about to open a calculator.
 */
function tenure(from, now = new Date()) {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return "";
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return "Starts soon";
  if (months < 1) return "This month";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} mo`;
  return rest === 0
    ? `${years} yr${years > 1 ? "s" : ""}`
    : `${years} yr ${rest} mo`;
}

function Filter({ label, name, value, options, empty }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
      >
        <option value="">{empty}</option>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({ children, right = false, className = "" }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 font-medium ${right ? "text-right" : ""} ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, right = false, className = "" }) {
  return (
    <td
      className={`px-3 py-2 align-top ${right ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
