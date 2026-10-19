import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import User from "@/models/User";
import ServiceTemplate from "@/models/ServiceTemplate";
import { formatISTDate, daysUntil } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { PRIORITIES, STATUSES } from "@/lib/engagements/status";
import { engagementQuery } from "@/lib/engagements/filter";
import EngagementViews from "./EngagementViews";
import SavedViews from "@/components/reports/SavedViews";
import { listViews } from "../reports/views";

export const metadata = { title: "Engagements · PHMG" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function EngagementsPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) redirect("/today");

  const params = (await searchParams) ?? {};
  const view = ["board", "calendar"].includes(params.view)
    ? params.view
    : "list";
  const pageNumber = Math.max(1, Number(params.page) || 1);
  const search = String(params.q ?? "").trim();

  await connectDB();

  const query = engagementQuery(actor, params);

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const loose = new RegExp(escaped, "i");
    const matching = await Client.find({
      $or: [{ legalName: loose }, { tradeName: loose }, { code: loose }],
    })
      .select("_id")
      .limit(500)
      .lean();
    query.$and = [
      ...(query.$and ?? []),
      {
        $or: [
          { code: loose },
          { clientId: { $in: matching.map((c) => c._id) } },
        ],
      },
    ];
  }

  // the board and the calendar want the whole filtered set, not one page
  const limit = view === "list" ? PAGE_SIZE : 500;
  const skip = view === "list" ? (pageNumber - 1) * PAGE_SIZE : 0;

  const [engagements, total, branches, templates, team] = await Promise.all([
    Engagement.find(query)
      .sort({ statutoryDue: 1, internalDue: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Engagement.countDocuments(query),
    Branch.find({}).select("code name").sort({ code: 1 }).lean(),
    ServiceTemplate.find({}).select("name code").sort({ name: 1 }).lean(),
    User.find({ active: true }).select("name role").sort({ name: 1 }).lean(),
  ]);

  const clients = await Client.find({
    _id: { $in: engagements.map((e) => e.clientId) },
  })
    .select("legalName tradeName code")
    .lean();

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const personName = new Map(team.map((u) => [String(u._id), u.name]));

  const rows = engagements.map((e) => {
    const due = e.statutoryDue ?? e.internalDue;
    return {
      id: String(e._id),
      code: e.code,
      client: clientName.get(String(e.clientId)) ?? "Client",
      clientId: String(e.clientId),
      service: e.templateSnapshot?.name ?? "—",
      period: e.periodLabel || e.period,
      status: e.status,
      priority: e.priority,
      assignee: personName.get(String(e.assigneeId)) ?? "—",
      reviewer: personName.get(String(e.reviewerId)) ?? "—",
      fee: formatPaise(e.feePaise ?? 0),
      billingStatus: e.billingStatus,
      dueKind: e.statutoryDue ? "Statutory" : "Internal",
      due: due ? formatISTDate(due) : null,
      dueISO: due ? new Date(due).toISOString().slice(0, 10) : null,
      dueDays: due ? daysUntil(due) : null,
    };
  });

  const periods = [
    ...new Set(engagements.map((e) => e.period).filter(Boolean)),
  ].sort((a, b) => b.localeCompare(a));

  const exportParams = new URLSearchParams(
    Object.entries(params).filter(
      ([key, value]) => value && key !== "view" && key !== "page",
    ),
  );

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-28 font-semibold">Engagements</h1>
          <p className="num text-13 text-ink-muted">
            {total.toLocaleString("en-IN")} {total === 1 ? "job" : "jobs"}
            {params.closed ? " including closed" : " open"}
            {search ? ` matching “${search}”` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/engagements/export?${exportParams}`}
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Export to Excel
          </a>
          {can(actor, "edit", "engagementsCreate") && (
            <Link
              href="/engagements/new"
              className="rounded-ledger bg-carbon text-14 h-9 px-3 leading-9 font-medium text-white"
            >
              New engagement
            </Link>
          )}
        </div>
      </div>

      <form
        method="get"
        className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input type="hidden" name="view" value={view} />
        <label className="flex flex-col gap-1 lg:col-span-2">
          <span className="text-13 text-ink-muted font-medium">
            Client or engagement code
          </span>
          <input
            name="q"
            defaultValue={search}
            placeholder="ABC Traders, NOI-GSTR3B-…"
            className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>
        <Filter
          label="Status"
          name="status"
          value={params.status}
          options={STATUSES.map((s) => [s, s])}
        />
        <Filter
          label="Service"
          name="service"
          value={params.service}
          options={templates.map((t) => [String(t._id), t.name])}
        />
        <Filter
          label="Period"
          name="period"
          value={params.period}
          options={periods.map((p) => [p, p])}
        />
        <Filter
          label="Due"
          name="due"
          value={params.due}
          options={[
            ["overdue", "Overdue"],
            ["today", "Today"],
            ["week", "Next 7 days"],
            ["month", "Next 30 days"],
          ]}
        />
        <Filter
          label="Priority"
          name="priority"
          value={params.priority}
          options={PRIORITIES.map((p) => [p, p])}
        />
        <Filter
          label="Branch"
          name="branch"
          value={params.branch}
          options={branches.map((b) => [String(b._id), b.code])}
        />
        <Filter
          label="Assignee"
          name="assignee"
          value={params.assignee}
          options={team.map((u) => [String(u._id), u.name])}
        />
        <div className="flex flex-wrap items-end gap-3 lg:col-span-2">
          <label className="text-13 flex items-center gap-2">
            <input
              type="checkbox"
              name="mine"
              value="1"
              defaultChecked={Boolean(params.mine)}
            />
            Only mine
          </label>
          <label className="text-13 flex items-center gap-2">
            <input
              type="checkbox"
              name="closed"
              value="1"
              defaultChecked={Boolean(params.closed)}
            />
            Include closed
          </label>
          <button
            type="submit"
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
          >
            Filter
          </button>
          <Link
            href="/engagements"
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Clear
          </Link>
        </div>
      </form>

      <SavedViews
        reportKey="engagements"
        base="/engagements"
        views={await listViews(actor, "engagements")}
        search={exportParams.toString()}
        canShare={actor.role === "partner"}
      />

      <EngagementViews
        view={view}
        rows={rows}
        total={total}
        page={pageNumber}
        pageSize={PAGE_SIZE}
        showingAll={view !== "list"}
        mayManage={can(actor, "edit", "engagementsCreate")}
        team={team.map((u) => ({
          id: String(u._id),
          name: u.name,
          role: u.role,
        }))}
        params={Object.fromEntries(
          Object.entries(params).filter(([, v]) => typeof v === "string"),
        )}
      />
    </div>
  );
}

function Filter({ label, name, value = "", options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
      >
        <option value="">Any</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
