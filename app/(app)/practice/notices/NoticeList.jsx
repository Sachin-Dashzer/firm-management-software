"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The notice register (P3-11).
 *
 * One line per matter, and the column that earns its place is **Next**: the
 * date the department actually gave, not a limitation date. A limitation
 * date is the firm's last chance rather than a thing it owes this week, and
 * putting "appeal by March" at the top of a Monday list is how the thing
 * due on Tuesday gets missed.
 */
export default function NoticeList({ rows, stage, stages }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function go(next) {
    const params = new URLSearchParams(search);
    if (next) params.set("stage", next);
    else params.delete("stage");
    router.replace(`${pathname}?${params}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Chip on={!stage} onClick={() => go("")}>
          Open
        </Chip>
        {stages.map((name) => (
          <Chip key={name} on={stage === name} onClick={() => go(name)}>
            {name}
          </Chip>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-6 text-center">
          {stage
            ? `Nothing at ${stage.toLowerCase()}.`
            : "No notices are open."}
        </p>
      ) : (
        <div className="rounded-table border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Notice</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Next</th>
                <th className="px-3 py-2 text-right font-medium">At stake</th>
                <th className="px-3 py-2 font-medium">With</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-rule border-b last:border-0">
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/practice/notices/${row.id}`}
                      className="underline underline-offset-4"
                    >
                      {row.client}
                    </Link>
                    {row.risk && (
                      <span className="text-12 text-ink-muted block">
                        {row.risk} risk
                      </span>
                    )}
                  </td>
                  <td className="text-13 px-3 py-2 align-top">
                    {row.kindLabel}
                    <span className="text-12 text-ink-muted block">
                      {[row.section, row.period].filter(Boolean).join(" · ")}
                      {row.din && (
                        <span className="font-mono"> · {row.din}</span>
                      )}
                    </span>
                  </td>
                  <td className="text-13 px-3 py-2 align-top">
                    {row.stage}
                    {row.adjournments.used > 0 && (
                      <span className="text-12 text-ink-muted block">
                        {row.adjournments.used} adjourned
                        {row.adjournments.left !== null
                          ? ` · ${row.adjournments.left} left`
                          : ""}
                      </span>
                    )}
                  </td>
                  <td className="text-13 px-3 py-2 align-top">
                    {row.next ? (
                      <>
                        <span className={row.overdue ? "text-redpen" : ""}>
                          {row.next.what} · {row.next.date}
                        </span>
                        <span className="text-12 text-ink-muted block">
                          {row.next.days < 0
                            ? `${Math.abs(row.next.days)} days past`
                            : row.next.days === 0
                              ? "today"
                              : `in ${row.next.days} days`}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-muted">nothing listed</span>
                    )}
                  </td>
                  <td className="num px-3 py-2 text-right align-top">
                    {row.stake || "—"}
                    {row.demand && (
                      <span className="text-12 text-redpen block">
                        demand {row.demand}
                      </span>
                    )}
                  </td>
                  <td className="text-13 px-3 py-2 align-top">
                    {row.assignee || "Nobody yet"}
                    {row.partner && (
                      <span className="text-12 text-ink-muted block">
                        {row.partner}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-control text-13 border px-2 py-1 ${
        on
          ? "border-carbon bg-carbon-wash text-carbon font-medium"
          : "border-rule text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}
