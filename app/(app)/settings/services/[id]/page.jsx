import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import ServiceTemplate from "@/models/ServiceTemplate";
import ServiceForm from "../ServiceForm";

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
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          href="/settings/services"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Services
        </Link>
        <h1 className="font-display text-28 font-semibold">{service.name}</h1>
        <p className="text-13 text-ink-muted font-mono">{service.code}</p>
      </div>
      <ServiceForm service={service} />
    </div>
  );
}
