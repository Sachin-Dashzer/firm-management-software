import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import { ACTIONS } from "@/lib/audit";
import ActivityFeed from "@/components/audit/ActivityFeed";
import ChainCheck from "./ChainCheck";

export const metadata = { title: "Audit log · PHMG" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** Every action, with a readable name, for the filter dropdown. */
const ACTION_OPTIONS = Object.values(ACTIONS).map((value) => ({
  value,
  label: value.replace(/_/g, " "),
}));

const ENTITY_OPTIONS = [
  "Client",
  "Engagement",
  "Invoice",
  "Payment",
  "Document",
  "User",
  "Branch",
];

/**
 * The firm-wide audit log (spec section 11). Partners see everything; a CA
 * sees their own branches, which is what `branchFilter` adds to the query.
 */
export default async function AuditPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "auditLog")) redirect("/today");

  const params = await searchParams;
  const { user, action, entityType, from, to, page = "1" } = params ?? {};
  const pageNumber = Math.max(1, Number(page) || 1);

  await connectDB();

  /** @type {Record<string, unknown>} */
  const query = {};
  const scope = branchFilter(actor, "auditLog");
  if (scope) {
    // entries with no branch (system jobs, logins) stay visible to partners
    // only, so a CA sees their branches and nothing else
    query.branchId = { $in: actor.branchIds };
  }
  if (user) query.userId = user;
  if (action) query.action = action;
  if (entityType) query.entityType = entityType;
  if (from || to) {
    query.ts = {};
    if (from) query.ts.$gte = new Date(`${from}T00:00:00+05:30`);
    if (to) query.ts.$lte = new Date(`${to}T23:59:59+05:30`);
  }

  const [entries, total, people] = await Promise.all([
    AuditLog.find(query)
      .sort({ seq: -1 })
      .skip((pageNumber - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    AuditLog.countDocuments(query),
    User.find({}).select("name").sort({ name: 1 }).lean(),
  ]);

  const exportHref = `/audit/export?${new URLSearchParams(
    Object.entries({ user, action, entityType, from, to }).filter(([, v]) => v),
  )}`;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-28 font-semibold">Audit log</h1>
          <p className="num text-13 text-ink-muted">
            {total.toLocaleString("en-IN")} {total === 1 ? "entry" : "entries"}
            {scope ? " in your branches" : " across the firm"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ChainCheck />
          <a
            href={exportHref}
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Export to Excel
          </a>
        </div>
      </div>

      <form
        className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-6"
        method="get"
      >
        <Select label="Who" name="user" defaultValue={user}>
          <option value="">Anyone</option>
          {people.map((p) => (
            <option key={String(p._id)} value={String(p._id)}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select label="Action" name="action" defaultValue={action}>
          <option value="">Any action</option>
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select label="Record type" name="entityType" defaultValue={entityType}>
          <option value="">Anything</option>
          {ENTITY_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        <Input label="From" name="from" type="date" defaultValue={from} />
        <Input label="To" name="to" type="date" defaultValue={to} />
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
          >
            Filter
          </button>
          <a
            href="/audit"
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Clear
          </a>
        </div>
      </form>

      <div className="rounded-ledger border-rule bg-surface border px-4">
        <ActivityFeed
          entries={entries.map((e) => ({ ...e, _id: String(e._id) }))}
          emptyMessage="No entries match those filters."
        />
      </div>

      {total > PAGE_SIZE && (
        <nav className="text-14 flex items-center justify-between">
          <PageLink
            params={params}
            page={pageNumber - 1}
            disabled={pageNumber === 1}
          >
            ← Newer
          </PageLink>
          <span className="num text-13 text-ink-muted">
            Page {pageNumber} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <PageLink
            params={params}
            page={pageNumber + 1}
            disabled={pageNumber * PAGE_SIZE >= total}
          >
            Older →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      {children}
    </label>
  );
}

function Select({ label, name, defaultValue, children }) {
  return (
    <Field label={label}>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
      >
        {children}
      </select>
    </Field>
  );
}

function Input({ label, name, type, defaultValue }) {
  return (
    <Field label={label}>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
      />
    </Field>
  );
}

function PageLink({ params, page, disabled, children }) {
  if (disabled) {
    return <span className="text-ink-muted">{children}</span>;
  }
  const next = new URLSearchParams(
    Object.entries(params ?? {}).filter(([, v]) => v),
  );
  next.set("page", String(page));
  return (
    <a href={`/audit?${next}`} className="text-carbon hover:underline">
      {children}
    </a>
  );
}
