import Link from "next/link";
import { requireUser } from "@/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Branch from "@/models/Branch";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import ClientAccess from "@/models/ClientAccess";
import { formatISTDate } from "@/lib/dates";
import TierBadge from "@/components/ledger/TierBadge";
import { SECTION_LABELS } from "@/lib/access/sections";
import { loadFor, isOverdue } from "@/lib/team/workload";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import Security from "./Security";

export const metadata = { title: "Me · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Your own page (spec section 9's team record, from the inside).
 *
 * Everybody has one, whatever their role — which is the point. An employee
 * or an intern has nowhere else in the app that answers "who is my senior",
 * "what have I been given access to" and "how do I change my password", and
 * until now the app answered none of the three.
 */
export default async function MePage() {
  const actor = await requireUser();

  await connectDB();
  const me = await User.findById(actor.id)
    .select(
      "name email mobile role branchIds reportingTo capacityHours skills joiningDate isIntern articleship totpEnabledAt lastLoginAt",
    )
    .lean();

  const [branches, senior, engagements, grants] = await Promise.all([
    Branch.find({ _id: { $in: me.branchIds ?? [] } })
      .select("code name")
      .sort({ code: 1 })
      .lean(),
    me.reportingTo
      ? User.findById(me.reportingTo)
          .select("name email mobile role branchIds")
          .lean()
      : null,
    Engagement.find({
      $or: [{ assigneeId: actor.id }, { reviewerId: actor.id }],
    })
      .select(
        "code status statutoryDue internalDue assigneeId reviewerId reworkCount clientId templateSnapshot periodLabel period",
      )
      .sort({ statutoryDue: 1, internalDue: 1 })
      .limit(500)
      .lean(),
    ClientAccess.find({ userId: actor.id, active: true })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const load = loadFor(engagements, actor.id);
  const now = new Date();

  const [seniorBranches, grantClients, principal] = await Promise.all([
    senior
      ? Branch.find({ _id: { $in: senior.branchIds ?? [] } })
          .select("code")
          .lean()
      : [],
    Client.find({ _id: { $in: grants.map((g) => g.clientId) } })
      .select("legalName tradeName code")
      .lean(),
    me.articleship?.principalId
      ? User.findById(me.articleship.principalId).select("name").lean()
      : null,
  ]);
  const clientName = new Map(
    grantClients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  const open = engagements.filter(
    (e) =>
      !CLOSED_STATUSES.includes(e.status) &&
      String(e.assigneeId ?? "") === actor.id,
  );

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <p className="text-13 text-ink-muted">{ROLE_LABELS[me.role]}</p>
        <h1 className="font-display text-28 font-semibold">{me.name}</h1>
        <p className="text-14 text-ink-muted">
          {branches.map((b) => b.code).join(" · ") || "No branch"}
          {me.lastLoginAt
            ? ` · last signed in ${formatISTDate(me.lastLoginAt)}`
            : ""}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* --- my senior CA (the card this page exists for) --- */}
        <Panel title="My senior CA">
          {senior ? (
            <>
              <Row label="Name" value={senior.name} />
              <Row label="Role" value={ROLE_LABELS[senior.role]} />
              <Row label="Email" value={senior.email} mono />
              <Row label="Mobile" value={senior.mobile || "—"} mono />
              <Row
                label="Branch"
                value={seniorBranches.map((b) => b.code).join(" · ") || "—"}
              />
            </>
          ) : (
            <p className="text-14 text-ink-muted">
              Not set — ask a partner to record who you report to.
            </p>
          )}
        </Panel>

        <Panel title="My details" className="lg:col-span-2">
          <Row label="Email" value={me.email} mono />
          <Row label="Joined" value={fmt(me.joiningDate)} />
          <Row
            label="Capacity"
            value={`${me.capacityHours ?? 8} hours a day`}
          />
          <Row label="Skills" value={(me.skills ?? []).join(", ") || "—"} />
          <p className="text-13 text-ink-muted border-rule mt-3 border-t pt-3">
            Your role, branches and reporting CA are a partner&rsquo;s to
            change. Ask on the Team screen if any of them is wrong.
          </p>
        </Panel>
      </div>

      {/* --- what is on my desk --- */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20">My work</h2>
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Figure
            label="Open"
            value={load.asAssignee}
            href="/engagements?mine=1"
          />
          <Figure
            label="Overdue"
            value={load.overdue}
            href="/engagements?mine=1&due=overdue"
            tone={load.overdue > 0 ? "late" : undefined}
          />
          <Figure
            label="Awaiting documents"
            value={load.awaitingDocuments}
            href="/engagements?mine=1&status=Awaiting+documents"
          />
          <Figure
            label="With my reviewer"
            value={load.sentForReview}
            href="/engagements?mine=1&status=Under+review"
          />
          {load.asReviewer > 0 && (
            <Figure
              label="I review"
              value={load.asReviewer}
              href="/engagements?status=Under+review"
            />
          )}
          <Figure
            label="Came back for rework"
            value={`${load.reworked} of ${load.total}`}
            tone={load.reworked > 0 ? "late" : undefined}
          />
        </dl>

        {open.length > 0 && (
          <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <caption className="sr-only">My open work</caption>
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
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Due
                  </th>
                </tr>
              </thead>
              <tbody>
                {open.slice(0, 25).map((e) => (
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
                        {e.periodLabel || e.period}
                      </span>
                    </td>
                    <td className="text-13 px-3 py-2">
                      {clientName.get(String(e.clientId)) ?? "—"}
                    </td>
                    <td className="text-13 px-3 py-2">
                      <TierBadge level={e.templateSnapshot?.level} />
                    </td>
                    <td className="text-13 px-3 py-2">{e.status}</td>
                    <td
                      className={`text-13 px-3 py-2 font-mono ${
                        isOverdue(e, now) ? "text-redpen" : ""
                      }`}
                    >
                      {fmt(e.statutoryDue ?? e.internalDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {open.length === 0 && (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
            Nothing is assigned to you at the moment.
          </p>
        )}
      </section>

      {/* --- the clients somebody opened to me --- */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20">Clients I have been given</h2>
        {grants.length === 0 ? (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
            None. You can see the clients of the work on your desk, which needs
            no grant.
          </p>
        ) : (
          <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <caption className="sr-only">
                Clients I have been given access to
              </caption>
              <thead>
                <tr className="border-rule text-13 text-ink-muted border-b text-left">
                  <th scope="col" className="px-3 py-2 font-normal">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    What I can see
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Until
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Given because
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
                          href={`/clients/${grant.clientId}`}
                          className="underline underline-offset-4"
                        >
                          {clientName.get(String(grant.clientId)) ?? "A client"}
                        </Link>
                      </td>
                      <td className="text-13 px-3 py-2">
                        {(grant.sections ?? [])
                          .map((s) => SECTION_LABELS[s] ?? s)
                          .join(", ")}
                      </td>
                      <td className="text-13 px-3 py-2 font-mono">
                        {lapsed ? (
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

      {/* --- articleship, for an intern --- */}
      {me.isIntern && me.articleship && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-20">My articleship</h2>
          <Panel title="Registration">
            <Row label="Principal" value={principal?.name ?? "—"} />
            <Row
              label="ICAI registration no."
              value={me.articleship.icaiRegNo || "—"}
              mono
            />
            <Row label="Started" value={fmt(me.articleship.start)} />
            <Row
              label="Expected to end"
              value={fmt(me.articleship.expectedEnd)}
            />
            <Row
              label="Leave taken"
              value={`${me.articleship.leaveTaken ?? 0} of ${
                me.articleship.leaveAllowed ?? 156
              } days`}
            />
          </Panel>
          {nearLeaveLimit(me.articleship) && (
            <p className="rounded-ledger border-waiting bg-waiting-wash text-13 text-waiting border px-3 py-2">
              You have used {me.articleship.leaveTaken} of{" "}
              {me.articleship.leaveAllowed} permitted days. Talk to your
              principal before taking more.
            </p>
          )}
        </section>
      )}

      {/* --- password and phone --- */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20">Signing in</h2>
        <div className="rounded-ledger border-rule bg-surface border p-4">
          <Security
            mobile={me.mobile ?? ""}
            twoFactorOn={Boolean(me.totpEnabledAt)}
          />
        </div>
      </section>
    </div>
  );
}

/** Within ten per cent of the permitted days, or past them (spec section 9). */
function nearLeaveLimit(articleship) {
  const allowed = articleship.leaveAllowed ?? 156;
  const taken = articleship.leaveTaken ?? 0;
  return allowed > 0 && taken >= allowed * 0.9;
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
      <dt className="text-13 text-ink-muted w-40 shrink-0">{label}</dt>
      <dd className={`text-14 min-w-0 break-words ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Figure({ label, value, href, tone }) {
  const body = (
    <>
      <dt className="text-13 text-ink-muted">{label}</dt>
      <dd
        className={`font-display text-28 tabular-nums ${
          tone === "late" ? "text-redpen" : ""
        }`}
      >
        {value}
      </dd>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="rounded-ledger border-rule bg-surface hover:border-carbon border p-3"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-ledger border-rule bg-surface border p-3">
      {body}
    </div>
  );
}
