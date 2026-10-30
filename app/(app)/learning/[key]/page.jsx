import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Procedure from "@/models/Procedure";
import { formatISTDate } from "@/lib/dates";
import {
  SCREENS,
  screenFor,
  rolesAllowed,
  mayWrite,
  mayReview,
  isStale,
} from "@/lib/learning/screens";
import ProcedureEditor from "./ProcedureEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { key } = await params;
  return { title: `${screenFor(key)?.label ?? "Procedure"} · PHMG` };
}

/**
 * One procedure, read or written (P3-19).
 *
 * The line nobody has to type is **who may do this**: it is read from the
 * permission matrix, so a procedure cannot tell somebody an intern may file
 * a return when the server would refuse them. A handbook that disagrees
 * with the system is worse than one that is missing.
 */
export default async function ProcedurePage({ params }) {
  const { key } = await params;
  const actor = await requireUser();

  const screen = screenFor(key);
  const isNewPlaybook = key === "new-playbook";
  if (!screen && !isNewPlaybook) {
    // an unknown key is only allowed if a playbook already lives there
    await connectDB();
    const exists = await Procedure.findOne({ key }).select("_id").lean();
    if (!exists) notFound();
  }

  await connectDB();
  const row = isNewPlaybook ? null : await Procedure.findOne({ key }).lean();

  const canWrite = mayWrite(actor);
  const canReview = mayReview(actor);

  const kind = row?.kind ?? (screen ? "screen" : "playbook");

  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link href="/learning" className="text-13 underline underline-offset-4">
          How we do things
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          {row?.title ?? screen?.label ?? "A new playbook"}
        </h1>
        {screen && (
          <p className="text-13 text-ink-muted">
            The screen at <span className="font-mono">{screen.path}</span>
            {screen.area && (
              <>
                {" "}
                · the work on it is{" "}
                {rolesAllowed(screen.area).join(", ").toLowerCase()}&rsquo;s
              </>
            )}
          </p>
        )}
      </div>

      {row && isStale(row) && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          {row.reviewedAt
            ? `Nobody has read this since ${formatISTDate(row.reviewedAt)}.`
            : "No partner has read this since it was written."}{" "}
          A procedure that was true a year ago and is quietly wrong now is how a
          handbook stops being worth opening.
        </p>
      )}

      <ProcedureEditor
        procedureKey={isNewPlaybook ? "" : key}
        kind={kind}
        canWrite={canWrite}
        canReview={canReview}
        screens={SCREENS.map((item) => ({
          key: item.key,
          label: item.label,
        }))}
        current={
          row
            ? {
                title: row.title,
                intro: row.intro ?? "",
                steps: (row.steps ?? [])
                  .map((step) =>
                    step.note ? `${step.text}\n— ${step.note}` : step.text,
                  )
                  .join("\n"),
                notFor: (row.notFor ?? []).join("\n"),
                whenItHappens: row.whenItHappens ?? "",
                decisions: row.decisions ?? "",
                mistakes: row.mistakes ?? "",
                example: row.example ?? "",
                screens: row.screens ?? [],
                writtenByName: row.writtenByName,
                reviewedByName: row.reviewedByName,
                reviewedOn: row.reviewedAt ? formatISTDate(row.reviewedAt) : "",
              }
            : null
        }
      />
    </div>
  );
}
