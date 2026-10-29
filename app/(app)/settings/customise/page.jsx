import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";

export const metadata = { title: "Quick setup and customisation · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Quick setup and customisation (P3-22d).
 *
 * The menu reaches this route from today, so the route exists from today —
 * a menu item that 404s is worse than one that is not there. What it says
 * is the truth: the page is named, its place in the plan is named, and
 * nothing is invented to fill the space (CLAUDE.md rule 9 and the honest
 * empty state).
 */
export default async function Page() {
  const actor = await requireUser();
  if (!can(actor, "view", "firmProfile")) redirect("/issues");

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Quick setup and customisation
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          The firm's own words, its custom fields, its service templates and its
          portal branding. Two of those change the data model, so they need the
          owner's decision first.
        </p>
      </div>

      <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
        <strong>Not built yet — P3-22d.</strong> The menu was rebuilt to the
        firm's own shape first (P3-22a), so every item has somewhere real to go.
        Nothing on this screen is invented in the meantime.
      </p>
    </div>
  );
}
