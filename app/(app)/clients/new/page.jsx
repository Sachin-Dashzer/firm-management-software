import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Branch from "@/models/Branch";
import User from "@/models/User";
import ClientGroup from "@/models/ClientGroup";
import FormDraft from "@/models/FormDraft";
import { draftAge } from "@/lib/forms/draft";
import ClientForm from "../ClientForm";

export const metadata = { title: "New client · PHMG" };
export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "clients")) redirect("/clients");

  await connectDB();
  const [branches, partners, groups, draft] = await Promise.all([
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
    /** Their own unfinished one, if the phone rang last time (P3-18b). */
    FormDraft.findOne({ userId: actor.id, kind: "client" }).lean(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          New client
        </h1>
        <p className="text-13 text-ink-muted">
          Starts as a <strong>Lead</strong>. Record the quote now; activate once
          the engagement letter is signed, and the system checks for a duplicate
          PAN or GSTIN before it lets you.
        </p>
      </div>

      <ClientForm
        branches={branches.map((b) => ({
          id: String(b._id),
          code: b.code,
          name: b.name,
        }))}
        partners={partners.map((p) => ({ id: String(p._id), name: p.name }))}
        groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
        canEditSensitive={can(actor, "edit", "clientIdentifiers")}
        draft={
          draft
            ? {
                payload: draft.payload ?? {},
                dropped: draft.dropped ?? [],
                age: draftAge(draft.updatedAt),
              }
            : null
        }
      />
    </div>
  );
}
