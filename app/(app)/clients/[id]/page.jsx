import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import User from "@/models/User";
import ClientGroup from "@/models/ClientGroup";
import ClientCredential from "@/models/ClientCredential";
import Comment from "@/models/Comment";
import AuditLog from "@/models/AuditLog";
import ActivityFeed from "@/components/audit/ActivityFeed";
import { formatISTDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "../page";
import CredentialsVault from "./CredentialsVault";
import NotesPanel from "./NotesPanel";
import StatusControl from "./StatusControl";

export const dynamic = "force-dynamic";

/** The folder tabs of the case file (spec section 3 and 15). */
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "engagements", label: "Engagements" },
  { key: "documents", label: "Documents" },
  { key: "invoices", label: "Invoices" },
  { key: "compliance", label: "Compliance" },
  { key: "notes", label: "Notes" },
  { key: "activity", label: "Activity" },
];

export async function generateMetadata({ params }) {
  const { id } = await params;
  await connectDB();
  const client = await Client.findById(id).select("legalName tradeName").lean();
  return {
    title: client
      ? `${client.tradeName || client.legalName} · PHMG`
      : "Client · PHMG",
  };
}

export default async function ClientPage({ params, searchParams }) {
  const actor = await requireUser();
  const { id } = await params;
  const tab = (await searchParams)?.tab ?? "overview";

  await connectDB();
  const client = await Client.findById(id).lean();
  if (!client) notFound();

  // Branch scoping: a CA in Ludhiana cannot open a Noida client (spec 2)
  if (!can(actor, "view", "clients", { branchId: String(client.branchId) })) {
    redirect("/clients");
  }

  const seeSensitive = can(actor, "view", "clientSensitive", {
    branchId: String(client.branchId),
  });
  const mayEdit = can(actor, "edit", "clients", {
    branchId: String(client.branchId),
  });

  const [branch, partner, manager, group] = await Promise.all([
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
            value={seeSensitive ? client.pan : client.pan ? "•••" : ""}
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
          {group && <Chip label="Group" value={group.name} />}
        </dl>
        {client.statusReason && (
          <p className="rounded-ledger border-waiting bg-waiting-wash text-13 text-waiting border px-3 py-2">
            {client.status}: {client.statusReason}
          </p>
        )}
      </header>

      {/* --- folder-style tab dividers --- */}
      <nav
        className="border-rule flex flex-wrap gap-1 border-b"
        aria-label="Client sections"
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/clients/${id}?tab=${t.key}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-t-ledger text-14 -mb-px border border-b-0 px-3 py-2 ${
                active
                  ? "border-rule bg-surface text-ink font-medium"
                  : "text-ink-muted hover:text-ink border-transparent"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === "overview" && (
        <Overview
          client={client}
          partner={partner}
          manager={manager}
          primary={primary}
          seeSensitive={seeSensitive}
          actorCanEditSensitive={can(actor, "edit", "clientSensitive", {
            branchId: String(client.branchId),
          })}
          clientId={id}
        />
      )}

      {tab === "notes" && <NotesTab clientId={id} mayEdit={mayEdit} />}
      {tab === "activity" && <ActivityTab clientId={id} actor={actor} />}

      {["engagements", "documents", "invoices", "compliance"].includes(tab) && (
        <Placeholder tab={tab} />
      )}
    </div>
  );
}

async function Overview({
  client,
  partner,
  manager,
  primary,
  seeSensitive,
  actorCanEditSensitive,
  clientId,
}) {
  const credentials = seeSensitive
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
          value={seeSensitive ? client.pan || "—" : "•••"}
          mono
        />
        <Row
          label="TAN"
          value={seeSensitive ? client.tan || "—" : "•••"}
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
                    <span className="text-12 text-brass ml-2">primary</span>
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

      {seeSensitive && (
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
            mayEdit={actorCanEditSensitive}
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

function Placeholder({ tab }) {
  const step = {
    engagements: "Step 5",
    documents: "Step 6",
    invoices: "Step 8",
    compliance: "Step 7",
  }[tab];
  return (
    <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
      This tab fills in at {step}.
    </p>
  );
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
