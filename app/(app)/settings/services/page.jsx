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
import SettingsScreen from "../Shell";

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
    /**
     * Documents still attached to the whole job rather than to a step.
     *
     * The signal worth surfacing since a checklist can be divided by step
     * (03-11-2026): these are the services nobody has divided up yet, and
     * every one of their documents lands on step one. Not an error — an
     * item can legitimately belong to the whole job — but on a service
     * with seven steps and fourteen undivided documents it is a to-do.
     */
    looseItems: (t.checklist ?? []).filter(
      (c) => !Number.isInteger(c.stepIndex),
    ).length,
    version: t.version ?? 1,
    active: t.active !== false,
  }));

  const categories = SERVICE_CATEGORIES.filter((c) =>
    rows.some((r) => r.category === c),
  );


  
  return (
    <SettingsScreen
      wide
      title="Services"
      sub={
        <>
          <span className="num">{rows.length}</span>{" "}
          {rows.length === 1 ? "service" : "services"} · every job in the system
          is created from one of these
          {editable ? "" : " · only a partner can change them"}
        </>
      }
      actions={
        editable && (
          <Link
            href="/settings/services/new"
            className="rounded-control bg-carbon text-14 text-on-carbon hover:bg-carbon-ink flex h-9 items-center px-3 font-medium"
          >
            New service
          </Link>
        )
      }
    >
      <FirmWide />

      {/*
        The missing-SAC banner used to live here, as a sentence that named
        no service and led nowhere. It is a counted filter in the toolbar
        now: the same fact, and clicking it shows you which ones.
      */}
      <CatalogList
        rows={rows}
        categories={categories}
        editable={editable}
        showArchived={showArchived}
      />
    </SettingsScreen>
  );
}
