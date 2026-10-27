import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Client from "@/models/Client";
import ClientAccess from "@/models/ClientAccess";
import { handoverRows } from "@/lib/team/handover";
import { SECTION_LABELS } from "@/lib/access/sections";
import Offboard from "./Offboard";

export const metadata = { title: "Offboarding · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Offboarding, in the order the firm has to do it (owner decision D6).
 *
 * The screen is a checklist rather than a single button, because the first
 * step is real work: somebody has to decide who picks up each open
 * engagement, and that decision has rules — an A-tier job cannot land on an
 * employee. So the page lists the work, offers only people who may legally
 * take it, and will not let the last step run until the list is empty.
 *
 * Nothing is hard-deleted. Their history, their audit entries and their
 * authorship of every return they prepared stay where they are: a firm that
 * deletes the person also deletes the answer to "who did this", which is the
 * question an ICAI review asks.
 */
export default async function OffboardPage({ params }) {
  const actor = await requireUser();
  const { id } = await params;

  if (!can(actor, "edit", "usersSettings")) redirect(`/team/${id}`);

  await connectDB();
  const person = await User.findById(id)
    .select("name email role branchIds active")
    .lean();
  if (!person) notFound();

  if (String(id) === actor.id) redirect(`/team/${id}`);

  /**
   * The work and who may take it: `lib/team/handover.js`, shared with the
   * take-over page (P3-16), so the two screens cannot offer different
   * people for the same engagement.
   */
  const [rows, grants] = await Promise.all([
    handoverRows(String(id), actor),
    ClientAccess.find({ userId: id, active: true }).lean(),
  ]);

  const grantClients = await Client.find({
    _id: { $in: [...new Set(grants.map((g) => String(g.clientId)))] },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    grantClients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/team/${id}`}
          className="text-13 underline underline-offset-4"
        >
          Back to {person.name}
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Offboarding {person.name}
        </h1>
        <p className="text-14 text-ink-muted max-w-[68ch]">
          {ROLE_LABELS[person.role]} · {person.email}. Four steps, in this
          order. Nothing is deleted: the account is switched off, the grants are
          revoked and the record is hidden, while every engagement they worked
          on keeps their name on it.
        </p>
      </header>

      <Offboard
        userId={String(id)}
        name={person.name}
        rows={rows}
        grants={grants.map((grant) => ({
          id: String(grant._id),
          client: clientName.get(String(grant.clientId)) ?? "A client",
          sections: (grant.sections ?? [])
            .map((s) => SECTION_LABELS[s] ?? s)
            .join(", "),
        }))}
      />
    </div>
  );
}
