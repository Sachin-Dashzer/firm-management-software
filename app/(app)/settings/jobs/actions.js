"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Job from "@/models/Job";
import { runOnce } from "@/lib/jobs/run";

/**
 * The two things a partner can do about background work: try a failed job
 * again, and start a run by hand rather than waiting for the next cron.
 */

/** Put a job that gave up back on the queue, with its attempts reset. */
export async function retryJob(id) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  const job = await Job.findById(id);
  if (!job) return { error: "That job is gone." };
  if (job.status !== "failed") return { error: "That job has not failed." };

  await Job.updateOne(
    { _id: id },
    {
      $set: {
        status: "queued",
        attempts: 0,
        runAt: new Date(),
        lockedUntil: null,
        lockedBy: null,
        lastError: "",
        finishedAt: null,
      },
    },
  );

  revalidatePath("/settings/jobs");
  return { ok: `${job.type} will run again at the next pass.` };
}

/** Stop retrying something that is never going to work. */
export async function cancelJob(id) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  const job = await Job.findByIdAndUpdate(id, {
    $set: { status: "done", result: { cancelledBy: actor.id } },
  });
  if (!job) return { error: "That job is gone." };

  revalidatePath("/settings/jobs");
  return { ok: "Job cancelled." };
}

/**
 * Run a pass now. Useful while setting cron up, and when something has been
 * fixed and nobody wants to wait five minutes to find out.
 */
export async function runNow() {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  try {
    const summary = await runOnce();
    revalidatePath("/settings/jobs");
    return {
      ok: `Ran ${summary.done} ${summary.done === 1 ? "job" : "jobs"} in ${summary.seconds}s${
        summary.failed ? `, ${summary.failed} failed` : ""
      }.`,
    };
  } catch (err) {
    return { error: `The runner itself failed: ${err.message}` };
  }
}
