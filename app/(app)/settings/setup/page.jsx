import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { firmProfile } from "@/lib/firm/settings";
import {
  checksForSteps,
  ownCounts,
  readSteps,
  setupProgress,
} from "@/lib/settings/setup";

export const metadata = { title: "New firm setup · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The eight steps a firm works through before it can rely on this system
 * (P3-22d).
 *
 * Each one is **read from the records**, not ticked by a person: the step
 * is done because the rules are confirmed or the branch has its GSTIN.
 * Six of the eight are the same conditions the "Needs attention" strip
 * reads, so the two screens cannot say different things about the same
 * firm.
 */
export default async function SetupPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/settings");

  const now = new Date();
  await connectDB();

  const firm = await firmProfile();
  const ctx = { firm, now };

  const [own, fromChecks] = await Promise.all([
    ownCounts(now),
    Promise.all(
      checksForSteps().map(async ({ key, run }) => [
        key,
        // a check that throws must not take the page down: the screen it
        // points at still works, and a blank step is better than a 500
        run ? await run(ctx).catch(() => 0) : 0,
      ]),
    ),
  ]);

  const steps = readSteps({ ...own, ...Object.fromEntries(fromChecks) });
  const progress = setupProgress(steps);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link
          href="/settings"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Settings
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Setting the firm up
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          Eight things to do once. Every one of them is read from the records
          rather than ticked off by hand, so this page cannot tell you something
          is done when it is not.
        </p>
      </div>

      <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
        {progress.finished ? (
          <>
            <strong>All eight are done.</strong> Nothing on this page needs you
            again unless something changes — a new branch, a new year&rsquo;s
            due dates.
          </>
        ) : (
          <>
            <strong className="num">
              {progress.done} of {progress.total}
            </strong>{" "}
            done. The rest are below, in the order they are usually worked
            through.
          </>
        )}
      </p>

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`rounded-ledger flex flex-col gap-1 border p-4 ${
              step.done ? "border-rule bg-surface" : "border-carbon bg-paper"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-16 font-medium">
                <span className="num text-ink-muted">{index + 1}. </span>
                {step.title}
              </h2>
              {step.done ? (
                <span className="text-13 text-filed">done</span>
              ) : (
                <span className="text-13 text-waiting">
                  {step.left > 1 ? `${step.left} ` : ""}
                  {step.whenLeft}
                </span>
              )}
            </div>

            <p className="text-13 text-ink-muted max-w-[70ch]">{step.why}</p>

            <Link
              href={step.href}
              className="text-13 w-fit underline underline-offset-4"
            >
              {step.done ? "Open it anyway" : "Do it now"}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
