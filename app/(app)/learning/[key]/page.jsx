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
import { starterSopFor, STARTER_NOTE } from "@/lib/learning/sops";
import { playbookFor, PLANNED, VERIFY } from "@/lib/learning/playbooks";
import ProcedureEditor from "./ProcedureEditor";
import StarterSop, { PlaybookView } from "./Starter";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { key } = await params;
  const book = playbookFor(key);
  return {
    title: `${book?.title ?? screenFor(key)?.label ?? "Procedure"} · PHMG`,
  };
}

/**
 * One procedure or one playbook, read or written (P3-19).
 *
 * The line nobody has to type is **who may do this**: it is read from the
 * permission matrix, so a procedure cannot tell somebody an intern may
 * file a return when the server would refuse them. A handbook that
 * disagrees with the system is worse than one that is missing.
 *
 * What is drawn depends on what exists, in this order: the firm's own
 * words, then the starting draft, then the empty box. The three are never
 * mixed.
 */
export default async function ProcedurePage({ params }) {
  const { key } = await params;
  const actor = await requireUser();

  /** A playbook that shipped with the system. */
  const book = playbookFor(key);
  if (book) {
    return (
      <div className="mx-auto flex max-w-[900px] flex-col gap-5 p-4 md:p-6">
        <div>
          <Link
            href="/learning?tab=playbooks"
            className="text-13 underline underline-offset-4"
          >
            Learning library
          </Link>
          <h1 className="font-display text-24 font-bold tracking-tight">
            {book.title}
          </h1>
          <p className="text-13 text-ink-muted max-w-[72ch]">{book.out}</p>
        </div>
        <PlaybookView book={book} verify={VERIFY} />
      </div>
    );
  }

  /** One the firm has not written yet, listed on the shelf. */
  const planned = PLANNED.find((row) => row.id === key);
  if (planned) {
    return (
      <div className="mx-auto flex max-w-[800px] flex-col gap-4 p-4 md:p-6">
        <div>
          <Link
            href="/learning?tab=playbooks"
            className="text-13 underline underline-offset-4"
          >
            Learning library
          </Link>
          <h1 className="font-display text-24 font-bold tracking-tight">
            {planned.title}
          </h1>
        </div>
        <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-6">
          Nobody has written this one. It is listed on the shelf so that what
          is missing is visible rather than invisible.{" "}
          {mayWrite(actor) ? (
            <Link
              href="/learning/new-playbook"
              className="underline underline-offset-4"
            >
              Write it
            </Link>
          ) : (
            "A CA or a partner writes these."
          )}
        </p>
      </div>
    );
  }

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
  const starter = screen ? starterSopFor(key) : null;

  const kind = row?.kind ?? (screen ? "screen" : "playbook");

  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link
          href="/learning?tab=sops"
          className="text-13 underline underline-offset-4"
        >
          How we work here
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          {row?.title ?? starter?.title ?? screen?.label ?? "A new playbook"}
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
        {!row && starter && (
          <p className="text-13 text-ink-muted max-w-[72ch]">{starter.why}</p>
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

      {/* the starting draft, until the firm writes its own */}
      {!row && starter && <StarterSop sop={starter} note={STARTER_NOTE} />}

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
        /**
         * Not `current`: the draft is **not** the firm's procedure, and the
         * editor would show it as one. It is what the box opens with, so
         * writing the firm's own version is editing rather than retyping.
         */
        prefill={
          starter
            ? {
                title: starter.title,
                intro: starter.why,
                steps: starter.steps.join("\n"),
                notFor: "",
                whenItHappens: starter.when,
                decisions: [starter.you.staff, starter.you.partner]
                  .filter(Boolean)
                  .join("\n"),
                mistakes: starter.avoid.join("\n"),
                example: "",
                screens: [],
              }
            : null
        }
      />
    </div>
  );
}
