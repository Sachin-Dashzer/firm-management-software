import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { formatISTDate, financialYearLabel } from "@/lib/dates";
import RoleDashboard, {
  hasRoleDashboard,
} from "@/components/dashboard/RoleDashboard";

export const metadata = { title: "Firm dashboard · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The firm at a glance (spec section 10, P3-22b).
 *
 * The boards themselves were built at Step 10 and have been the top half of
 * `/today` ever since; the prototype's menu names them as a screen of their
 * own, so this is where they live now. Nothing was rewritten — the same
 * component, scoped the same way, on its own route.
 *
 * An employee and an intern have no board: `hasRoleDashboard()` is false for
 * them, their own work is their dashboard, and they are told so and sent to
 * it rather than shown an empty page.
 */
export default async function DashboardPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "dashboards")) redirect("/issues");

  const now = new Date();
  await connectDB();

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-24 font-bold tracking-tight">
          Firm dashboard
        </h1>
        <p className="num text-13 text-ink-muted">
          {formatISTDate(now)} · FY {financialYearLabel(now)} ·{" "}
          <Link href="/my-day" className="underline underline-offset-4">
            My tasks
          </Link>
        </p>
      </div>

      {hasRoleDashboard(actor) ? (
        <RoleDashboard actor={actor} now={now} />
      ) : (
        <p className="rounded-ledger border-rule bg-surface text-14 max-w-[70ch] border px-4 py-3">
          Your own work is your dashboard. Everything on your desk — what is
          due, what is waiting on a client, what is waiting for your review — is
          on{" "}
          <Link href="/my-day" className="underline underline-offset-4">
            My tasks
          </Link>
          .
        </p>
      )}
    </div>
  );
}
