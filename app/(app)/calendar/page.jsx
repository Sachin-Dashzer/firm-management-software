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
import ClientService from "@/models/ClientService";
import {
  formatISTDate,
  daysUntil,
  financialYearStart,
  istInputDate,
} from "@/lib/dates";
import { engagementQuery } from "@/lib/engagements/filter";
import { clientListFilter } from "@/lib/access/clientAccess";
import { STATUSES } from "@/lib/engagements/status";
import { periodsInYear, buildGrid } from "@/lib/compliance/grid";
import { buildHeads } from "@/lib/compliance/heads";
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
  /**
   * Three ways in. "Heads" is the one the screen opens on: a partner wants
   * to know where GST, TDS and ITR stand before they want to know which
   * client missed August.
   */
  const view = ["grid", "calendar"].includes(params.view)
    ? params.view
    : "heads";

  await connectDB();
  const [branches, templates, team, partners] = await Promise.all([
    Branch.find({}).select("code name").sort({ code: 1 }).lean(),
    ServiceTemplate.find({ active: true })
      .select("name code category recurrence")
      .sort({ name: 1 })
      .lean(),
    User.find({ active: true }).select("name").sort({ name: 1 }).lean(),
    User.find({ active: true, role: { $in: ["ca", "partner"] } })
      .select("name role")
      .sort({ name: 1 })
      .lean(),
  ]);

  /**
   * The partner filter: the client partner named on the client record, not
   * the person doing the work. "Which of my clients is behind on GST" is a
   * question about whose clients they are.
   *
   * Resolved to client ids here, with the client scope applied, exactly as
   * the group filter on the engagement list is — so the filter can never
   * widen what somebody may see.
   */
  const partner = typeof params.partner === "string" ? params.partner : "";
  const partnerClientIds = partner
    ? (
        await Client.find({
          ...(await clientListFilter(actor)),
          clientPartnerId: partner,
        })
          .select("_id")
          .lean()
      ).map((c) => String(c._id))
    : null;

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
      category: t.category,
      recurrence: t.recurrence,
    })),
    team: team.map((u) => ({ id: String(u._id), name: u.name })),
    partners: partners.map((u) => ({
      id: String(u._id),
      name: `${u.name} · ${u.role === "partner" ? "Partner" : "CA"}`,
    })),
    statuses: STATUSES,
  };

  if (view === "heads") {
    return (
      <HeadsView
        actor={actor}
        params={params}
        shared={shared}
        clientIds={partnerClientIds}
      />
    );
  }

  if (view === "grid") {
    return (
      <GridView
        actor={actor}
        params={params}
        shared={shared}
        clientIds={partnerClientIds}
      />
    );
  }

  // --- the calendar -------------------------------------------------------
  const query = engagementQuery(actor, {
    ...params,
    ...(partnerClientIds ? { clientIds: partnerClientIds } : {}),
  });
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
      dueISO: due ? istInputDate(due) : null,
      dueDays: due ? daysUntil(due) : null,
    };
  });

  return <ComplianceViews {...shared} rows={rows} />;
}

/**
 * Where each head of compliance stands: GST, TDS, ITR, audit, ROC — one
 * line per service, under the category it belongs to, for one financial
 * year.
 *
 * ponytail: the year's engagements are read and counted in memory rather
 * than aggregated in MongoDB. The scope filters hold string ids, which
 * `find()` casts and an aggregation pipeline would not — a `$match` on them
 * would quietly match nothing and show a clean sheet to a CA who has work
 * outstanding. Worth turning into a pipeline the day the firm's year does
 * not fit in one read, and only with the ids cast properly.
 */
async function HeadsView({ actor, params, shared, clientIds }) {
  const fyStart = Number(params.fy) || financialYearStart(new Date());
  const scope = branchFilter(actor, "engagementsWork") ?? {};

  /**
   * Every period code this financial year can hold, across the recurrences
   * the catalog actually uses — about twenty strings. Matching on the codes
   * rather than on a date range is the same thing the grid does, and does
   * not depend on `periodStart`, which older rows may never have been given.
   */
  const codes = [
    ...new Set(
      [...new Set(shared.services.map((s) => s.recurrence))].flatMap((r) =>
        periodsInYear(r, fyStart).map((p) => p.code),
      ),
    ),
  ];

  const [engagements, subscriptions] = await Promise.all([
    Engagement.find({
      ...scope,
      ...(clientIds ? { clientId: { $in: clientIds } } : {}),
      period: { $in: codes },
    })
      .select("serviceTemplateId clientId status statutoryDue internalDue")
      .limit(20000)
      .lean(),
    ClientService.find({
      active: true,
      ...(clientIds ? { clientId: { $in: clientIds } } : {}),
    })
      .select("clientId serviceTemplateId")
      .lean(),
  ]);

  const subscribers = new Map();
  for (const row of subscriptions) {
    const key = String(row.serviceTemplateId);
    subscribers.set(key, (subscribers.get(key) ?? 0) + 1);
  }

  const heads = buildHeads({
    services: shared.services,
    engagements,
    subscribers,
    fyStart,
  });

  return <ComplianceViews {...shared} heads={heads} fyStart={fyStart} />;
}

/** Clients down the side, periods across the top (spec section 8). */
async function GridView({ actor, params, shared, clientIds }) {
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
    ...(clientIds ? { clientId: { $in: clientIds } } : {}),
    serviceTemplateId: service.id,
    period: { $in: periods.map((p) => p.code) },
  })
    .select("clientId period status statutoryDue internalDue")
    .limit(5000)
    .lean();

  // the rows are the clients signed up for this service, plus anyone who
  // already has work on it — so a client nobody subscribed still shows
  const subscriptions = await ClientService.find({
    serviceTemplateId: service.id,
    active: true,
    ...(clientIds ? { clientId: { $in: clientIds } } : {}),
  })
    .select("clientId")
    .lean();

  const rowClientIds = [
    ...new Set([
      ...subscriptions.map((s) => String(s.clientId)),
      ...engagements.map((e) => String(e.clientId)),
    ]),
  ];

  const clients = await Client.find({
    _id: { $in: rowClientIds },
    ...(scope.branchId ? { branchId: scope.branchId } : {}),
  })
    .select("legalName tradeName code clientPartnerId")
    .sort({ legalName: 1 })
    .limit(500)
    .lean();

  const partnerName = new Map(
    shared.partners.map((p) => [p.id, p.name.split(" · ")[0]]),
  );

  const grid = buildGrid({
    clients: clients.map((c) => ({
      id: String(c._id),
      name: c.tradeName || c.legalName,
      code: c.code,
      note: c.clientPartnerId
        ? (partnerName.get(String(c.clientPartnerId)) ?? "")
        : "No client partner",
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
