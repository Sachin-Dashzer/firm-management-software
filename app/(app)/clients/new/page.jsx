import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Branch from "@/models/Branch";
import User from "@/models/User";
import ClientGroup from "@/models/ClientGroup";
import ServiceTemplate from "@/models/ServiceTemplate";
import DocTemplate from "@/models/DocTemplate";
import FormDraft from "@/models/FormDraft";
import { draftAge } from "@/lib/forms/draft";
import Onboarding from "./Onboarding";

export const metadata = { title: "New client · PHMG" };
export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "clients")) redirect("/clients");

  await connectDB();
  const [branches, partners, groups, services, packTemplates, draft] =
    await Promise.all([
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
      /** The firm's own catalog, in the order the services screen shows it. */
      ServiceTemplate.find({ active: true })
        .select("code name recurrence defaultFeePaise category")
        .sort({ category: 1, name: 1 })
        .lean(),
      /** Only the letters that actually have wording behind them. */
      DocTemplate.find({ active: true }).select("code").lean(),
      /** Their own unfinished one, if the phone rang last time (P3-18b). */
      FormDraft.findOne({ userId: actor.id, kind: "client" }).lean(),
    ]);

  return (
    <Onboarding
      branches={branches.map((b) => ({
        id: String(b._id),
        code: b.code,
        name: b.name,
      }))}
      partners={partners.map((p) => ({ id: String(p._id), name: p.name }))}
      groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
      services={services.map((s) => ({
        code: s.code,
        name: s.name,
        recurrence: s.recurrence,
        defaultFeePaise: s.defaultFeePaise ?? 0,
      }))}
      packCodes={packTemplates.map((t) => t.code)}
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
  );
}
