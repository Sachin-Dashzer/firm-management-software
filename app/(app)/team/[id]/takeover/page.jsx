import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Leave from "@/models/Leave";
import { handoverRows } from "@/lib/team/handover";
import { coversDay } from "@/lib/team/leave";
import { formatISTDate } from "@/lib/dates";
import TakeOver from "./TakeOver";

export const metadata = { title: "Take over · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Handing one person's work to another while they are away (P3-16).
 *
 * The offboarding wizard (D6) has done this since Step 1 for somebody
 * leaving for good. What the firm actually does far more often is a
 * fortnight's leave, where the right answer is sometimes "name a cover and
 * leave the work where it is" and sometimes "move these four, they are due
 * on Tuesday". This page is that choice, and it reads the same
 * `handoverRows` the wizard does so the two cannot disagree about who may
 * take what.
 *
 * It moves work and nothing else. Access to a client is not handed over
 * here and never is by cover (spec section 2).
 */
export default async function TakeOverPage({ params }) {
  const actor = await requireUser();
  const { id } = await params;

  if (!can(actor, "edit", "engagementsCreate")) redirect(`/team/${id}`);

  await connectDB();
  const person = await User.findById(id)
    .select("name email role branchIds active")
    .lean();
  if (!person) notFound();

  const sharesABranch = (person.branchIds ?? []).some((branchId) =>
    actor.branchIds.includes(String(branchId)),
  );
  if (actor.role !== "partner" && !sharesABranch) {
    redirect("/no-access");
  }

  const [rows, leaves] = await Promise.all([
    handoverRows(String(id), actor),
    Leave.find({ userId: id, to: { $gte: new Date() } })
      .sort({ from: 1 })
      .lean(),
  ]);

  const coverIds = [...new Set(leaves.map((row) => String(row.coverId)))];
  const covers = await User.find({ _id: { $in: coverIds } })
    .select("name role")
    .lean();
  const coverName = new Map(covers.map((row) => [String(row._id), row.name]));

  const now = new Date();
  const away = leaves.map((leave) => ({
    id: String(leave._id),
    from: formatISTDate(leave.from),
    to: formatISTDate(leave.to),
    kind: leave.kind,
    cover: coverName.get(String(leave.coverId)) ?? "somebody",
    coverId: String(leave.coverId),
    now: coversDay(leave, now),
  }));

  /** The cover is the obvious person to hand to, so they are offered first. */
  const suggested = away.find((leave) => leave.now) ?? away[0] ?? null;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/team/${id}?tab=leave`}
          className="text-13 underline underline-offset-4"
        >
          Back to {person.name}
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Take over {person.name}&rsquo;s work
        </h1>
        <p className="text-14 text-ink-muted max-w-[68ch]">
          {ROLE_LABELS[person.role]} · {person.email}. Moving a job changes who
          is responsible for it, on the record and in every list — which is a
          different thing from naming a cover, where the work stays theirs and
          somebody else watches it. Move what is due while they are away and
          leave the rest.
        </p>
      </header>

      {away.length > 0 ? (
        <div className="rounded-ledger border-rule bg-surface flex flex-col gap-1 border px-3 py-2">
          {away.map((leave) => (
            <p key={leave.id} className="text-14">
              {leave.now ? "Away now" : "Away"} {leave.from} – {leave.to}
              {leave.kind === "Exam leave" ? " (exam leave)" : ""} ·{" "}
              <strong>{leave.cover}</strong> is covering.
            </p>
          ))}
          <p className="text-13 text-ink-muted">
            The cover already sees their Issues and gets their reminders.
            Moving a job is for work that needs a different owner on the
            record.
          </p>
        </div>
      ) : (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          No leave is recorded for {person.name.split(" ")[0]}. You can still
          move work — but if they are away, record it on their Leave tab so the
          cover gets their Issues and their reminders too.
        </p>
      )}

      <TakeOver
        name={person.name}
        rows={rows}
        suggestedId={suggested?.coverId ?? ""}
        suggestedName={suggested?.cover ?? ""}
      />
    </div>
  );
}
