import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { scopedByClient } from "@/lib/access/clientAccess";
import { clientIdsInGroup } from "@/lib/groups/summary";
import { connectDB } from "@/lib/db";
import DocumentModel from "@/models/Document";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import ServiceTemplate from "@/models/ServiceTemplate";
import ClientGroup from "@/models/ClientGroup";
import User from "@/models/User";
import SavedView from "@/models/SavedView";
import { formatISTDate, daysUntil, financialYearLabel } from "@/lib/dates";
import {
  documentQuery,
  searchClause,
  locationOf,
  FILE_KINDS,
  LOCATIONS,
} from "@/lib/documents/filter";
import { urlFor } from "@/lib/folders/paths";
import SavedViews from "@/components/reports/SavedViews";
import FilterBar from "@/components/ui/FilterBar";
import PageHead from "@/components/ui/PageHead";
import ViewNav from "@/components/documents/ViewNav";
import { pendingFromClients } from "./requests";
import FileTable from "./FileTable";

export const metadata = { title: "Documents · PHMG" };
export const dynamic = "force-dynamic";

/** One page of the register. Fifty is what fits a laptop without scrolling far. */
const PAGE = 50;

/**
 * Every file the firm holds, as a register (spec section 6, P3-48e).
 *
 * The same records the work drive shows as folders, read the other way
 * round — because the two questions are different. A drive answers "where
 * did we put the April statements"; a register answers "what have we got
 * for this client, what of it has the client seen, and what is over 5 MB
 * and eight years old".
 *
 * Every filter is in the URL, so a view is a bookmark and a saved view is
 * just that URL with a name. `documentQuery` builds the query, and the
 * Excel export calls the same function — so what you see is what you
 * download.
 */
export default async function DocumentsPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "documents")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const tab = params.tab === "pending" ? "pending" : "search";
  const search = String(params.q ?? "").trim();
  const page = Math.max(1, Number(params.page) || 1);

  await connectDB();
  /**
   * The firm-wide file search was scoped by branch alone, which for an
   * employee or an intern meant every document name in their office — the
   * client list they are not allowed to see, spelled out in file names.
   * Scoped by client now, through the same filter as `/clients`.
   */
  const scope = await scopedByClient(actor, "clientId");

  if (tab === "pending") {
    const rows = await pendingFromClients(actor, scope);
    const only = String(params.overdue ?? "") === "1";
    const shown = only
      ? rows.filter((r) => daysUntil(r.internalDue) < 0)
      : rows;

    return (
      <Shell tab={tab} search={search} actor={actor}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-13 text-ink-muted">
            {shown.length} {shown.length === 1 ? "job is" : "jobs are"} waiting
            on documents from a client.
          </p>
          <Link
            href={`/documents?tab=pending${only ? "" : "&overdue=1"}`}
            className={`rounded-control text-13 h-8 border px-3 leading-8 ${
              only ? "border-carbon bg-carbon-wash text-carbon" : "border-rule"
            }`}
          >
            Overdue only
          </Link>
        </div>

        <div className="rounded-table border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-11 text-ink-muted border-b text-left tracking-wide uppercase">
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Work</th>
                <th className="px-3 py-2 font-medium">Waiting for</th>
                <th className="px-3 py-2 font-medium">Internal due</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-rule border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/engagements/${r.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {r.client}
                    </Link>
                    <br />
                    <span className="text-13 text-ink-muted font-mono">
                      {r.code}
                    </span>
                  </td>
                  <td className="text-13 px-3 py-2">
                    {r.service} · {r.period}
                  </td>
                  <td className="text-13 px-3 py-2">
                    {r.waitingFor.join(", ")}
                  </td>
                  <td className="num text-13 px-3 py-2">
                    {r.internalDue ? (
                      <>
                        {formatISTDate(r.internalDue)}
                        {daysUntil(r.internalDue) < 0 && (
                          <span className="text-redpen"> · overdue</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                    <br />
                    <Link
                      href={`/engagements/${r.id}?tab=files`}
                      className="text-13 underline underline-offset-4"
                    >
                      Ask again
                    </Link>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="text-ink-muted px-3 py-6 text-center"
                  >
                    Nothing is outstanding from any client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Shell>
    );
  }

  // --- the register -------------------------------------------------------

  const clientIds = params.group
    ? await clientIdsInGroup(actor, params.group)
    : null;

  const { query, applied } = documentQuery(actor, params, {
    scope,
    ...(clientIds ? { clientIds } : {}),
  });

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const loose = new RegExp(escaped, "i");
    const [clients, jobs] = await Promise.all([
      Client.find({
        $or: [{ legalName: loose }, { tradeName: loose }, { code: loose }],
      })
        .select("_id")
        .limit(500)
        .lean(),
      Engagement.find({ code: loose }).select("_id").limit(500).lean(),
    ]);
    query.$or = searchClause(loose, {
      clientIds: clients.map((c) => c._id),
      engagementIds: jobs.map((e) => e._id),
    });
  }

  const [total, documents, summary] = await Promise.all([
    DocumentModel.countDocuments(query),
    DocumentModel.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE)
      .limit(PAGE)
      .lean(),
    summaryOf(query),
  ]);

  const [clients, engagements, services, groups, people, years, kinds, views] =
    await Promise.all([
      Client.find({ _id: { $in: documents.map((d) => d.clientId) } })
        .select("legalName tradeName")
        .lean(),
      Engagement.find({
        _id: { $in: documents.map((d) => d.engagementId).filter(Boolean) },
      })
        .select(
          "code templateSnapshot periodLabel period serviceTemplateId clientId periodStart createdAt",
        )
        .lean(),
      ServiceTemplate.find({}).select("name").sort({ name: 1 }).lean(),
      ClientGroup.find({}).select("name").sort({ name: 1 }).lean(),
      User.find({ active: true }).select("name").sort({ name: 1 }).lean(),
      DocumentModel.distinct("fy", { ...(scope ?? {}) }),
      DocumentModel.distinct("kind", { ...(scope ?? {}) }),
      // the model calls it `screen`, which is what every other list saves
      SavedView.find({
        screen: "documents",
        $or: [{ ownerId: actor.id }, { shared: true }],
      })
        .sort({ name: 1 })
        .lean(),
    ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const jobOf = new Map(engagements.map((e) => [String(e._id), e]));

  const rows = documents.map((d) => {
    const job = jobOf.get(String(d.engagementId));
    return {
      id: String(d._id),
      name: d.name,
      kind: (d.kind ?? "").trim(),
      mime: d.mime,
      size: d.size ?? 0,
      client: clientName.get(String(d.clientId)) ?? "Client",
      clientId: String(d.clientId),
      where: locationOf(d, job),
      folderHref: urlFor({
        zone: "client",
        route: "clients",
        clientId: d.clientId,
        serviceTemplateId: d.serviceTemplateId ?? job?.serviceTemplateId,
        fy: d.fy,
        engagementId: d.engagementId,
        permanent: d.isPermanent,
      }),
      /*
        A file put on a job before the year was recorded on it still belongs
        to the job's year, and the register is where somebody looks for it.
        The job's own year is used when the file carries none.
      */
      fy: d.fy || fyOf(job),
      origin: d.origin === "firm" ? "firm" : "client",
      shared: Boolean(d.sharedWithClient),
      redacted: Boolean(d.redactedAt),
      versions: (d.versions ?? []).length,
      versionList: (d.versions ?? []).map((v) => ({
        id: String(v._id),
        size: v.size ?? 0,
        at: v.uploadedAt ? formatISTDate(v.uploadedAt) : "",
      })),
      uploadedByName: d.uploadedByName ?? "",
      added: formatISTDate(d.createdAt),
    };
  });

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const url = (over) => {
    const next = new URLSearchParams(
      Object.entries({ ...params, ...over }).filter(([, v]) => v),
    );
    return `/documents?${next.toString()}`;
  };

  return (
    <Shell tab={tab} search={search} actor={actor}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Fact value={total} label={total === 1 ? "file" : "files"} />
        <Fact value={gb(summary.bytes)} label="in all" />
        <Fact value={summary.week} label="added this week" />
        <Fact value={summary.shared} label="shared with clients" />
        <Link
          href="/documents?tab=pending"
          className="text-13 underline underline-offset-4"
        >
          awaited from clients
        </Link>
        <Link
          href={`/documents/export?${new URLSearchParams(
            Object.entries(params).filter(([, v]) => v),
          ).toString()}`}
          className="rounded-control border-rule hover:bg-sunk text-13 ml-auto h-8 border px-3 leading-8"
        >
          Export to Excel
        </Link>
      </div>

      <FilterBar
        action="/documents"
        label="Search the files"
        placeholder="A file, a client, a job code"
        value={search}
        active={applied.length > 0}
        extraCount={applied.length}
      >
        <Pick name="client" label="Client" value={params.client} options={[]} />
        <Pick
          name="group"
          label="Client group"
          value={params.group}
          options={groups.map((g) => [String(g._id), g.name])}
        />
        <Pick
          name="service"
          label="Service"
          value={params.service}
          options={services.map((s) => [String(s._id), s.name])}
        />
        <Pick
          name="fy"
          label="Financial year"
          value={params.fy}
          options={years
            .filter(Boolean)
            .sort()
            .reverse()
            .map((y) => [y, y])}
        />
        <Pick
          name="where"
          label="Where it sits"
          value={params.where}
          options={[
            ["permanent", LOCATIONS.permanent],
            ["job", LOCATIONS.job],
            ["loose", LOCATIONS.loose],
          ]}
        />
        <Pick
          name="origin"
          label="Whose paper"
          value={params.origin}
          options={[
            ["client", "From the client"],
            ["firm", "Issued by us"],
          ]}
        />
        <Pick
          name="type"
          label="Kind of file"
          value={params.type}
          options={Object.entries(FILE_KINDS).map(([key, f]) => [key, f.label])}
        />
        <Pick
          name="kind"
          label="What it is"
          value={params.kind}
          options={kinds
            .filter(Boolean)
            .sort()
            .map((k) => [k, k])}
        />
        <Pick
          name="by"
          label="Put up by"
          value={params.by}
          options={people.map((u) => [String(u._id), u.name])}
        />
        <Pick
          name="shared"
          label="Shared with the client"
          value={params.shared}
          options={[
            ["yes", "Shared"],
            ["no", "Not shared"],
          ]}
        />
        <label className="flex flex-col gap-1">
          <span className="text-12 text-ink-muted">Added from</span>
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            className="rounded-control border-rule bg-paper text-13 h-8 border px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-12 text-ink-muted">Added to</span>
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            className="rounded-control border-rule bg-paper text-13 h-8 border px-2"
          />
        </label>
        <label className="text-13 flex items-center gap-2">
          <input
            type="checkbox"
            name="versions"
            value="1"
            defaultChecked={Boolean(params.versions)}
          />
          Has earlier copies
        </label>
        <label className="text-13 flex items-center gap-2">
          <input
            type="checkbox"
            name="big"
            value="1"
            defaultChecked={Boolean(params.big)}
          />
          Over 5 MB
        </label>
      </FilterBar>

      <SavedViews
        reportKey="documents"
        views={views.map((v) => ({
          id: String(v._id),
          name: v.name,
          search: v.search,
          shared: v.shared,
        }))}
        search={new URLSearchParams(
          Object.entries(params).filter(([, v]) => v),
        ).toString()}
        canShare={can(actor, "edit", "dashboards")}
        base="/documents"
      />

      <FileTable
        rows={rows}
        mayEdit={can(actor, "edit", "documents")}
        mayShare={["ca", "partner"].includes(actor.role)}
      />

      {pages > 1 && (
        <nav
          aria-label="More files"
          className="text-13 flex items-center justify-between gap-3"
        >
          <span className="text-ink-muted num">
            Page {page} of {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link
                href={url({ page: page - 1 })}
                className="rounded-control border-rule hover:bg-sunk h-8 border px-3 leading-8"
              >
                Back
              </Link>
            )}
            {page < pages && (
              <Link
                href={url({ page: page + 1 })}
                className="rounded-control border-rule hover:bg-sunk h-8 border px-3 leading-8"
              >
                More
              </Link>
            )}
          </span>
        </nav>
      )}
    </Shell>
  );
}

/** The strip above the table: what this filter actually holds. */
async function summaryOf(query) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [row] = await DocumentModel.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        bytes: { $sum: "$size" },
        week: {
          $sum: { $cond: [{ $gte: ["$createdAt", weekAgo] }, 1, 0] },
        },
        shared: { $sum: { $cond: ["$sharedWithClient", 1, 0] } },
      },
    },
  ]);
  return {
    bytes: row?.bytes ?? 0,
    week: row?.week ?? 0,
    shared: row?.shared ?? 0,
  };
}

function Fact({ value, label }) {
  return (
    <span className="text-13">
      <span className="num font-semibold">{value}</span>{" "}
      <span className="text-ink-muted">{label}</span>
    </span>
  );
}

function Pick({ name, label, value, options }) {
  if (options.length === 0) return null;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-12 text-ink-muted">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="rounded-control border-rule bg-paper text-13 h-8 border px-1.5"
      >
        <option value="">Any</option>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The financial year a job falls in, for a file that carries none. */
function fyOf(job) {
  if (!job) return "";
  const when = job.periodStart ?? job.createdAt;
  return when ? `FY${financialYearLabel(new Date(when))}` : "";
}

function gb(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function Shell({ tab, search, actor, children }) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap- p-4 md:p-6">
      <PageHead
        title="Documents"
        sub="Every file the firm holds, and everything still to come in."
      >
        <ViewNav
          tab={tab}
          search={search}
          mayPurge={can(actor, "approve", "deleteRecord")}
        />
      </PageHead>

      {children}
    </div>
  );
}
