import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter, scopeOf } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import Branch from "@/models/Branch";
import { CLIENT_STATUSES, ENTITY_TYPES, RISK_RATINGS } from "@/lib/validators";

export const metadata = { title: "Clients · PHMG" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * The client list (spec section 3).
 *
 * ponytail: server-side search and paging with a plain table, rather than
 * TanStack Table and Virtual as spec section 15 lists. At 50 rows a page
 * nothing needs virtualising, and the 2-second budget for 5,000 clients
 * (spec section 14) is met by the indexes, not by the client. The compliance
 * grid in Step 7 is the screen that genuinely needs virtual scrolling — worth
 * reconsidering then, when the sticky-column behaviour has to be built anyway.
 */
export default async function ClientsPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "clients")) redirect("/today");

  const params = (await searchParams) ?? {};
  const {
    q = "",
    status = "",
    entityType = "",
    risk = "",
    page = "1",
  } = params;
  const pageNumber = Math.max(1, Number(page) || 1);

  await connectDB();

  /** @type {Record<string, any>} */
  const query = {};
  if (branchFilter(actor, "clients")) {
    query.branchId = { $in: actor.branchIds };
  }

  // An intern may see only clients they are assigned to (spec section 2).
  // Assignment comes from engagements, so the list is the clients of the work
  // on their desk — nothing else in the branch.
  const assignedOnly = scopeOf(actor, "clients") === "assigned";
  if (assignedOnly) {
    const mine = await Engagement.distinct("clientId", {
      $or: [{ assigneeId: actor.id }, { reviewerId: actor.id }],
    });
    query._id = { $in: mine };
  }

  if (status) query.status = status;
  if (entityType) query.entityType = entityType;
  if (risk) query.risk = risk;

  const search = String(q).trim();
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const loose = new RegExp(escaped, "i");
    const exact = search.replace(/[\s-]/g, "").toUpperCase();
    query.$or = [
      { legalName: loose },
      { tradeName: loose },
      { code: loose },
      { pan: exact },
      { "gstins.gstin": exact },
      { "contacts.mobile": search.replace(/\D/g, "") },
      { "contacts.name": loose },
    ];
  }

  const [clients, total, branches] = await Promise.all([
    Client.find(query)
      .select(
        "code legalName tradeName entityType status risk pan gstins branchId contacts creditDays quotedAmountPaise",
      )
      .sort({ legalName: 1 })
      .skip((pageNumber - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    Client.countDocuments(query),
    Branch.find({}).select("code name").lean(),
  ]);

  const branchCode = new Map(branches.map((b) => [String(b._id), b.code]));
  const canCreate = can(actor, "edit", "clients");
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-28 font-semibold">Clients</h1>
          <p className="num text-13 text-ink-muted">
            {total.toLocaleString("en-IN")} {total === 1 ? "client" : "clients"}
            {search ? ` matching “${search}”` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!assignedOnly && (
            <a
              href={`/clients/export?${new URLSearchParams(
                Object.entries({ status, entityType, risk }).filter(
                  ([, v]) => v,
                ),
              )}`}
              className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
            >
              Export to Excel
            </a>
          )}
          {canCreate && (
            <>
              <Link
                href="/clients/import"
                className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
              >
                Import from Excel
              </Link>
              <Link
                href="/clients/new"
                className="rounded-ledger bg-carbon text-14 h-9 px-3 leading-9 font-medium text-white"
              >
                New client
              </Link>
            </>
          )}
        </div>
      </div>

      <form
        method="get"
        className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="flex flex-col gap-1 lg:col-span-2">
          <span className="text-13 text-ink-muted font-medium">
            Name, code, PAN, GSTIN or mobile
          </span>
          <input
            name="q"
            defaultValue={search}
            placeholder="ABC Traders, AAAPZ1234C, 9876543210…"
            className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>
        <Filter
          label="Status"
          name="status"
          value={status}
          options={CLIENT_STATUSES}
        />
        <Filter
          label="Entity type"
          name="entityType"
          value={entityType}
          options={ENTITY_TYPES}
        />
        <div className="flex items-end gap-2">
          <Filter
            label="Risk"
            name="risk"
            value={risk}
            options={RISK_RATINGS}
          />
          <button
            type="submit"
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
          >
            Filter
          </button>
          <Link
            href="/clients"
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Clear
          </Link>
        </div>
      </form>

      {assignedOnly && total === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
          You see only the clients of engagements assigned to you. Once work is
          assigned to you it will appear here.
        </p>
      ) : (
        <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                <Th>Code</Th>
                <Th>Client</Th>
                <Th>Type</Th>
                <Th>PAN</Th>
                <Th>GST</Th>
                <Th>Branch</Th>
                <Th>Primary contact</Th>
                <Th>Status</Th>
                <Th>Risk</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const primary =
                  client.contacts?.find((c) => c.primary) ??
                  client.contacts?.[0];
                return (
                  <tr
                    key={String(client._id)}
                    className="border-rule border-b last:border-0"
                  >
                    <Td className="text-13 font-mono">{client.code}</Td>
                    <Td>
                      <Link
                        href={`/clients/${client._id}`}
                        className="text-carbon font-medium hover:underline"
                      >
                        {client.tradeName || client.legalName}
                      </Link>
                      {client.tradeName && (
                        <>
                          <br />
                          <span className="text-13 text-ink-muted">
                            {client.legalName}
                          </span>
                        </>
                      )}
                    </Td>
                    <Td className="text-13">{client.entityType}</Td>
                    <Td className="text-13 font-mono">{client.pan || "—"}</Td>
                    <Td className="num text-13">
                      {client.gstins?.length
                        ? `${client.gstins.length} state${client.gstins.length > 1 ? "s" : ""}`
                        : "—"}
                    </Td>
                    <Td className="text-13 font-mono">
                      {branchCode.get(String(client.branchId)) ?? "—"}
                    </Td>
                    <Td className="text-13">
                      {primary ? (
                        <>
                          {primary.name}
                          {primary.mobile && (
                            <>
                              <br />
                              <span className="num text-ink-muted">
                                {primary.mobile}
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <StatusChip status={client.status} />
                    </Td>
                    <Td className="text-13">{client.risk}</Td>
                  </tr>
                );
              })}
              {clients.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="text-ink-muted px-3 py-10 text-center"
                  >
                    {search || status || entityType || risk
                      ? "No clients match those filters."
                      : "No clients yet. Add one, or import your existing list from Excel."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="text-14 flex items-center justify-between">
          <PageLink
            params={params}
            page={pageNumber - 1}
            disabled={pageNumber === 1}
          >
            ← Previous
          </PageLink>
          <span className="num text-13 text-ink-muted">
            Page {pageNumber} of {pages}
          </span>
          <PageLink
            params={params}
            page={pageNumber + 1}
            disabled={pageNumber >= pages}
          >
            Next →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

/** Colour is reserved for status, so an at-risk client is found at a glance. */
export function StatusChip({ status }) {
  const tone = {
    Lead: "border-carbon bg-carbon-wash text-carbon",
    Active: "border-filed bg-filed-wash text-filed",
    "On hold": "border-waiting bg-waiting-wash text-waiting",
    Inactive: "border-rule text-ink-muted",
    Closed: "border-rule text-ink-muted",
  }[status];
  return (
    <span className={`rounded-ledger text-13 border px-2 py-0.5 ${tone}`}>
      {status}
    </span>
  );
}

function Filter({ label, name, value, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

function PageLink({ params, page, disabled, children }) {
  if (disabled) return <span className="text-ink-muted">{children}</span>;
  const next = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  next.set("page", String(page));
  return (
    <Link href={`/clients?${next}`} className="text-carbon hover:underline">
      {children}
    </Link>
  );
}
