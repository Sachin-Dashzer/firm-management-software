import Link from "next/link";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Procedure from "@/models/Procedure";
import { formatISTDate } from "@/lib/dates";
import { roadmap, mayWrite, isStale } from "@/lib/learning/screens";

export const metadata = { title: "How we do things · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The shelf (P3-19).
 *
 * Every screen worth a procedure, and whether anybody has written it. The
 * empty ones are listed as loudly as the written ones on purpose: a
 * handbook with holes that nobody can see is how a new joiner finds the
 * hole, at the worst moment, on their own.
 *
 * Nothing here is seeded. Every word on this screen was typed by somebody
 * at the firm.
 */
export default async function LearningPage() {
  const actor = await requireUser();

  await connectDB();
  const rows = await Procedure.find({}).sort({ updatedAt: -1 }).lean();

  const screens = roadmap(
    rows.filter((row) => row.kind === "screen"),
    new Date(),
  );
  const playbooks = rows.filter((row) => row.kind === "playbook");

  const written = screens.filter((row) => row.written).length;
  const canWrite = mayWrite(actor);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          How we do things
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          The firm&rsquo;s own procedures, beside the work they are about —
          the <strong>?</strong> in the top bar opens the one for whatever
          screen you are on. Nothing here is written by the system: every
          word is somebody&rsquo;s at PHMG, and a screen nobody has written
          up says so.
        </p>
      </div>

      <p className="rounded-ledger border-rule bg-sunk text-13 border px-3 py-2">
        <strong>
          {written} of {screens.length}
        </strong>{" "}
        screens have a procedure.{" "}
        {canWrite
          ? "Write the ones you explain out loud most often — those are the ones that cost the firm time."
          : "A CA or a partner writes these."}
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-15 font-bold">Screen by screen</h2>
        <ul className="rounded-table border-rule bg-surface divide-rule divide-y border">
          {screens.map((screen) => (
            <li
              key={screen.key}
              className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
            >
              <span className="text-14">
                {screen.label}
                <span className="text-12 text-ink-muted block font-mono">
                  {screen.path}
                </span>
              </span>
              <span className="text-13">
                {screen.written ? (
                  <>
                    <Link
                      href={`/learning/${screen.key}`}
                      className="underline underline-offset-4"
                    >
                      {screen.steps} {screen.steps === 1 ? "step" : "steps"}
                    </Link>
                    {screen.stale && (
                      <span className="text-waiting"> · needs a read</span>
                    )}
                  </>
                ) : canWrite ? (
                  <Link
                    href={`/learning/${screen.key}`}
                    className="text-ink-muted underline underline-offset-4"
                  >
                    nobody has written this — write it
                  </Link>
                ) : (
                  <span className="text-ink-muted">
                    nobody has written this yet
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-15 font-bold">Playbooks</h2>
          {canWrite && (
            <Link
              href="/learning/new-playbook"
              className="text-13 underline underline-offset-4"
            >
              Write one
            </Link>
          )}
        </div>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          A job start to finish — when it happens, who does what, where the
          decisions are, and what usually goes wrong. Longer than a screen
          procedure and read once rather than looked up.
        </p>

        {playbooks.length === 0 ? (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-4">
            None written yet.
          </p>
        ) : (
          <ul className="rounded-table border-rule bg-surface divide-rule divide-y border">
            {playbooks.map((row) => (
              <li
                key={String(row._id)}
                className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
              >
                <Link
                  href={`/learning/${row.key}`}
                  className="text-14 underline underline-offset-4"
                >
                  {row.title}
                </Link>
                <span className="text-12 text-ink-muted">
                  {row.writtenByName}
                  {row.reviewedAt
                    ? ` · read by ${row.reviewedByName}, ${formatISTDate(row.reviewedAt)}`
                    : " · not reviewed"}
                  {isStale(row) && " · needs a read"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
