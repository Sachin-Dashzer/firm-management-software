import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, requireUser } from "@/auth";
import { branchFilter, can, ROLE_LABELS } from "@/lib/permissions";
import { accessFor, targetForClient } from "@/lib/access/clientAccess";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import User from "@/models/User";
import ClientGroup from "@/models/ClientGroup";
import { siblingsOf } from "@/lib/groups/summary";
import ClientCredential from "@/models/ClientCredential";
import Comment from "@/models/Comment";
import AuditLog from "@/models/AuditLog";
import ActivityFeed from "@/components/audit/ActivityFeed";
import TierBadge from "@/components/ledger/TierBadge";
import { formatISTDate, financialYearStart, istDate } from "@/lib/dates";
import { periodsInYear, buildGrid } from "@/lib/compliance/grid";
import { RECURRENCES, RECURRENCE_LABELS } from "@/lib/services/catalog";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import ClientCompliance from "./ClientCompliance";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "../page";
import CredentialsVault from "./CredentialsVault";
import NotesPanel from "./NotesPanel";
import StatusControl from "./StatusControl";
import Engagement from "@/models/Engagement";
import ClientService from "@/models/ClientService";
import ServiceTemplate from "@/models/ServiceTemplate";
import ClientServices from "./ClientServices";
import DocumentModel from "@/models/Document";
import DocumentsPanel from "./DocumentsPanel";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import LedgerPanel from "./LedgerPanel";
import {
  buildLedger,
  outstandingOf,
  outstandingSummary,
} from "@/lib/billing/allocation";
import { checkAssignment } from "@/lib/engagements/assign";
import { StatusChip as EngagementStatusChip } from "../../engagements/chips";
import FolderTabs from "@/components/clients/FolderTabs";
import DataRights from "./DataRights";
import ClientAccess from "@/models/ClientAccess";
import Dsc from "@/models/Dsc";
import { dscState } from "@/lib/practice/dsc";
import TeamAccess from "./TeamAccess";
import ClientUser from "@/models/ClientUser";
import PortalAccounts from "./PortalAccounts";

export const dynamic = "force-dynamic";

/**
 * The folder tabs of the case file (spec section 3 and 15).
 *
 * `needs` is the grant section (or permission area) that decides whether the
 * tab exists for this person at all — and the panel below checks the same
 * thing before it queries anything, so a tab is never the only thing
 * standing between somebody and the data behind it.
 */
/**
 * The statuses that mean money is still owed. "Overdue" is not among them
 * because it is never stored (spec section 7): a bill is overdue when its due
 * date has passed, which is worked out when it is read.
 */
const OWING_STATUSES = ["Sent", "Partially paid", "Disputed"];

const TABS = [
  { key: "overview", label: "Overview", needs: "profile" },
  { key: "engagements", label: "Engagements", needs: "engagements" },
  { key: "compliance", label: "Compliance", needs: "engagements" },
  { key: "documents", label: "Documents", needs: "documents" },
  { key: "invoices", label: "Invoices", needs: "billing" },
  { key: "access", label: "Team & access", needs: "team-access" },
  { key: "notes", label: "Notes", needs: "notes" },
  { key: "activity", label: "Activity", needs: "activity" },
];

/**
 * The tab title is the client's name, so it needs the same permission check
 * the page runs. Without one, a guessed id told anybody signed in — an intern
 * included — who that client was, in the browser tab.
 *
 * It checks on the branch alone, which is all it can do without a second
 * query for a tab title: a Partner, a CA and the accounts person see the
 * name, and everyone else gets the generic title even on a client they are
 * allowed to open. Cosmetic, and on the safe side.
 */
export async function generateMetadata({ params }) {
  const generic = { title: "Client · PHMG" };
  const actor = await currentUser();
  if (!actor) return generic;

  const { id } = await params;
  await connectDB();
  const client = await Client.findById(id)
    .select("legalName tradeName branchId")
    .lean();
  if (!client) return generic;
  if (!can(actor, "view", "clients", { branchId: String(client.branchId) })) {
    return generic;
  }

  return { title: `${client.tradeName || client.legalName} · PHMG` };
}

export default async function ClientPage({ params, searchParams }) {
  const actor = await requireUser();
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const tab = query.tab ?? "overview";

  await connectDB();
  const client = await Client.findById(id).lean();
  if (!client) notFound();

  /**
   * One question, asked once: who is this person to this client, and which
   * parts of the file may they see (`lib/access/clientAccess.js`). A Partner
   * or a CA gets everything their role allows; an employee or an intern gets
   * what the work on their desk or a CA's grant gives them.
   */
  const access = await accessFor(actor, client);
  if (!access.visible) redirect("/clients");

  const scope = await targetForClient(actor, client);
  const sees = (section) => access.sections.has(section);

  const seeIdentifiers = sees("identifiers");
  const seeVault = sees("credentials");
  const mayEdit = can(actor, "edit", "clients", scope);

  // The per-client history is the audit log for one record, so it follows the
  // audit-log permission rather than the client one: spec section 11 gives an
  // employee and an intern no access to it.
  const seeActivity = can(actor, "view", "auditLog", scope);
  const seeAccess = can(actor, "view", "clientAccess", scope);

  const visible = TABS.filter(({ needs }) => {
    if (needs === "activity") return seeActivity;
    if (needs === "team-access") return seeAccess;
    return sees(needs);
  });

  /**
   * The number on each divider, and the balance in the header.
   *
   * Counted only for the tabs this person can open, so a count never tells
   * somebody the size of something they may not look at — and counted within
   * their own scope, so an employee's "7" is the seven engagements they can
   * reach, not the firm's seventy. Overview, Compliance and Activity carry no
   * number: an audit log has no meaningful total, and a count that means
   * something different on every tab is noise rather than information.
   */
  const [counts, money] = await Promise.all([
    tabCounts(visible, { clientId: id, only: access.engagementIds }),
    sees("billing") ? outstandingFor(id) : null,
  ]);
  const tabs = visible.map((tab) => ({ ...tab, count: counts.get(tab.key) }));

  // a bookmark to a tab this person cannot see lands on the first they can
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;
  if (!active) redirect("/clients");

  const [branch, partner, manager, group, siblings] = await Promise.all([
    Branch.findById(client.branchId).select("code name").lean(),
    client.clientPartnerId
      ? User.findById(client.clientPartnerId).select("name").lean()
      : null,
    client.relationshipManagerId
      ? User.findById(client.relationshipManagerId).select("name").lean()
      : null,
    client.groupId
      ? ClientGroup.findById(client.groupId).select("name").lean()
      : null,
    // the owner's other businesses (P2-11) — each one a client record of its
    // own, scoped so this shows only the ones this person may open
    siblingsOf(actor, client),
  ]);

  const primary =
    client.contacts?.find((c) => c.primary) ?? client.contacts?.[0] ?? null;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      {/* --- the case file header (spec section 15) --- */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-13 text-ink-muted font-mono">{client.code}</p>
            <h1 className="font-display text-28 font-semibold">
              {client.tradeName || client.legalName}
            </h1>
            {client.tradeName && (
              <p className="text-14 text-ink-muted">{client.legalName}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={client.status} />
            {mayEdit && (
              <>
                <StatusControl
                  clientId={id}
                  status={client.status}
                  canApprove={can(actor, "approve", "deleteRecord")}
                />
                <Link
                  href={`/clients/${id}/edit`}
                  className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
                >
                  Edit
                </Link>
              </>
            )}
          </div>
        </div>

        <dl className="text-13 flex flex-wrap gap-x-6 gap-y-2">
          <Chip
            label="PAN"
            value={seeIdentifiers ? client.pan : client.pan ? "•••" : ""}
            mono
          />
          {client.gstins?.map((g) => (
            <Chip key={g.gstin} label={g.state} value={g.gstin} mono />
          ))}
          <Chip
            label="Branch"
            value={branch ? `${branch.code} — ${branch.name}` : ""}
          />
          <Chip label="Risk" value={client.risk} />
          <Chip label="Credit period" value={`${client.creditDays} days`} />
          {/**
           * What they owe, where a partner picking up the phone will see it.
           * Only for somebody who may see billing at all, and the overdue
           * part is said separately because that is the half that changes the
           * conversation.
           */}
          {money && (
            <div className="flex items-center gap-2">
              <dt className="text-12 text-ink-muted tracking-wide uppercase">
                Outstanding
              </dt>
              <dd className="num text-13">
                <Link
                  href={`/clients/${id}?tab=invoices`}
                  className="underline underline-offset-4"
                >
                  {formatPaise(money.totalPaise)}
                </Link>
                {money.overduePaise > 0 && (
                  <span className="text-redpen">
                    {" · "}
                    {formatPaise(money.overduePaise)} overdue since{" "}
                    {formatISTDate(money.oldest)}
                  </span>
                )}
                {money.totalPaise === 0 && (
                  <span className="text-ink-muted"> · nothing due</span>
                )}
              </dd>
            </div>
          )}
          {group && (
            <Chip
              label="Group"
              value={
                <Link
                  href={`/groups/${client.groupId}`}
                  className="underline underline-offset-4"
                >
                  {group.name}
                </Link>
              }
            />
          )}
        </dl>
        {client.statusReason && (
          <p className="rounded-ledger border-waiting bg-waiting-wash text-13 text-waiting border px-3 py-2">
            {client.status}: {client.statusReason}
          </p>
        )}
        {/*
          The same owner's other businesses (P2-11). A separate PAN means a
          separate client record, so this is the only place the three show up
          as one relationship.
        */}
        {siblings.length > 0 && (
          <p className="rounded-ledger border-rule bg-surface text-13 flex flex-wrap items-center gap-x-2 gap-y-1 border px-3 py-2">
            <span className="text-ink-muted">
              Also in {group?.name ?? "this group"}:
            </span>
            {siblings.map((business) => (
              <Link
                key={business.id}
                href={`/clients/${business.id}`}
                className="underline underline-offset-4"
              >
                {business.name}
                {business.openWork > 0 && (
                  <span className="text-ink-muted num">
                    {" "}
                    ({business.openWork} open)
                  </span>
                )}
              </Link>
            ))}
          </p>
        )}
      </header>

      {/* --- folder-style tab dividers, with the divider that slides --- */}
      <FolderTabs
        tabs={tabs}
        active={active}
        basePath={`/clients/${id}`}
        label="Client sections"
      />

      {active === "overview" && (
        <Overview
          client={client}
          partner={partner}
          manager={manager}
          primary={primary}
          seeIdentifiers={seeIdentifiers}
          seeVault={seeVault}
          mayEditVault={can(actor, "edit", "clientCredentials", scope)}
          seeDsc={can(actor, "view", "dsc", scope)}
          clientId={id}
        />
      )}

      {active === "notes" && <NotesTab clientId={id} mayEdit={mayEdit} />}
      {active === "activity" && (
        <div className="flex flex-col gap-4">
          <ActivityTab clientId={id} actor={actor} />
          {/* the DPDP rights sit with the history, because that is where a
              partner looks when a client asks what is held on them */}
          {can(actor, "view", "clientCredentials", scope) && (
            <DataRights
              clientId={id}
              clientName={client.tradeName || client.legalName}
              redactedAt={
                client.redactedAt ? formatISTDate(client.redactedAt) : null
              }
            />
          )}
        </div>
      )}
      {active === "engagements" && (
        <EngagementsTab
          clientId={id}
          actor={actor}
          mayEdit={mayEdit}
          only={access.engagementIds}
        />
      )}
      {active === "documents" && (
        <DocumentsTab
          clientId={id}
          actor={actor}
          client={client}
          scope={scope}
          only={access.engagementIds}
        />
      )}

      {active === "invoices" && (
        <InvoicesTab clientId={id} actor={actor} client={client} />
      )}

      {active === "access" && (
        <div className="flex flex-col gap-4">
          <TeamAccessTab clientId={id} actor={actor} client={client} />
          {/* the client's own people, below the firm's: the tab asks who
              can see this client, and they are part of the answer (P2-9a) */}
          {can(actor, "view", "clientPortalUsers", scope) && (
            <PortalAccountsTab clientId={id} actor={actor} client={client} />
          )}
        </div>
      )}

      {active === "compliance" && (
        <ComplianceTab
          clientId={id}
          fy={query.fy}
          only={access.engagementIds}
        />
      )}
    </div>
  );
}

async function Overview({
  client,
  partner,
  manager,
  primary,
  seeIdentifiers,
  seeVault,
  mayEditVault,
  clientId,
  seeDsc,
}) {
  /**
   * Their digital signature certificates (P2-7). A line and a link rather
   * than a panel: the register is one list for the whole firm, and a second
   * copy of it here would be a second thing to keep right.
   */
  const dsc = seeDsc ? await dscSummary(clientId) : null;
  const credentials = seeVault
    ? await ClientCredential.find({ clientId })
        .select("portal label username lastRevealedAt")
        .sort({ portal: 1 })
        .lean()
    : [];

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Panel title="Identifiers" className="lg:col-span-2">
        <Row label="Entity type" value={client.entityType} />
        <Row
          label="Incorporated / born"
          value={
            client.establishedOn
              ? formatISTDate(new Date(client.establishedOn))
              : "—"
          }
        />
        <Row
          label="PAN"
          value={seeIdentifiers ? client.pan || "—" : "•••"}
          mono
        />
        <Row
          label="TAN"
          value={seeIdentifiers ? client.tan || "—" : "•••"}
          mono
        />
        <Row label="CIN / LLPIN" value={client.cin || "—"} mono />
        <Row label="Udyam" value={client.udyam || "—"} mono />
        <Row label="IEC" value={client.iec || "—"} mono />
        <Row
          label="Aadhaar"
          value={client.aadhaarLast4 ? `XXXXXXXX${client.aadhaarLast4}` : "—"}
          mono
        />
        {client.gstins?.length > 0 && (
          <Row
            label="GST registrations"
            value={client.gstins
              .map((g) => `${g.gstin} (${g.state}${g.qrmp ? ", QRMP" : ""})`)
              .join(" · ")}
          />
        )}
      </Panel>

      <Panel title="Firm side">
        <Row label="Client partner" value={partner?.name ?? "— not set —"} />
        <Row
          label="Relationship manager"
          value={manager?.name ?? "— not set —"}
        />
        <Row label="Industry" value={client.industry || "—"} />
        <Row label="Turnover band" value={client.turnoverBand || "—"} />
        <Row label="Referral source" value={client.referralSource || "—"} />
        <Row
          label="Onboarded"
          value={
            client.onboardedOn
              ? formatISTDate(new Date(client.onboardedOn))
              : "—"
          }
        />
        {client.tags?.length > 0 && (
          <Row label="Tags" value={client.tags.join(", ")} />
        )}
        {dsc && (
          <div className="border-rule flex items-baseline justify-between gap-3 border-t py-1.5">
            <span className="text-13 text-ink-muted">Signature certs</span>
            <Link
              href={`/practice/dsc?client=${clientId}`}
              className="text-14 underline underline-offset-4"
            >
              {dsc.count === 0 ? (
                "none on the register"
              ) : (
                <>
                  {dsc.count} on the register
                  {dsc.nextLabel && (
                    <span className={dsc.soon ? "text-waiting" : ""}>
                      {" · "}
                      {dsc.nextLabel}
                    </span>
                  )}
                </>
              )}
            </Link>
          </div>
        )}
      </Panel>

      <Panel title="Contacts" className="lg:col-span-2">
        {client.contacts?.length ? (
          <ul className="divide-rule flex flex-col divide-y">
            {client.contacts.map((c) => (
              <li
                key={String(c._id)}
                className="text-14 flex flex-wrap gap-x-4 py-2"
              >
                <span className="font-medium">
                  {c.name}
                  {c.primary && (
                    <span className="text-12 text-brass-ink ml-2">primary</span>
                  )}
                </span>
                {c.designation && (
                  <span className="text-ink-muted">{c.designation}</span>
                )}
                {c.mobile && <span className="num font-mono">{c.mobile}</span>}
                {c.email && <span className="text-ink-muted">{c.email}</span>}
                {c.whatsappOptOut && (
                  <span className="text-12 text-ink-muted">no WhatsApp</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-14 text-ink-muted">No contacts recorded.</p>
        )}
      </Panel>

      <Panel title="Commercials">
        <Row label="Billing cycle" value={client.billingCycle} />
        <Row label="Credit period" value={`${client.creditDays} days`} />
        <Row label="Invoice email" value={client.invoiceEmail || "—"} />
        {client.quotedAmountPaise > 0 && (
          <Row label="Quoted" value={formatPaise(client.quotedAmountPaise)} />
        )}
        {client.proposedServices && (
          <Row label="Proposed services" value={client.proposedServices} />
        )}
        {client.feeAgreements?.length > 0 && (
          <ul className="text-13 mt-2 flex flex-col gap-1">
            {client.feeAgreements.map((f) => (
              <li key={String(f._id)}>
                {f.description}: {formatPaise(f.amountPaise)} ({f.recurrence})
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {client.addresses?.length > 0 && (
        <Panel title="Addresses" className="lg:col-span-2">
          {client.addresses.map((a) => (
            <div key={String(a._id)} className="text-14 py-1">
              <span className="text-13 text-ink-muted">{a.kind}: </span>
              {[a.line1, a.line2, a.city, a.state, a.pincode]
                .filter(Boolean)
                .join(", ")}
            </div>
          ))}
        </Panel>
      )}

      {seeVault && (
        <div className="lg:col-span-3">
          <CredentialsVault
            clientId={clientId}
            credentials={credentials.map((c) => ({
              id: String(c._id),
              portal: c.portal,
              label: c.label,
              username: c.username,
              lastRevealedAt: c.lastRevealedAt
                ? formatISTDate(new Date(c.lastRevealedAt))
                : null,
            }))}
            mayEdit={mayEditVault}
          />
        </div>
      )}
    </div>
  );
}

async function NotesTab({ clientId, mayEdit }) {
  const notes = await Comment.find({ entityType: "Client", entityId: clientId })
    .sort({ occurredAt: -1 })
    .limit(200)
    .lean();

  return (
    <NotesPanel
      clientId={clientId}
      mayEdit={mayEdit}
      notes={notes.map((n) => ({
        id: String(n._id),
        kind: n.kind,
        body: n.body,
        who: n.createdByName || "Someone",
        when: formatISTDate(new Date(n.occurredAt)),
      }))}
    />
  );
}

async function ActivityTab({ clientId, actor }) {
  if (!can(actor, "view", "auditLog")) {
    return (
      <p className="text-14 text-ink-muted">
        The activity trail is visible to CAs and partners.
      </p>
    );
  }

  const entries = await AuditLog.find({ clientId })
    .sort({ seq: -1 })
    .limit(200)
    .lean();

  return (
    <div className="rounded-ledger border-rule bg-surface border px-4">
      <ActivityFeed
        entries={entries.map((e) => ({ ...e, _id: String(e._id) }))}
        emptyMessage="Nothing has been recorded against this client yet."
      />
    </div>
  );
}

/** The client's work: what is running now, and what they are signed up for. */
/**
 * @param {object} props
 * @param {string[]|null} props.only when somebody is here through the work on
 *   their desk rather than a grant, the only engagements they may see. `null`
 *   means no such limit.
 */
async function EngagementsTab({ clientId, actor, mayEdit, only }) {
  const mine = only ? { _id: { $in: only } } : {};

  const [engagements, subscriptions, templates, team] = await Promise.all([
    Engagement.find({ clientId, ...mine })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
    ClientService.find({ clientId, active: true }).lean(),
    ServiceTemplate.find({ active: true })
      .select(
        "name code level recurrence minExecRole minReviewRole defaultFeePaise",
      )
      .sort({ name: 1 })
      .lean(),
    User.find({ active: true }).select("name role").sort({ name: 1 }).lean(),
  ]);

  const templateName = new Map(templates.map((t) => [String(t._id), t.name]));
  const byId = new Map(templates.map((t) => [String(t._id), t]));
  const person = new Map(
    team.map((u) => [
      String(u._id),
      { id: String(u._id), name: u.name, role: u.role },
    ]),
  );

  /**
   * A subscription's usual people were legal when somebody chose them, but a
   * default goes stale — the person is demoted, or the service is raised to
   * A-tier. The recurring generator refuses to assign work to somebody who
   * may not do it and creates it unassigned instead, which is the safe half;
   * this is the other half, said where it can be fixed.
   */
  function staleDefault(subscription) {
    const template = byId.get(String(subscription.serviceTemplateId));
    if (!template) return "";

    const named = ["defaultAssigneeId", "defaultReviewerId"].map((key) =>
      subscription[key] ? String(subscription[key]) : "",
    );
    // a name the team list no longer holds is somebody who has left
    if (named.some((id) => id && !person.has(id))) {
      return "Somebody named here no longer works at the firm.";
    }

    const check = checkAssignment(
      template,
      person.get(named[0]) ?? null,
      person.get(named[1]) ?? null,
    );
    return check.ok ? "" : check.error;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-20">Engagements</h2>
          {can(actor, "edit", "engagementsCreate") && (
            <Link
              href={`/engagements/new?client=${clientId}`}
              className="text-13 underline underline-offset-4"
            >
              New engagement
            </Link>
          )}
        </div>
        <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <tbody>
              {engagements.map((e) => (
                <tr
                  key={String(e._id)}
                  className="border-rule border-b last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/engagements/${e._id}`}
                      className="underline underline-offset-4"
                    >
                      {e.templateSnapshot?.name ?? "Engagement"}
                    </Link>
                    <br />
                    <span className="text-13 text-ink-muted font-mono">
                      {e.code}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <TierBadge level={e.templateSnapshot?.level} />
                  </td>
                  <td className="text-13 px-3 py-2">
                    {e.periodLabel || e.period}
                  </td>
                  <td className="px-3 py-2">
                    <EngagementStatusChip status={e.status} />
                  </td>
                  <td className="num text-13 px-3 py-2">
                    {e.internalDue ? formatISTDate(e.internalDue) : "—"}
                  </td>
                </tr>
              ))}
              {engagements.length === 0 && (
                <tr>
                  <td className="text-ink-muted px-3 py-6 text-center">
                    No work has been created for this client yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ClientServices
        clientId={clientId}
        mayEdit={mayEdit}
        subscriptions={subscriptions.map((s) => ({
          id: String(s._id),
          serviceTemplateId: String(s.serviceTemplateId),
          name: templateName.get(String(s.serviceTemplateId)) ?? "Service",
          level: byId.get(String(s.serviceTemplateId))?.level ?? "",
          fee: formatPaise(s.feePaise ?? 0),
          stale: staleDefault(s),
        }))}
        templates={templates.map((t) => ({
          id: String(t._id),
          name: t.name,
          code: t.code,
          level: t.level,
          defaultFee: String((t.defaultFeePaise ?? 0) / 100),
          minExecRole: t.minExecRole,
          minReviewRole: t.minReviewRole,
        }))}
        team={team.map((u) => ({
          id: String(u._id),
          name: u.name,
          role: u.role,
        }))}
      />
    </div>
  );
}

/** The client's files: the permanent file first, then work by engagement. */
async function DocumentsTab({ clientId, actor, scope, only }) {
  const mayEdit = can(actor, "edit", "documents", scope);

  /**
   * Somebody here through the work on their desk sees that work's files and
   * the client's permanent file — the PAN card, the incorporation
   * certificate, the things every engagement refers to. Not the files of
   * work they are not on.
   */
  const documents = await DocumentModel.find({
    clientId,
    ...(only
      ? { $or: [{ engagementId: { $in: only } }, { isPermanent: true }] }
      : {}),
  })
    .sort({ createdAt: -1 })
    .lean();

  const engagementIds = [
    ...new Set(
      documents
        .filter((d) => d.engagementId)
        .map((d) => String(d.engagementId)),
    ),
  ];
  const engagements = await Engagement.find({ _id: { $in: engagementIds } })
    .select("code templateSnapshot periodLabel period")
    .lean();

  const shape = (d) => ({
    id: String(d._id),
    name: d.name,
    size: d.size,
    mime: d.mime,
    versions: (d.versions ?? []).length,
    uploadedByName: d.uploadedByName,
    isPermanent: Boolean(d.isPermanent),
  });

  return (
    <DocumentsPanel
      clientId={clientId}
      mayEdit={mayEdit}
      permanent={documents.filter((d) => d.isPermanent).map(shape)}
      byEngagement={engagements.map((e) => ({
        id: String(e._id),
        title: `${e.templateSnapshot?.name ?? "Engagement"} · ${e.periodLabel || e.period}`,
        code: e.code,
        documents: documents
          .filter(
            (d) => !d.isPermanent && String(d.engagementId) === String(e._id),
          )
          .map(shape),
      }))}
    />
  );
}

/** The client's account: what they owe, and everything behind it. */
async function InvoicesTab({ clientId, actor, client }) {
  if (!can(actor, "view", "invoices", { branchId: String(client.branchId) })) {
    return (
      <p className="text-14 text-ink-muted">
        Billing is not visible to your role.
      </p>
    );
  }

  const [invoices, payments] = await Promise.all([
    Invoice.find({ clientId }).sort({ date: 1 }).limit(500).lean(),
    Payment.find({ clientId }).sort({ date: 1 }).limit(500).lean(),
  ]);

  const { entries, closingPaise } = buildLedger(invoices, payments);

  const open = invoices
    .filter(
      (i) =>
        OWING_STATUSES.includes(i.status) &&
        i.type !== "Credit note" &&
        outstandingOf(i) > 0,
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <LedgerPanel
      clientId={clientId}
      mayEdit={can(actor, "edit", "invoices", {
        branchId: String(client.branchId),
      })}
      closing={formatPaise(closingPaise)}
      entries={entries.map((entry) => ({
        id: entry.id,
        date: formatISTDate(new Date(entry.date)),
        kind: entry.kind,
        reference: entry.reference ?? "",
        debit: entry.debitPaise ? formatPaise(entry.debitPaise) : "—",
        credit: entry.creditPaise ? formatPaise(entry.creditPaise) : "—",
        balance: formatPaise(entry.balancePaise),
      }))}
      openInvoices={open.map((i) => ({
        id: String(i._id),
        number: i.number ?? "draft",
        outstanding: formatPaise(outstandingOf(i)),
      }))}
      invoices={invoices
        .slice()
        .reverse()
        .map((i) => ({
          id: String(i._id),
          number: i.number,
          date: formatISTDate(new Date(i.date)),
          status: i.status,
          total: formatPaise(i.totalPaise ?? 0),
          outstanding: formatPaise(outstandingOf(i)),
        }))}
    />
  );
}

/**
 * Who can see this client and why (owner decision D3).
 *
 * P2-5 adds the other two halves of this tab: the people who work on the
 * client, counted off its engagements, and the client's own portal accounts.
 */
async function TeamAccessTab({ clientId, actor, client }) {
  const mayEdit = can(actor, "edit", "clientAccess", {
    branchId: String(client.branchId),
  });

  const [grants, working] = await Promise.all([
    ClientAccess.find({ clientId }).sort({ active: -1, createdAt: -1 }).lean(),
    /**
     * Who is actually on this client's work (the half of this tab deferred
     * from P2-2). It is derived from the engagements rather than stored:
     * reassigning work is the act that changes who works on a client, and a
     * second list of the same fact would be a second list to get wrong.
     */
    Engagement.find({ clientId, status: { $nin: CLOSED_STATUSES } })
      .select("assigneeId reviewerId")
      .limit(500)
      .lean(),
  ]);

  const desks = new Map();
  const note = (id, field) => {
    if (!id) return;
    const key = String(id);
    const row = desks.get(key) ?? { doing: 0, reviewing: 0 };
    row[field] += 1;
    desks.set(key, row);
  };
  for (const engagement of working) {
    note(engagement.assigneeId, "doing");
    note(engagement.reviewerId, "reviewing");
  }

  const people = await User.find({
    _id: {
      $in: [
        ...grants.map((g) => g.userId),
        ...desks.keys(),
        client.clientPartnerId,
        client.relationshipManagerId,
      ].filter(Boolean),
    },
  })
    .select("name role")
    .lean();
  const person = new Map(people.map((p) => [String(p._id), p]));

  /** The client partner and the relationship manager belong on this list too. */
  const named = new Map(
    [
      [client.clientPartnerId, "Client partner"],
      [client.relationshipManagerId, "Relationship manager"],
    ]
      .filter(([id]) => id)
      .map(([id, title]) => [String(id), title]),
  );

  const workers = [...new Set([...named.keys(), ...desks.keys()])]
    .map((id) => {
      const who = person.get(id);
      const desk = desks.get(id) ?? { doing: 0, reviewing: 0 };
      return {
        id,
        name: who?.name ?? "A former colleague",
        roleLabel: ROLE_LABELS[who?.role] ?? "",
        title: named.get(id) ?? "",
        doing: desk.doing,
        reviewing: desk.reviewing,
      };
    })
    // the named people first, then whoever carries the most open work
    .sort(
      (a, b) =>
        Number(Boolean(b.title)) - Number(Boolean(a.title)) ||
        b.doing + b.reviewing - (a.doing + a.reviewing) ||
        a.name.localeCompare(b.name),
    );

  // Only an employee or an intern can hold a grant worth giving: a CA and a
  // Partner already see the client through their role, so offering them
  // would be offering nothing.
  const team = await User.find({
    active: true,
    role: { $in: ["employee", "intern"] },
    ...(branchFilter(actor, "clientAccess") ?? {}),
  })
    .select("name role")
    .sort({ name: 1 })
    .lean();

  const now = new Date();

  return (
    <TeamAccess
      clientId={clientId}
      mayEdit={mayEdit}
      workers={workers}
      grants={grants.map((grant) => {
        const who = person.get(String(grant.userId));
        return {
          id: String(grant._id),
          name: who?.name ?? "A former colleague",
          roleLabel: ROLE_LABELS[who?.role] ?? "",
          sections: grant.sections ?? [],
          reason: grant.reason,
          expiresAt: grant.expiresAt ? formatISTDate(grant.expiresAt) : null,
          expired: Boolean(grant.expiresAt && grant.expiresAt <= now),
          revoked: !grant.active,
          revokedAt: grant.revokedAt ? formatISTDate(grant.revokedAt) : null,
          grantedByName: grant.grantedByName,
          grantedAt: formatISTDate(grant.createdAt),
        };
      })}
      team={team.map((p) => ({
        id: String(p._id),
        name: p.name,
        role: p.role,
        roleLabel: ROLE_LABELS[p.role] ?? p.role,
      }))}
    />
  );
}

/**
 * One client's compliance year (spec section 3: "Compliance calendar" on the
 * client page).
 *
 * The services are the ones they are signed up for **plus** any service they
 * have work against in this year, so a subscription stopped in November does
 * not erase April to October. Each recurrence gets its own grid: a monthly
 * return and an annual audit do not share columns.
 *
 * Somebody who reaches this client through the work on their desk does not
 * get a grid at all. They would see every period they are not on as a hole,
 * which is exactly the thing this screen is supposed to mean something by.
 */
async function ComplianceTab({ clientId, fy, only }) {
  if (only) {
    return (
      <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
        You can see the work assigned to you on this client, not the whole file,
        so a compliance grid here would show gaps that are not real ones. A CA
        or a Partner can give you access to the client if you need the full
        picture.
      </p>
    );
  }

  const thisYear = financialYearStart(new Date());
  const asked = Number(fy);
  const fyStart =
    Number.isInteger(asked) && asked >= thisYear - 6 && asked <= thisYear
      ? asked
      : thisYear;

  const [subscriptions, engagements] = await Promise.all([
    ClientService.find({ clientId, active: true })
      .select("serviceTemplateId")
      .lean(),
    Engagement.find({
      clientId,
      periodStart: {
        $gte: istDate(fyStart, 4, 1),
        $lt: istDate(fyStart + 1, 4, 1),
      },
    })
      .select(
        "serviceTemplateId period status statutoryDue internalDue templateSnapshot.name templateSnapshot.recurrence",
      )
      .limit(500)
      .lean(),
  ]);

  const wanted = [
    ...new Set([
      ...subscriptions.map((s) => String(s.serviceTemplateId)),
      ...engagements.map((e) => String(e.serviceTemplateId)),
    ]),
  ];
  const services = await ServiceTemplate.find({ _id: { $in: wanted } })
    .select("name code recurrence")
    .sort({ name: 1 })
    .lean();

  /** One grid per recurrence, in the order the catalog uses. */
  const sections = RECURRENCES.map((recurrence) => {
    const mine = services.filter((s) => s.recurrence === recurrence);
    if (mine.length === 0) return null;

    const periods = periodsInYear(recurrence, fyStart);
    const ids = new Set(mine.map((s) => String(s._id)));
    const grid = buildGrid({
      clients: mine.map((s) => ({ id: String(s._id), name: s.name })),
      engagements: engagements.filter((e) =>
        ids.has(String(e.serviceTemplateId)),
      ),
      periods,
      keyOf: (engagement) => String(engagement.serviceTemplateId),
    });

    return {
      recurrence,
      label: RECURRENCE_LABELS[recurrence] ?? recurrence,
      periods: periods.map((p) => ({ code: p.code, short: p.short })),
      grid,
    };
  }).filter(Boolean);

  return (
    <ClientCompliance
      clientId={clientId}
      fyStart={fyStart}
      sections={sections}
      years={[thisYear, thisYear - 1, thisYear - 2]}
      totalMissing={sections.reduce((sum, s) => sum + s.grid.totalMissing, 0)}
    />
  );
}

/**
 * How many certificates this client has on the register, and when the next
 * one runs out. Two numbers, not a list: the register is the list.
 *
 * @param {string} clientId
 */
async function dscSummary(clientId) {
  const [count, next] = await Promise.all([
    Dsc.countDocuments({ clientId }),
    Dsc.findOne({ clientId, validTill: { $gte: new Date() } })
      .sort({ validTill: 1 })
      .select("validTill")
      .lean(),
  ]);

  const state = next ? dscState(next.validTill) : null;
  return {
    count,
    nextLabel: state ? `next expires ${formatISTDate(next.validTill)}` : "",
    soon: state ? ["soon", "today"].includes(state.state) : false,
  };
}

/**
 * The number on each divider.
 *
 * Every count is the same query the tab itself runs, narrowed the same way —
 * including `only`, the engagements somebody is on when that is how they
 * reach this client. A count that disagreed with the rows behind it would be
 * worse than no count at all, so the filters are copied rather than
 * approximated.
 *
 * @param {{key: string}[]} tabs the tabs this person can actually open
 * @param {{clientId: string, only: string[]|null}} scope
 * @returns {Promise<Map<string, number>>}
 */
async function tabCounts(tabs, { clientId, only }) {
  const wanted = new Set(tabs.map((tab) => tab.key));
  const jobs = [];

  if (wanted.has("engagements")) {
    jobs.push([
      "engagements",
      Engagement.countDocuments({
        clientId,
        status: { $nin: CLOSED_STATUSES },
        ...(only ? { _id: { $in: only } } : {}),
      }),
    ]);
  }
  if (wanted.has("documents")) {
    jobs.push([
      "documents",
      DocumentModel.countDocuments({
        clientId,
        ...(only
          ? { $or: [{ engagementId: { $in: only } }, { isPermanent: true }] }
          : {}),
      }),
    ]);
  }
  if (wanted.has("invoices")) {
    // what is still owed on, not every bill ever raised
    jobs.push([
      "invoices",
      Invoice.countDocuments({
        clientId,
        type: { $ne: "Credit note" },
        status: { $in: OWING_STATUSES },
      }),
    ]);
  }
  if (wanted.has("notes")) {
    jobs.push([
      "notes",
      Comment.countDocuments({ entityType: "Client", entityId: clientId }),
    ]);
  }
  if (wanted.has("access")) {
    jobs.push([
      "access",
      ClientAccess.countDocuments({ clientId, active: true }),
    ]);
  }

  const values = await Promise.all(jobs.map(([, query]) => query));
  return new Map(jobs.map(([key], index) => [key, values[index]]));
}

/**
 * What this client owes, for the header.
 *
 * `overdue` is the part already past its due date, which is the half of the
 * figure that changes the conversation. Credit notes are excluded and TDS
 * counts as settled, both through `outstandingOf` — a client who pays 90%
 * and deducts 10% has paid the bill.
 *
 * @param {string} clientId
 */
async function outstandingFor(clientId) {
  const invoices = await Invoice.find({
    clientId,
    type: { $ne: "Credit note" },
    status: { $in: OWING_STATUSES },
  })
    .select("totalPaise paidPaise tdsCreditedPaise dueDate")
    .limit(1000)
    .lean();

  return outstandingSummary(invoices);
}

function Panel({ title, className = "", children }) {
  return (
    <section
      className={`rounded-ledger border-rule bg-surface border p-4 ${className}`}
    >
      <h2 className="font-display text-20 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="border-rule flex gap-3 border-b py-1.5 last:border-0">
      <dt className="text-13 text-ink-muted w-44 shrink-0">{label}</dt>
      <dd className={`text-14 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function Chip({ label, value, mono }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <dt className="text-12 text-ink-muted tracking-wide uppercase">
        {label}
      </dt>
      <dd className={`${mono ? "font-mono" : ""} text-13`}>{value}</dd>
    </div>
  );
}

/**
 * The client's own logins (P2-9a).
 *
 * Read with the same branch scope as everything else on the case file, and
 * editable only by a CA or a partner — the action checks that again, since
 * these are accounts for people outside the firm.
 */
async function PortalAccountsTab({ clientId, actor, client }) {
  const mayEdit =
    can(actor, "edit", "clientPortalUsers", {
      branchId: String(client.branchId),
    }) && ["ca", "partner"].includes(actor.role);

  const accounts = await ClientUser.find({ clientId })
    .sort({ active: -1, createdAt: -1 })
    .lean();

  return (
    <PortalAccounts
      clientId={clientId}
      mayEdit={mayEdit}
      accounts={accounts.map((account) => ({
        id: String(account._id),
        name: account.name,
        email: account.email,
        designation: account.designation ?? "",
        active: account.active !== false,
        twoFactor: Boolean(account.totpRequired),
        mustChangePassword: Boolean(account.mustChangePassword),
        invitedByName: account.invitedByName ?? "",
        lastLoginAt: account.lastLoginAt
          ? formatISTDate(account.lastLoginAt)
          : null,
      }))}
    />
  );
}
