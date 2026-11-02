import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { firmProfile } from "@/lib/firm/settings";
import Notice from "@/components/ui/Notice";
import ProgressBar from "@/components/ui/ProgressBar";
import SettingsScreen, { RowList, Row } from "../Shell";
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
    <SettingsScreen
      title="Setting the firm up"
      sub="Eight things to do once. Every one of them is read from the records rather than ticked off by hand, so this page cannot tell you something is done when it is not."
    >
      {/* the one figure on the page that moves, so it is the one that is
          drawn: eight of eight is the whole point of the screen */}
      <Notice tone={progress.finished ? "good" : "flat"}>
        <div className="flex flex-col gap-2">
          <p className="text-14">
            {progress.finished ? (
              <>
                <strong>All eight are done.</strong> Nothing here needs you
                again unless something changes — a new office, a new
                year&rsquo;s due dates.
              </>
            ) : (
              <>
                <strong className="num">
                  {progress.done} of {progress.total}
                </strong>{" "}
                done, in the order a firm usually works through them.
              </>
            )}
          </p>
          <ProgressBar
            value={progress.done}
            max={progress.total}
            label={`${progress.done} of ${progress.total} steps done`}
            trailing={`${progress.done}/${progress.total}`}
          />
        </div>
      </Notice>

      <RowList as="ol">
        {steps.map((step, index) => (
          <Row
            key={step.key}
            href={step.href}
            title={
              <>
                <span className="num text-ink-muted">{index + 1}. </span>
                {step.title}
              </>
            }
            body={step.why}
            state={
              step.done
                ? "done"
                : `${step.left > 1 ? `${step.left} ` : ""}${step.whenLeft}`
            }
            tone={step.done ? "good" : "warn"}
          />
        ))}
      </RowList>
    </SettingsScreen>
  );
}
