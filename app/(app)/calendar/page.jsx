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
import DueDateRule from "@/models/DueDateRule";
import { formatISTDate, daysUntil, financialYearStart } from "@/lib/dates";
import { engagementQuery } from "@/lib/engagements/filter";
import { STATUSES } from "@/lib/engagements/status";
import { periodsInYear, buildGrid } from "@/lib/compliance/grid";
import ComplianceViews from "./ComplianceViews";

export const metadata = { title: "Compliance · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The firm's deadlines (spec section 8): a calendar of what is due, and the
 * grid that shows what was never filed.
 *
 * The calendar reuses the same query builder as the engagement list, so the
 * filters behave identically and a person's scope is applied the same way
 * in both places.
 */
export default async function CalendarPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) redirect("/today");

  const params = (await searchParams) ?? {};
  const view = params.view === "grid" ? "grid" : "calendar";

  await connectDB();
  const [branches, templates, team] = await Promise.all([
    Branch.find({}).select("code name").sort({ code: 1 }).lean(),
    ServiceTemplate.find({ active: true })
      .select("name code recurrence")
      .sort({ name: 1 })
      .lean(),
    User.find({ active: true }).select("name").sort({ name: 1 }).lean(),
  ]);

  const shared = {
    view,
    params: Object.fromEntries(
      Object.entries(params).filter(([, v]) => typeof v === "string"),
    ),
    branches: branches.map((b) => ({ id: String(b._id), code: b.code })),
    services: templates.map((t) => ({
      id: String(t._id),
      code: t.code,
      name: t.name,
      recurrence: t.recurrence,
    })),
    team: team.map((u) => ({ id: String(u._id), name: u.name })),
    statuses: STATUSES,
  };

  if (view === "grid") {
    return <GridView actor={actor} params={params} shared={shared} />;
  }

  // --- the calendar -------------------------------------------------------
  const query = engagementQuery(actor, params);
  const engagements = await Engagement.find(query)
    .sort({ statutoryDue: 1, internalDue: 1 })
    .limit(800)
    .lean();

  const clients = await Client.find({
    _id: { $in: engagements.map((e) => e.clientId) },
  })
    .select("legalName tradeName")
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
      service: e.templateSnapshot?.name ?? "",
      period: e.periodLabel || e.period,
      status: e.status,
      assignee: personName.get(String(e.assigneeId)) ?? "—",
      statutory: Boolean(e.statutoryDue),
      due: due ? formatISTDate(due) : null,
      dueISO: due ? new Date(due).toISOString().slice(0, 10) : null,
      dueDays: due ? daysUntil(due) : null,
    };
  });

  return <ComplianceViews {...shared} rows={rows} />;
}

/** Clients down the side, periods across the top (spec section 8). */
async function GridView({ actor, params, shared }) {
  const service =
    shared.services.find((s) => s.id === params.service) ??
    shared.services[0] ??
    null;

  const fyStart = Number(params.fy) || financialYearStart(new Date());

  if (!service) {
    return (
      <ComplianceViews
        {...shared}
        grid={null}
        gridService={null}
        fyStart={fyStart}
      />
    );
  }

  const periods = periodsInYear(service.recurrence, fyStart);
  const scope = branchFilter(actor, "engagementsWork") ?? {};

  const engagements = await Engagement.find({
    ...scope,
    serviceTemplateId: service.id,
    period: { $in: periods.map((p) => p.code) },
  })
    .select("clientId period status statutoryDue internalDue")
    .limit(5000)
    .lean();

  // the rows are the clients signed up for this service, plus anyone who
  // already has work on it — so a client nobody subscribed still shows
  const ClientService = (await import("@/models/ClientService")).default;
  const subscriptions = await ClientService.find({
    serviceTemplateId: service.id,
    active: true,
  })
    .select("clientId")
    .lean();

  const clientIds = [
    ...new Set([
      ...subscriptions.map((s) => String(s.clientId)),
      ...engagements.map((e) => String(e.clientId)),
    ]),
  ];

  const clients = await Client.find({
    _id: { $in: clientIds },
    ...(scope.branchId ? { branchId: scope.branchId } : {}),
  })
    .select("legalName tradeName code")
    .sort({ legalName: 1 })
    .limit(500)
    .lean();

  const grid = buildGrid({
    clients: clients.map((c) => ({
      id: String(c._id),
      name: c.tradeName || c.legalName,
      code: c.code,
    })),
    engagements,
    periods,
  });

  return (
    <ComplianceViews
      {...shared}
      grid={{
        ...grid,
        periods: periods.map((p) => ({ code: p.code, short: p.short })),
      }}
      gridService={service}
      fyStart={fyStart}
    />
  );
}
