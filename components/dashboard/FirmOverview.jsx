import Link from "next/link";
import { formatPaise } from "@/lib/money";
import { TileRow, MoneyTile, CountTile, BarRows, Panel } from "./Tiles";
import DeadlineHeatmap from "./DeadlineHeatmap";

/**
 * The partner's firm overview (spec section 10).
 *
 * Read top to bottom it answers three questions in order: is the work on
 * time, is it being billed, and is the money arriving. Each figure links
 * to the list it was counted from.
 */
export default function FirmOverview({
  tiles,
  branches,
  unbilled,
  receivables,
  collections,
  revenue,
  pendingDocuments,
  terrain,
}) {
  const change = collections.thisMonth - collections.lastMonth;

  return (
    <div className="flex flex-col gap-6">
      <Panel title="The firm this morning" what="Every figure opens its list.">
        <TileRow tiles={tiles} />
      </Panel>

      {branches.length > 1 && (
        <Panel title="By branch">
          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                  <th className="px-3 py-2 font-medium">Branch</th>
                  <th className="px-3 py-2 text-right font-medium">Open</th>
                  <th className="px-3 py-2 text-right font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr
                    key={branch.id}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={branch.href}
                        className="underline underline-offset-4"
                      >
                        {branch.name}
                      </Link>
                    </td>
                    <td className="num px-3 py-2 text-right">{branch.open}</td>
                    <td
                      className={`num px-3 py-2 text-right ${branch.overdue > 0 ? "text-redpen" : "text-ink-muted"}`}
                    >
                      {branch.overdue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title="The next eight weeks"
        what="How much falls due, branch by branch and week by week."
      >
        <DeadlineHeatmap data={terrain} />
      </Panel>

      <Panel title="Money">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyTile
            label="Unbilled, finished work"
            paise={unbilled.paise}
            note={`${unbilled.count} ${unbilled.count === 1 ? "job" : "jobs"} waiting to be invoiced`}
            href={unbilled.href}
          />
          <MoneyTile
            label="Owed to the firm"
            paise={receivables.ageing.total}
            note={`${formatPaise(receivables.overduePaise)} of it past due`}
            href={receivables.href}
            tone={receivables.overduePaise > 0 ? "late" : undefined}
          />
          <MoneyTile
            label="Collected this month"
            paise={collections.thisMonth}
            note={
              /*
                The figure is bank receipts by the date they arrived. Said
                plainly, with whatever is still unplaced, so the total is not
                read as reconciled (P3-3).
              */
              [
                "bank receipts by date",
                collections.lastMonth === 0
                  ? null
                  : `${change >= 0 ? "up" : "down"} ${formatPaise(Math.abs(change))} on last month`,
                collections.unallocated
                  ? `${formatPaise(collections.unallocated)} not yet allocated`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
            }
            href={collections.href}
          />
          <CountTile
            label="Waiting on a client"
            value={pendingDocuments.value}
            note="jobs held up for documents"
            href={pendingDocuments.href}
            tone="late"
          />
        </div>

        <div className="rounded-ledger border-rule bg-surface mt-1 border p-4">
          <h3 className="text-13 text-ink-muted mb-3">
            Ageing
          </h3>
          <div className="divide-rule grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5 sm:divide-x">
            {[
              ["Not yet due", receivables.ageing.current],
              ["0–30 days", receivables.ageing["0-30"]],
              ["31–60", receivables.ageing["31-60"]],
              ["61–90", receivables.ageing["61-90"]],
              ["Over 90", receivables.ageing["90+"]],
            ].map(([label, paise], index) => (
              <div key={label} className={index > 0 ? "sm:pl-6" : ""}>
                <div className="text-12 text-ink-muted">{label}</div>
                <div
                  className={`num text-16 ${label === "Over 90" && paise > 0 ? "text-redpen" : ""}`}
                >
                  {formatPaise(paise)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel
        title="Billed this year, by kind of work"
        what="From issued invoices, this financial year."
        action={
          <Link
            href="/reports/revenue?by=service"
            className="text-13 underline underline-offset-4"
          >
            Full revenue report
          </Link>
        }
      >
        <div className="rounded-ledger border-rule bg-surface border p-4">
          <BarRows
            rows={revenue}
            total={revenue.reduce((sum, row) => sum + row.paise, 0)}
          />
        </div>
      </Panel>
    </div>
  );
}
