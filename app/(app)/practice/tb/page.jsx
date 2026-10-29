import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";

export const metadata = { title: "TB to financials · PHMG" };
export const dynamic = "force-dynamic";

/**
 * TB to financials (P3-22e).
 *
 * The menu reaches this route from today, so the route exists from today —
 * a menu item that 404s is worse than one that is not there. What it says
 * is the truth: the page is named, its place in the plan is named, and
 * nothing is invented to fill the space (CLAUDE.md rule 9 and the honest
 * empty state).
 */
export default async function Page() {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          TB to financials
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          A trial balance in, the financial statements out, with the groupings
          the firm uses. A feature, not a screen: it needs its own plan.
        </p>
      </div>

      <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
        <strong>Not built yet — P3-22e.</strong> The menu was rebuilt to the
        firm's own shape first (P3-22a), so every item has somewhere real to go.
        Nothing on this screen is invented in the meantime.
      </p>
    </div>
  );
}
