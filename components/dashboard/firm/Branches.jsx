import Link from "next/link";
import Panel from "@/components/ui/Panel";
import { formatPaise } from "@/lib/money";

/**
 * The firm's offices against each other (P3-34 phase 3).
 *
 * Only rendered when there is more than one branch in view: a table of one
 * row comparing a branch with itself is furniture.
 *
 * Every figure here is counted with `engagementQuery`, the same builder the
 * job list uses, and every branch name opens that branch's list — so a
 * number in this table and the rows behind it cannot drift.
 */
export default function Branches({ rows }) {
  if (!rows || rows.length === 0) return null;

  return (
    <Panel title="Branches">
      <table className="w-full">
        <caption className="sr-only">
          Open work, overdue work, work due this week and money owed, by branch
        </caption>
        <thead>
          <tr className="text-12 text-ink-muted border-rule border-b text-left">
            <th scope="col" className="py-1.5 font-medium">
              Branch
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Open
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Overdue
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Due this week
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Owed
            </th>
          </tr>
        </thead>
        <tbody className="divide-rule-soft divide-y">
          {rows.map((row) => (
            <tr key={row.id} className="text-14">
              <th scope="row" className="py-2 text-left font-medium">
                <Link href={row.href} className="hover:text-carbon">
                  {row.name}
                </Link>
              </th>
              <td className="num py-2 text-right">{row.open}</td>
              <td
                className={`num py-2 text-right ${row.overdue > 0 ? "text-redpen font-semibold" : "text-ink-muted"}`}
              >
                {row.overdue}
              </td>
              <td className="num py-2 text-right">{row.dueThisWeek}</td>
              <td className="num py-2 text-right">
                {row.owedPaise > 0 ? formatPaise(row.owedPaise) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
