import Link from "next/link";
import { FirmWide } from "@/components/shell/ViewNote";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import ServiceTemplate from "@/models/ServiceTemplate";
import { formatPaise } from "@/lib/money";
import {
  RECURRENCE_LABELS,
  SERVICE_CATEGORIES,
  turnaroundLabel,
} from "@/lib/services/catalog";
import CatalogList from "./CatalogList";

export const metadata = { title: "Services · PHMG" };

/**
 * The catalog. Everyone may read it — the team needs to know what a service
 * involves — but only a Partner may change it (spec section 2).
 */
export default async function ServicesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "serviceCatalog")) redirect("/issues");
  const editable = can(actor, "edit", "serviceCatalog");

  const params = await searchParams;
  const showArchived = params?.archived === "1";

  await connectDB();
  const templates = await ServiceTemplate.find(
    showArchived ? {} : { active: true },
  )
    .sort({ category: 1, name: 1 })
    .lean();

  const rows = templates.map((t) => ({
    id: String(t._id),
    name: t.name,
    code: t.code,
    category: t.category,
    level: t.level,
    // steps that ask for more than the service does, so the list can say so
    strictSteps: (t.steps ?? []).filter((s) => s.minRole).length,
    recurrence: RECURRENCE_LABELS[t.recurrence] ?? t.recurrence,
    turnaround: turnaroundLabel(t),
    fee: t.defaultFeePaise ? formatPaise(t.defaultFeePaise) : "Not set",
    sac: t.sac || "",
    udinRequired: Boolean(t.udinRequired),
    checklistCount: (t.checklist ?? []).length,
    stepCount: (t.steps ?? []).length,
    version: t.version ?? 1,
    active: t.active !== false,
  }));

  const categories = SERVICE_CATEGORIES.filter((c) =>
    rows.some((r) => r.category === c),
  );

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Services
          </h1>
          <p className="text-13 text-ink-muted">
            {rows.length} {rows.length === 1 ? "service" : "services"} · every
            engagement is created from one of these
            {editable ? "" : " · only a partner can change them"}
          </p>
          <FirmWide />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={showArchived ? "/settings/services" : "?archived=1"}
            className="text-13 text-ink-muted underline underline-offset-4"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
          {editable && (
            <Link
              href="/settings/services/new"
              className="rounded-control bg-carbon text-14 text-on-carbon flex h-9 items-center px-3 font-medium"
            >
              Add a service
            </Link>
          )}
        </div>
      </div>

      {rows.some((r) => !r.sac) && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          Some services have no SAC code yet. A SAC code goes on the GST
          invoice, so fill them in before billing that service.
        </p>
      )}

      <CatalogList rows={rows} categories={categories} editable={editable} />
    </div>
  );
}
