import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import ServiceTemplate from "@/models/ServiceTemplate";
import ServiceForm from "../ServiceForm";
import SettingsScreen from "../../Shell";

export const metadata = { title: "Edit service · PHMG" };

export default async function EditServicePage({ params }) {
  const actor = await requireUser();
  if (!can(actor, "edit", "serviceCatalog")) redirect("/settings/services");

  const { id } = await params;
  await connectDB();
  const doc = await ServiceTemplate.findById(id)
    .lean()
    .catch(() => null);
  if (!doc) notFound();

  const service = {
    id: String(doc._id),
    name: doc.name,
    code: doc.code,
    category: doc.category,
    level: doc.level,
    minExecRole: doc.minExecRole,
    minReviewRole: doc.minReviewRole,
    turnaroundDays: doc.turnaroundDays ?? "",
    effortHours: doc.effortHours ?? "",
    turnaroundNote: doc.turnaroundNote ?? "",
    recurrence: doc.recurrence,
    sac: doc.sac ?? "",
    // the form asks for rupees; the database keeps integer paise
    defaultFee: String((doc.defaultFeePaise ?? 0) / 100),
    gstRate: doc.gstRate ?? 18,
    udinRequired: Boolean(doc.udinRequired),
    version: doc.version ?? 1,
    checklist: (doc.checklist ?? []).map((c) => ({
      name: c.name,
      side: c.side,
      mandatory: c.mandatory !== false,
    })),
    steps: (doc.steps ?? []).map((s) => ({
      name: s.name,
      minRole: s.minRole ?? "",
    })),
  };

  return (
    <SettingsScreen
      title={service.name}
      sub={
        <>
          <span className="num">{service.code}</span> · editing this makes a new
          version, and a job already open keeps the version it started on.
        </>
      }
      back={{ href: "/settings/services", label: "Services" }}
    >
      <ServiceForm service={service} />
    </SettingsScreen>
  );
}
