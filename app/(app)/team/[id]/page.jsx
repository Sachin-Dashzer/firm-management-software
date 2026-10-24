import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, requireUser } from "@/auth";
import { can, scopeOf, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Branch from "@/models/Branch";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import ClientAccess from "@/models/ClientAccess";
import AuditLog from "@/models/AuditLog";
import ActivityFeed from "@/components/audit/ActivityFeed";
import FolderTabs from "@/components/clients/FolderTabs";
import { formatISTDate } from "@/lib/dates";
import TierBadge from "@/components/ledger/TierBadge";
import { SECTION_LABELS } from "@/lib/access/sections";
import { STATUSES, CLOSED_STATUSES } from "@/lib/engagements/status";
import { loadFor, groupByStatus, isOverdue } from "@/lib/team/workload";
import AdminActions from "./AdminActions";

export const dynamic = "force-dynamic";

/** The case file for a colleague, same folder-tab pattern as a client. */
const TABS = [
  { key: "profile", label: "Profile", needs: "always" },
  { key: "work", label: "Work", needs: "always" },
  { key: "reviews", label: "Reviews", needs: "always" },
  { key: "access", label: "Clients & access", needs: "clientAccess" },
  { key: "activity", label: "Activity", needs: "auditLog" },
  { key: "admin", label: "Admin", needs: "usersSettings" },
];

/** A colleague's name is not a secret inside the firm, but the record is. */
export async function generateMetadata({ params }) {
  const generic = { title: "Team · PHMG" };
  const actor = await currentUser();
  if (!actor) return generic;

  const { id } = await params;
  await connectDB();
  const person = await User.findById(id).select("name branchIds").lean();
  if (!person) return generic;

  const visible = (person.branchIds ?? []).some((branchId) =>
    can(actor, "view", "team", {
      branchId: String(branchId),
      userId: String(id),
    }),
  );
  return visible ? { title: `${person.name} · PHMG` } : generic;
}

export default async function TeamMemberPage({ params, searchParams }) {
  const actor = await requireUser();
  const { id } = await params;
  const tab = (await searchParams)?.tab ?? "profile";

  await connectDB();
  const person = await User.findById(id)
    .lean({ withDeleted: true })
    .select(
      "name email mobile role branchIds reportingTo capacityHours skills joiningDate isIntern articleship totpEnabledAt lastLoginAt active deletedAt",
    );
  if (!person) notFound();

  /**
   * A CA may open a colleague in their own branches; a Partner anyone. An
   * employee or an intern has `view/own`, so the only record they can open is
   * their own — and `/me` is a better page for that, so they are sent there.
   */
  const sharesABranch = (person.branchIds ?? []).some((branchId) =>
    can(actor, "view", "team", {
      branchId: String(branchId),
      userId: String(id),
    }),
  );
  if (!sharesABranch) {
    redirect(scopeOf(actor, "team") === "own" ? "/me" : "/team");
  }
  if (String(id) === actor.id && scopeOf(actor, "team") === "own") {
    redirect("/me");
  }

  const mayAdmin = can(actor, "edit", "usersSettings");
  const mayGrant = can(actor, "edit", "clientAccess", {
    branchId: String(person.branchIds?.[0] ?? ""),
  });
  const seeActivity = can(actor, "view", "auditLog", {
    branchId: String(person.branchIds?.[0] ?? ""),
  });

  const tabs = TABS.filter(({ needs }) => {
    if (needs === "always") return true;
    if (needs === "usersSettings") return mayAdmin;
    if (needs === "auditLog") return seeActivity;
    if (needs === "clientAccess") return mayGrant || seeActivity;
    return false;
  });
  const active = tabs.some((t) => t.key === tab) ? tab : "profile";

  const [branches, senior, engagements] = await Promise.all([
    Branch.find({ _id: { $in: person.branchIds ?? [] } })
      .select("code name")
      .sort({ code: 1 })
      .lean(),
    person.reportingTo
      ? User.findById(person.reportingTo)
          .select("name role email mobile")
          .lean()
      : null,
    Engagement.find({
      $or: [{ assigneeId: id }, { reviewerId: id }],
    })
      .select(
        "code status statutoryDue internalDue assigneeId reviewerId reworkCount clientId templateSnapshot periodLabel period",
      )
      .sort({ statutoryDue: 1, internalDue: 1 })
      .limit(1000)
      .lean(),
  ]);

  const load = loadFor(engagements, id);
  const clients = await Client.find({
    _id: { $in: [...new Set(engagements.map((e) => String(e.clientId)))] },
  })
    .select("legalName tradeName code")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-13 text-ink-muted">
              {ROLE_LABELS[person.role] ?? person.role}
            </p>
            <h1 className="font-display text-28 font-semibold">
              {person.name}
            </h1>
            <p className="text-14 text-ink-muted">
              {person.email}
              {person.deletedAt
                ? ` · left the firm ${formatISTDate(person.deletedAt)}`
                : person.active === false
                  ? " · account deactivated"
                  : ""}
            </p>
          </div>
          <Link href="/team" className="text-13 underline underline-offset-4">
            Back to the team
          </Link>
        </div>

        <dl className="text-13 flex flex-wrap gap-x-6 gap-y-2">
          <Chip
            label="Offices"
            value={branches.map((b) => b.code).join(" · ")}
            mono
          />
          <Chip label="Reports to" value={senior?.name ?? "Not set"} />
          <Chip label="Open work" value={String(load.asAssignee)} />
          {/* by tier, so "busy" and "carrying the crucial work" read apart */}
          <Chip
            label="A · B · C"
            value={`${load.byTier.A} · ${load.byTier.B} · ${load.byTier.C}`}
            mono
          />
          {load.overdue > 0 && (
            <Chip label="Overdue" value={String(load.overdue)} tone="late" />
          )}
          {load.asReviewer > 0 && (
            <Chip label="Reviews" value={String(load.asReviewer)} />
          )}
        </dl>
      </header>

      <FolderTabs
        tabs={tabs}
        active={active}
        basePath={`/team/${id}`}
        label="Team member sections"
      />

      {active === "profile" && (
        <Profile person={person} branches={branches} senior={senior} id={id} />
      )}

      {active === "work" && (
        <Work engagements={engagements} id={id} clientName={clientName} />
      )}

      {active === "reviews" && (
        <Reviews
          engagements={engagements}
          id={id}
          person={person}
          load={load}
          clientName={clientName}
        />
      )}

      {active === "access" && (
        <Access id={id} person={person} engagements={engagements} />
      )}

      {active === "activity" && <Activity id={id} />}

      {active === "admin" && mayAdmin && (
        <AdminActions
          userId={String(id)}
          name={person.name}
          role={person.role}
          active={person.active !== false}
          deleted={Boolean(person.deletedAt)}
          twoFactorOn={Boolean(person.totpEnabledAt)}
          openWork={load.asAssignee + load.asReviewer}
          branches={await branchOptions(actor)}
          seniors={await seniorOptions()}
          current={{
            branchIds: (person.branchIds ?? []).map(String),
            reportingTo: String(person.reportingTo ?? ""),
            capacityHours: person.capacityHours ?? 8,
            skills: (person.skills ?? []).join(", "),
          }}
        />
      )}
    </div>
  );
}

async function branchOptions(actor) {
  const where =
    scopeOf(actor, "team") === "all" ? {} : { _id: { $in: actor.branchIds } };
  const rows = await Branch.find(where)
    .select("code name")
    .sort({ code: 1 })
    .lean();
  return rows.map((b) => ({ id: String(b._id), code: b.code, name: b.name }));
}

async function seniorOptions() {
  const rows = await User.find({
    role: { $in: ["ca", "partner"] },
    active: true,
  })
    .select("name role")
    .sort({ name: 1 })
    .lean();
  return rows.map((u) => ({
    id: String(u._id),
    name: u.name,
    role: u.role,
  }));
}

// --- tabs ------------------------------------------------------------------

async function Profile({ person, branches, senior, id }) {
  const principal = person.articleship?.principalId
    ? await User.findById(person.articleship.principalId).select("name").lean()
    : null;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Panel title="Details" className="lg:col-span-2">
        <Row label="Email" value={person.email} mono />
        <Row label="Mobile" value={person.mobile || "—"} mono />
        <Row label="Role" value={ROLE_LABELS[person.role] ?? person.role} />
        <Row
          label="Offices"
          value={branches.map((b) => `${b.code} — ${b.name}`).join(", ")}
        />
        <Row label="Joined" value={fmt(person.joiningDate)} />
        <Row
          label="Capacity"
          value={`${person.capacityHours ?? 8} hours a day`}
        />
        <Row
          label="Can handle"
          value={(person.skills ?? []).join(", ") || "—"}
        />
      </Panel>

      <Panel title="Reporting CA">
        {senior ? (
          <>
            <Row label="Name" value={senior.name} />
            <Row label="Role" value={ROLE_LABELS[senior.role]} />
            <Row label="Email" value={senior.email} mono />
            <Row label="Mobile" value={senior.mobile || "—"} mono />
          </>
        ) : (
          <p className="text-14 text-waiting">
            Not set. Their &ldquo;My senior CA&rdquo; card is empty, and nothing
            routes to a supervisor.
          </p>
        )}
      </Panel>

      {person.isIntern && person.articleship && (
        <Panel title="Articleship" className="lg:col-span-3">
          <Row label="Principal" value={principal?.name ?? "—"} />
          <Row
            label="ICAI registration no."
            value={person.articleship.icaiRegNo || "—"}
            mono
          />
          <Row label="Started" value={fmt(person.articleship.start)} />
          <Row
            label="Expected to end"
            value={fmt(person.articleship.expectedEnd)}
          />
          <Row
            label="Leave taken"
            value={`${person.articleship.leaveTaken ?? 0} of ${
              person.articleship.leaveAllowed ?? 156
            } days`}
          />
          <p className="text-13 text-ink-muted border-rule mt-3 border-t pt-3">
            The ICAI member record, CPE hours and the exposure log arrive with
            the ICAI screen.
          </p>
        </Panel>
      )}

      <p className="text-13 text-ink-muted lg:col-span-3">
        Changing any of this is on the Admin tab, and only a partner has one.
      </p>
    </div>
  );
}

function Work({ engagements, id, clientName }) {
  const mine = engagements.filter((e) => String(e.assigneeId ?? "") === id);
  const groups = groupByStatus(
    mine.filter((e) => !CLOSED_STATUSES.includes(e.status)),
    STATUSES,
  );
  const closed = mine.filter((e) => CLOSED_STATUSES.includes(e.status));

  return (
    <div className="flex flex-col gap-6">
      {groups.length === 0 && (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
          Nothing open is assigned to them.
        </p>
      )}

      {groups.map(([status, rows]) => (
        <section key={status} className="flex flex-col gap-2">
          <h2 className="font-display text-20">
            {status}{" "}
            <span className="text-14 text-ink-muted font-sans">
              {rows.length}
            </span>
          </h2>
          <EngagementTable rows={rows} clientName={clientName} />
        </section>
      ))}

      {closed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-20">
            Closed{" "}
            <span className="text-14 text-ink-muted font-sans">
              {closed.length}
            </span>
          </h2>
          <EngagementTable rows={closed.slice(0, 50)} clientName={clientName} />
        </section>
      )}
    </div>
  );
}

function Reviews({ engagements, id, person, load, clientName }) {
  const theirs = engagements.filter((e) => String(e.reviewerId ?? "") === id);
  const waiting = theirs.filter((e) => e.status === "Under review");
  const reworked = engagements.filter(
    (e) => String(e.assigneeId ?? "") === id && (e.reworkCount ?? 0) > 0,
  );

  const reviews = ["ca", "partner"].includes(person.role);

  return (
    <div className="flex flex-col gap-6">
      {reviews && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-20">Waiting for their sign-off</h2>
          {waiting.length === 0 ? (
            <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
              Their review queue is empty.
            </p>
          ) : (
            <EngagementTable rows={waiting} clientName={clientName} />
          )}
          <p className="text-13 text-ink-muted">
            They review {load.asReviewer} open{" "}
            {load.asReviewer === 1 ? "engagement" : "engagements"} in total.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20">Work that came back</h2>
        <p className="text-14">
          <span className="font-display text-28 tabular-nums">
            {load.reworked} of {load.total}
          </span>{" "}
          <span className="text-ink-muted">
            engagements have been sent back for rework at least once
            {load.rework > load.reworked
              ? `, ${load.rework} times between them`
              : ""}
            .
          </span>
        </p>
        <p className="text-13 text-ink-muted max-w-[62ch]">
          A count beside a count, never a percentage: three out of twelve and
          thirty out of a hundred and twenty are different conversations.
        </p>
        {reworked.length > 0 && (
          <EngagementTable rows={reworked} clientName={clientName} showRework />
        )}
      </section>
    </div>
  );
}

async function Access({ id, person, engagements }) {
  const grants = await ClientAccess.find({ userId: id })
    .sort({ active: -1, createdAt: -1 })
    .lean();

  const assignedIds = [
    ...new Set(
      engagements
        .filter((e) => !CLOSED_STATUSES.includes(e.status))
        .map((e) => String(e.clientId)),
    ),
  ];

  const clients = await Client.find({
    _id: {
      $in: [
        ...new Set([...assignedIds, ...grants.map((g) => String(g.clientId))]),
      ],
    },
  })
    .select("legalName tradeName code")
    .lean();
  const name = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20">Through the work on their desk</h2>
        <p className="text-13 text-ink-muted max-w-[62ch]">
          Being assignee or reviewer on open work opens that client&rsquo;s
          profile, its engagements and its documents, and nothing else. It needs
          no grant and it lapses when the work closes.
        </p>
        {assignedIds.length === 0 ? (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
            No open work, so no clients this way.
          </p>
        ) : (
          <ul className="rounded-ledger border-rule bg-surface divide-rule divide-y border">
            {assignedIds.map((clientId) => (
              <li key={clientId} className="px-3 py-2">
                <Link
                  href={`/clients/${clientId}`}
                  className="text-14 underline underline-offset-4"
                >
                  {name.get(clientId) ?? "A client"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20">Grants they hold</h2>
        {grants.length === 0 ? (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
            None. Grants are given from the client&rsquo;s own Team &amp; access
            tab, where the person deciding can see what they are opening.
          </p>
        ) : (
          <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <caption className="sr-only">
                Client access grants held by {person.name}
              </caption>
              <thead>
                <tr className="border-rule text-13 text-ink-muted border-b text-left">
                  <th scope="col" className="px-3 py-2 font-normal">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Sections
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Until
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => {
                  const lapsed =
                    grant.expiresAt && new Date(grant.expiresAt) <= now;
                  return (
                    <tr
                      key={String(grant._id)}
                      className="border-rule border-b align-top last:border-0"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/clients/${grant.clientId}?tab=access`}
                          className="underline underline-offset-4"
                        >
                          {name.get(String(grant.clientId)) ?? "A client"}
                        </Link>
                      </td>
                      <td className="text-13 px-3 py-2">
                        {(grant.sections ?? [])
                          .map((s) => SECTION_LABELS[s] ?? s)
                          .join(", ")}
                      </td>
                      <td className="text-13 px-3 py-2 font-mono">
                        {!grant.active ? (
                          <span className="text-ink-muted">revoked</span>
                        ) : lapsed ? (
                          <span className="text-redpen">
                            lapsed {fmt(grant.expiresAt)}
                          </span>
                        ) : (
                          fmt(grant.expiresAt)
                        )}
                      </td>
                      <td className="text-13 px-3 py-2">{grant.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

async function Activity({ id }) {
  const entries = await AuditLog.find({ userId: String(id) })
    .sort({ ts: -1 })
    .limit(100)
    .lean();

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-display text-20">What they have done</h2>
      <p className="text-13 text-ink-muted">
        The last {entries.length} entries from the portal log, newest first.
      </p>
      <ActivityFeed
        entries={entries}
        emptyMessage="Nothing of theirs has been logged yet."
      />
    </div>
  );
}

// --- small pieces ----------------------------------------------------------

function EngagementTable({ rows, clientName, showRework = false }) {
  const now = new Date();
  return (
    <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
      <table className="text-14 w-full">
        <thead>
          <tr className="border-rule text-13 text-ink-muted border-b text-left">
            <th scope="col" className="px-3 py-2 font-normal">
              Work
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Client
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Tier
            </th>
            <th scope="col" className="px-3 py-2 font-normal">
              Due
            </th>
            {showRework && (
              <th scope="col" className="px-3 py-2 text-right font-normal">
                Returned
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr
              key={String(e._id)}
              className="border-rule border-b last:border-0"
            >
              <td className="px-3 py-2">
                <Link
                  href={`/engagements/${e._id}`}
                  className="underline underline-offset-4"
                >
                  {e.templateSnapshot?.name ?? "Work"}
                </Link>
                <span className="text-13 text-ink-muted block font-mono">
                  {e.code}
                </span>
              </td>
              <td className="text-13 px-3 py-2">
                {clientName.get(String(e.clientId)) ?? "—"}
              </td>
              <td className="text-13 px-3 py-2">
                <TierBadge level={e.templateSnapshot?.level} />
              </td>
              <td
                className={`text-13 px-3 py-2 font-mono ${
                  isOverdue(e, now) ? "text-redpen" : ""
                }`}
              >
                {fmt(e.statutoryDue ?? e.internalDue)}
              </td>
              {showRework && (
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {e.reworkCount ?? 0}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmt(date) {
  return date ? formatISTDate(new Date(date)) : "—";
}

function Panel({ title, className = "", children }) {
  return (
    <section
      className={`rounded-ledger border-rule bg-surface border p-4 ${className}`}
    >
      <h2 className="font-display text-20 mb-3">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="border-rule flex gap-3 border-b py-1.5 last:border-0">
      <dt className="text-13 text-ink-muted w-44 shrink-0">{label}</dt>
      <dd className={`text-14 min-w-0 break-words ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Chip({ label, value, mono = false, tone }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd
        className={`${mono ? "font-mono" : ""} ${
          tone === "late" ? "text-redpen font-medium" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
