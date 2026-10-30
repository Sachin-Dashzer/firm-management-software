import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import RoleDashboard, {
  hasRoleDashboard,
} from "@/components/dashboard/RoleDashboard";

export const metadata = { title: "Firm dashboard · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The firm at a glance (spec section 10, redrawn in P3-34 phase 3).
 *
 * The page owns no heading of its own any more. The greeting, the date and
 * the deadline chips are the dashboard's top row and they depend on the
 * data — a heading printed here and a board fetched there is how a page
 * comes to say "Good morning" over an empty screen.
 *
 * An employee and an intern have no board: `hasRoleDashboard()` is false
 * for them, their own work is their dashboard, and they are told so and
 * sent to it rather than shown an empty page.
 */
export default async function DashboardPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "dashboards")) redirect("/issues");

  const now = new Date();
  await connectDB();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {hasRoleDashboard(actor) ? (
        <RoleDashboard actor={actor} now={now} />
      ) : (
        <>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Firm dashboard
          </h1>
          <p className="rounded-ledger border-rule bg-surface text-14 max-w-[70ch] border px-4 py-3">
            Your own work is your dashboard. Everything on your desk — what is
            due, what is waiting on a client, what is waiting for your review —
            is on{" "}
            <Link href="/my-day" className="underline underline-offset-4">
              My tasks
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
