import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { firmModules } from "@/lib/firm/settings";
import {
  coveredGroups,
  coverageTotals,
  NOT_COVERED,
  GAP_WORDS,
} from "@/lib/settings/coverage";

export const metadata = { title: "What this covers · PHMG" };
export const dynamic = "force-dynamic";

/**
 * What the system covers, and what it does not (P3-22d).
 *
 * The covered half is counted off the menu, which is the one place a
 * screen is named — so this page cannot claim a feature that is not there.
 * The other half is written down, with the reason and where the decision
 * was recorded, because a thing that does not exist leaves no trace in the
 * code to derive it from.
 *
 * It is here for one reason: the honest answer to "can the system do X?"
 * should be on a screen, not in somebody's memory of a conversation.
 */
export default async function CoveragePage() {
  const actor = await requireUser();
  if (!can(actor, "view", "firmProfile")) redirect("/settings");

  const modules = await firmModules();
  const groups = coveredGroups(actor, modules);
  const totals = coverageTotals(groups);

  const byKind = ["decision", "later", "declined"].map((kind) => ({
    kind,
    label: GAP_WORDS[kind],
    rows: NOT_COVERED.filter((gap) => gap.kind === kind),
  }));

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
          What this covers
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          Counted from your own menu, so nothing here is a claim about a screen
          that does not exist. What the system does <em>not</em> do is below,
          with why — most of it is work deliberately not done.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-13 text-ink-muted font-medium">
          What you can open
          <span className="num">
            {" · "}
            {totals.screens} screens in {totals.groups} groups
          </span>
        </h2>

        <div className="rounded-table border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                <th className="px-3 py-2 font-medium">Part of the system</th>
                <th className="px-3 py-2 text-right font-medium">Screens</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr
                  key={group.id}
                  className="border-rule border-b last:border-0"
                >
                  <td className="px-3 py-2">{group.label}</td>
                  <td className="num px-3 py-2 text-right">{group.screens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-12 text-ink-muted">
          Your role decides what is on that list: somebody else&rsquo;s may be
          shorter.
        </p>
      </section>

      {byKind
        .filter((bucket) => bucket.rows.length > 0)
        .map((bucket) => (
          <section key={bucket.kind} className="flex flex-col gap-2">
            <h2 className="text-13 text-ink-muted font-medium">
              Not built — {bucket.label}
              <span className="num"> · {bucket.rows.length}</span>
            </h2>

            <ul className="flex flex-col gap-3">
              {bucket.rows.map((gap) => (
                <li
                  key={gap.title}
                  className="rounded-ledger border-rule bg-surface flex flex-col gap-1 border p-4"
                >
                  <h3 className="text-14 font-medium">{gap.title}</h3>
                  <p className="text-13 text-ink-muted max-w-[70ch]">
                    {gap.why}
                  </p>
                  {gap.route && (
                    <Link
                      href={gap.route}
                      className="text-13 w-fit underline underline-offset-4"
                    >
                      The screen that says so
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
