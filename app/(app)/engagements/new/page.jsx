import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import ServiceTemplate from "@/models/ServiceTemplate";
import User from "@/models/User";
import EngagementForm from "./EngagementForm";

export const metadata = { title: "New engagement · PHMG" };
export const dynamic = "force-dynamic";

/** Creating work is a Partner's or a CA's job (spec section 2). */
export default async function NewEngagementPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "edit", "engagementsCreate")) redirect("/engagements");

  const params = await searchParams;
  await connectDB();

  const scope = branchFilter(actor, "engagementsCreate");
  const [clients, templates, team] = await Promise.all([
    Client.find({ status: { $ne: "Closed" }, ...(scope ?? {}) })
      .select("legalName tradeName code branchId")
      .sort({ legalName: 1 })
      .limit(2000)
      .lean(),
    ServiceTemplate.find({ active: true })
      .select(
        "name code category recurrence level minExecRole minReviewRole defaultFeePaise turnaroundDays turnaroundNote udinRequired version",
      )
      .sort({ category: 1, name: 1 })
      .lean(),
    User.find({ active: true }).select("name role").sort({ name: 1 }).lean(),
  ]);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          href="/engagements"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Engagements
        </Link>
        <h1 className="font-display text-28 font-semibold">New engagement</h1>
        <p className="text-13 text-ink-muted">
          One service, one client, one period. The checklist and steps are
          copied from the service as it stands today.
        </p>
      </div>

      <EngagementForm
        clients={clients.map((c) => ({
          id: String(c._id),
          name: c.tradeName || c.legalName,
          code: c.code,
        }))}
        templates={templates.map((t) => ({
          id: String(t._id),
          name: t.name,
          code: t.code,
          category: t.category,
          recurrence: t.recurrence,
          level: t.level,
          minExecRole: t.minExecRole,
          minReviewRole: t.minReviewRole,
          defaultFee: String((t.defaultFeePaise ?? 0) / 100),
          turnaroundDays: t.turnaroundDays,
          turnaroundNote: t.turnaroundNote ?? "",
          udinRequired: Boolean(t.udinRequired),
          version: t.version ?? 1,
        }))}
        team={team.map((u) => ({
          id: String(u._id),
          name: u.name,
          role: u.role,
        }))}
        presetClientId={params?.client ?? ""}
      />
    </div>
  );
}
