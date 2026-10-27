import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import User from "@/models/User";
import ClientGroup from "@/models/ClientGroup";
import { istInputDate } from "@/lib/dates";
import ClientForm from "../../ClientForm";

export const metadata = { title: "Edit client · PHMG" };
export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }) {
  const actor = await requireUser();
  const { id } = await params;

  await connectDB();
  const client = await Client.findById(id).lean();
  if (!client) notFound();
  if (!can(actor, "edit", "clients", { branchId: String(client.branchId) })) {
    redirect(`/clients/${id}`);
  }

  const [branches, partners, groups] = await Promise.all([
    Branch.find(
      actor.role === "partner" ? {} : { _id: { $in: actor.branchIds } },
    )
      .select("code name")
      .sort({ code: 1 })
      .lean(),
    User.find({ role: { $in: ["partner", "ca"] }, active: true })
      .select("name")
      .sort({ name: 1 })
      .lean(),
    ClientGroup.find({}).select("name").sort({ name: 1 }).lean(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <div>
        <p className="text-13 text-ink-muted font-mono">{client.code}</p>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Edit {client.tradeName || client.legalName}
        </h1>
      </div>

      <ClientForm
        client={{
          id,
          legalName: client.legalName,
          tradeName: client.tradeName,
          entityType: client.entityType,
          branchId: String(client.branchId),
          pan: client.pan,
          tan: client.tan,
          cin: client.cin,
          udyam: client.udyam,
          iec: client.iec,
          aadhaarLast4: client.aadhaarLast4,
          establishedOn: istInputDate(client.establishedOn),
          gstins: client.gstins?.map((g) => ({ gstin: g.gstin, qrmp: g.qrmp })),
          contacts: client.contacts?.map((c) => ({
            name: c.name,
            designation: c.designation,
            mobile: c.mobile,
            email: c.email,
            primary: c.primary,
          })),
          clientPartnerId: client.clientPartnerId
            ? String(client.clientPartnerId)
            : "",
          relationshipManagerId: client.relationshipManagerId
            ? String(client.relationshipManagerId)
            : "",
          groupId: client.groupId ? String(client.groupId) : "",
          industry: client.industry,
          turnoverBand: client.turnoverBand,
          risk: client.risk,
          referralSource: client.referralSource,
          tags: client.tags,
          billingCycle: client.billingCycle,
          creditDays: client.creditDays,
          invoiceEmail: client.invoiceEmail,
        }}
        branches={branches.map((b) => ({
          id: String(b._id),
          code: b.code,
          name: b.name,
        }))}
        partners={partners.map((p) => ({ id: String(p._id), name: p.name }))}
        groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
        canEditSensitive={can(actor, "edit", "clientIdentifiers", {
          branchId: String(client.branchId),
        })}
      />
    </div>
  );
}
