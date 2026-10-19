import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import ClientAccess from "@/models/ClientAccess";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { canExecute, canReview, tierLabel } from "@/lib/services/catalog";
import { SECTION_LABELS } from "@/lib/access/sections";
import { formatISTDate } from "@/lib/dates";
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

  const open = await Engagement.find({
    status: { $nin: CLOSED_STATUSES },
    $or: [{ assigneeId: id }, { reviewerId: id }],
  })
    .select(
      "code status assigneeId reviewerId clientId templateSnapshot periodLabel period statutoryDue internalDue",
    )
    .sort({ statutoryDue: 1 })
    .lean();

  const grants = await ClientAccess.find({ userId: id, active: true }).lean();

  const clients = await Client.find({
    _id: {
      $in: [
        ...new Set([
          ...open.map((e) => String(e.clientId)),
          ...grants.map((g) => String(g.clientId)),
        ]),
      ],
    },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  /**
   * Who may take each engagement. Worked out here rather than in the browser,
   * so the dropdown cannot offer somebody the server would refuse — the same
   * `canExecute` / `canReview` rules `checkAssignment` applies on the way in.
   */
  const colleagues = await User.find({
    active: true,
    _id: { $ne: id },
    ...(can(actor, "edit", "team", {}) && actor.role === "partner"
      ? {}
      : { branchIds: { $in: actor.branchIds } }),
  })
    .select("name role")
    .sort({ name: 1 })
    .lean();

  const rows = open.map((engagement) => {
    const snapshot = engagement.templateSnapshot ?? {};
    const isAssignee = String(engagement.assigneeId ?? "") === String(id);

    const candidates = colleagues.filter((person_) =>
      isAssignee
        ? canExecute(person_.role, snapshot.minExecRole ?? "intern")
        : canReview(person_.role, snapshot.minReviewRole ?? "ca"),
    );

    return {
      id: String(engagement._id),
      code: engagement.code,
      service: snapshot.name ?? "Work",
      level: tierLabel(snapshot.level),
      period: engagement.periodLabel || engagement.period,
      status: engagement.status,
      client: clientName.get(String(engagement.clientId)) ?? "—",
      role: isAssignee ? "assignee" : "reviewer",
      due: engagement.statutoryDue ?? engagement.internalDue,
      dueLabel: engagement.statutoryDue
        ? formatISTDate(engagement.statutoryDue)
        : engagement.internalDue
          ? formatISTDate(engagement.internalDue)
          : "—",
      needs: isAssignee
        ? (snapshot.minExecRole ?? "intern")
        : (snapshot.minReviewRole ?? "ca"),
      candidates: candidates.map((c) => ({
        id: String(c._id),
        name: c.name,
        role: c.role,
      })),
    };
  });

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/team/${id}`}
          className="text-13 underline underline-offset-4"
        >
          Back to {person.name}
        </Link>
        <h1 className="font-display text-28 font-semibold">
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
