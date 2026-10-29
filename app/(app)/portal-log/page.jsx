import { redirect } from "next/navigation";
import { FirmWide } from "@/components/shell/ViewNote";
import Link from "next/link";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import ClientUser from "@/models/ClientUser";
import { ACTIONS } from "@/lib/audit";
import {
  groupByDay,
  quickFilters,
  recordTypes,
  todayFigures,
} from "@/lib/audit/log";
import { startOfISTDay, istParts } from "@/lib/dates";
import ActivityFeed from "@/components/audit/ActivityFeed";
import ChainCheck from "./ChainCheck";

export const metadata = { title: "Portal log · PHMG" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** Every action, with a readable name, for the filter dropdown. */
const ACTION_OPTIONS = Object.values(ACTIONS).map((value) => ({
  value,
  label: value.replace(/_/g, " "),
}));

/**
 * The firm-wide **Portal log** (spec section 11; renamed by owner decision
 * D8, which changed the words and the route and nothing underneath).
 *
 * Partners see everything; a CA sees their own branches, which is what
 * `branchFilter` adds to the query. Since P2-9 it also holds what clients
 * do in their own portal, so the Who filter offers portal accounts as well
 * as staff — otherwise half the new entries could not be filtered for.
 */
export default async function PortalLogPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "auditLog")) redirect("/issues");

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

  const dayStart = startOfISTDay(new Date());

  const [entries, total, staff, portal, seenTypes, today] = await Promise.all([
    AuditLog.find(query)
      .sort({ seq: -1 })
      .skip((pageNumber - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    AuditLog.countDocuments(query),
    User.find({}).select("name").sort({ name: 1 }).lean(),
    // the people on the other side of the portal (P2-9), who now appear in
    // this log as often as anybody
    ClientUser.find({}).select("name email").sort({ name: 1 }).lean(),
    // the record types the log actually holds, rather than a list typed out
    // in Step 2 and stale ever since
    AuditLog.distinct("entityType", scope ? query : {}),
    AuditLog.find({ ...query, ts: { $gte: dayStart } })
      .select("action")
      .limit(5000)
      .lean(),
  ]);

  const figures = todayFigures(today);
  const quick = quickFilters(actor.id);
  const days = groupByDay(entries);

  const search = (extra) => {
    const next = new URLSearchParams(
      Object.entries({ user, action, entityType, from, to }).filter(
        ([, v]) => v,
      ),
    );
    for (const [key, value] of Object.entries(extra)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return next.toString();
  };

  const exportHref = `/portal-log/export?${search({})}`;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Portal log
          </h1>
          <FirmWide />
          <p className="num text-13 text-ink-muted">
            {total.toLocaleString("en-IN")} {total === 1 ? "entry" : "entries"}
            {scope ? " in your branches" : " across the firm"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ChainCheck />
          <a
            href={exportHref}
            className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Export to Excel
          </a>
        </div>
      </div>

      {/* the five things worth noticing, each a link to the filter that
          produced it — a figure you cannot open is a nag */}
      <dl className="border-rule divide-rule flex flex-wrap divide-x border-y py-3">
        {figures.map((figure) => (
          <div key={figure.key} className="px-4 first:pl-0">
            <dt className="text-12 text-ink-muted uppercase">{figure.label}</dt>
            <dd className="text-20">
              {figure.value === 0 ? (
                <span className="num text-ink-muted">0</span>
              ) : (
                <Link
                  href={`/portal-log?${search({
                    ...figure.params,
                    from: todayInput(),
                  })}`}
                  className={`num font-medium ${figure.alarming ? "text-redpen" : ""}`}
                >
                  {figure.value.toLocaleString("en-IN")}
                </Link>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="text-14 flex flex-wrap gap-2">
        {quick.map((filter) => (
          <Link
            key={filter.key}
            href={`/portal-log?${new URLSearchParams(filter.params)}`}
            className="rounded-ledger border-rule hover:bg-carbon-wash border px-3 py-1"
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <form
        className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-6"
        method="get"
      >
        <Select label="Who" name="user" defaultValue={user}>
          <option value="">Anyone</option>
          <optgroup label="The firm">
            {staff.map((p) => (
              <option key={String(p._id)} value={String(p._id)}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {portal.length > 0 && (
            <optgroup label="Client portal">
              {portal.map((p) => (
                <option key={String(p._id)} value={String(p._id)}>
                  {p.name} ({p.email})
                </option>
              ))}
            </optgroup>
          )}
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
          {recordTypes(seenTypes).map((o) => (
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
            className="rounded-control border-rule bg-sunk text-14 text-ink h-9 border px-3 font-medium"
          >
            Filter
          </button>
          <a
            href="/portal-log"
            className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Clear
          </a>
        </div>
      </form>

      {days.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
          No entries match those filters.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* a log is read by date before anything else, so the days are
              ruled off rather than running together */}
          {days.map((day) => (
            <section key={day.key} className="flex flex-col gap-1">
              <h2 className="text-13 text-ink-muted border-rule border-b pb-1 font-medium">
                {day.label}
                <span className="num text-ink-muted ml-2">
                  {day.entries.length}
                </span>
              </h2>
              <div className="rounded-ledger border-rule bg-surface border px-4">
                <ActivityFeed
                  entries={day.entries.map((e) => ({
                    ...e,
                    _id: String(e._id),
                  }))}
                />
              </div>
            </section>
          ))}
        </div>
      )}

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

/** Today as a date input reads it, in IST. */
function todayInput() {
  const { year, month, day } = istParts(new Date());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
        className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
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
        className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
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
    <a href={`/portal-log?${next}`} className="text-carbon hover:underline">
      {children}
    </a>
  );
}
