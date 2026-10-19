import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { queueHealth } from "@/lib/jobs/queue";
import { SCHEDULES } from "@/lib/jobs/schedules";
import { formatISTDateTime } from "@/lib/dates";
import JobsAdmin from "./JobsAdmin";

export const metadata = { title: "Background jobs · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Is the background runner alive, and what has gone wrong? (spec section 14).
 *
 * Partner only: it shows the firm's whole queue, and retrying a job is a
 * decision about the firm's data.
 */
export default async function JobsPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/today");

  const health = await queueHealth();

  return (
    <JobsAdmin
      health={{
        ...health,
        lastRunText: health.lastRun
          ? formatISTDateTime(health.lastRun)
          : "never",
        failed: health.failed.map((job) => ({
          id: String(job._id),
          type: job.type,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          lastError: job.lastError,
          when: formatISTDateTime(job.updatedAt),
        })),
      }}
      schedules={SCHEDULES.map((s) => ({
        key: s.key,
        // a weekly schedule says which day, or "02:40" reads as every day
        at: s.dow === 1 ? `Mon ${s.at}` : s.at,
        why: s.why ?? "",
      }))}
    />
  );
}
