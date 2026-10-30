"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Chip from "@/components/ui/Chip";
import FilterChip from "@/components/ui/FilterChip";
import SearchBox, { matches } from "@/components/ui/SearchBox";

/**
 * The notice register (P3-11, laid out again in D104).
 *
 * One line per matter, and the column that earns its place is **Next**:
 * the date the department actually gave, not a limitation date. A
 * limitation date is the firm's last chance rather than a thing it owes
 * this week, and putting "appeal by March" at the top of a Monday list is
 * how the thing due on Tuesday gets missed.
 *
 * **Submissions** is the column D104 adds, and it is the one that says
 * what a matter is: `2 filed · 1 due` is a correspondence with a
 * department, which is what distinguishes this register from a job list
 * where everything has one date and one outcome.
 *
 * The header stays while the rows scroll, because a table read by
 * comparing one column down thirty rows is unreadable the moment the
 * names of the columns have gone.
 *
 * **The table has a minimum width and scrolls sideways under it**, rather
 * than squeezing. Six columns of a register do not fit a tablet, and a
 * client's name broken one word to a line is worse than a sideways scroll
 * inside the frame. The percentages on the headers are the shares that
 * keep a name and a section on one line at the width the table has beside
 * the diary.
 */
export default function NoticeList({ rows, stage, stages, law, show }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [query, setQuery] = useState("");

  function go(next) {
    const params = new URLSearchParams(search);
    if (next) params.set("stage", next);
    else params.delete("stage");
    // the stage chips and the tiles above are two ways of asking one
    // question, so choosing a stage drops whichever tile was on
    params.delete("show");
    router.replace(`${pathname}?${params}`);
  }

  const visible = rows.filter((row) =>
    matches(
      [
        row.client,
        row.law,
        row.kindLabel,
        row.section,
        row.period,
        row.din,
        row.stage,
        row.assignee,
      ],
      query,
    ),
  );

  const scope = law ? `${law} only` : show ? "one cut of the register" : "";

  return (
    <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-x-visible">
          <FilterChip on={!stage} onClick={() => go("")}>
            Open
          </FilterChip>
          {stages.map((name) => (
            <FilterChip key={name} on={stage === name} onClick={() => go(name)}>
              {name}
            </FilterChip>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search these matters"
          />
          <span className="num text-12 text-ink-muted shrink-0">
            {visible.length === rows.length
              ? `${rows.length} shown`
              : `${visible.length} of ${rows.length}`}
            {scope && <span className="font-sans"> · {scope}</span>}
          </span>
        </div>
      </div>

      {/*
        The table scrolls on its own **only once the diary is beside it**.
        Below `xl` the rail is under the table, and a table that keeps its
        own scrollbar there would hide the rail below a region nothing
        scrolls — so there the whole column scrolls as one, which the page
        sets up, and this is simply as tall as its rows.
      */}
      <div className="rounded-table border-rule bg-surface overflow-x-auto border xl:min-h-0 xl:flex-1 xl:overflow-auto">
        {visible.length === 0 ? (
          <p className="text-14 text-ink-muted px-4 py-10 text-center">
            {rows.length > 0
              ? `No matter here matches “${query.trim()}”.`
              : stage
                ? `Nothing at ${stage.toLowerCase()}.`
                : "No notices are open."}
          </p>
        ) : (
          <table className="text-14 w-full min-w-[52rem]">
            <thead>
              <tr className="border-rule bg-surface text-12 text-faint sticky top-0 z-10 border-b text-left">
                <th className="w-[19%] px-3 py-2 font-medium">Client</th>
                <th className="w-[24%] px-3 py-2 font-medium">Notice</th>
                <th className="w-[12%] px-3 py-2 font-medium">Submissions</th>
                <th className="w-[16%] px-3 py-2 font-medium">Next step</th>
                <th className="w-[14%] px-3 py-2 text-right font-medium">
                  At stake
                </th>
                <th className="w-[15%] px-3 py-2 font-medium">Stage</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="border-rule hover:bg-carbon-wash border-b last:border-0"
                >
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/practice/notices/${row.id}`}
                      className="hover:text-carbon font-medium"
                    >
                      {row.client}
                    </Link>
                    {/*
                      Whose matter it is lives under the client's name
                      rather than in a column of its own. Seven columns in
                      the width left beside the diary wrapped every long
                      client name onto three lines, and the name is the
                      thing people look for first.
                    */}
                    <span className="text-12 text-ink-muted block">
                      {[
                        row.risk && `${row.risk} risk`,
                        row.assignee || "nobody",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>

                  <td className="text-13 px-3 py-2 align-top">
                    {[row.law, row.kindLabel].filter(Boolean).join(" · ")}
                    <span className="text-12 text-ink-muted block">
                      {[row.section, row.period].filter(Boolean).join(" · ")}
                      {row.din && <span className="num"> · {row.din}</span>}
                    </span>
                  </td>

                  <td className="text-13 px-3 py-2 align-top whitespace-nowrap">
                    <span className="num">{row.filed}</span> filed
                    {row.owed > 0 && (
                      <>
                        {" · "}
                        <span className="num font-medium">{row.owed}</span> due
                      </>
                    )}
                    {row.hearings > 0 && (
                      <span className="text-12 text-ink-muted block">
                        <span className="num">{row.hearings}</span>{" "}
                        {row.hearings === 1 ? "hearing" : "hearings"}
                      </span>
                    )}
                  </td>

                  <td className="text-13 px-3 py-2 align-top">
                    {row.next ? (
                      <>
                        <span className="block">{row.next.what}</span>
                        <Chip
                          mono
                          className="whitespace-nowrap"
                          tone={
                            row.overdue
                              ? "late"
                              : row.next.days <= 7
                                ? "soon"
                                : "neutral"
                          }
                        >
                          {row.next.date} ·{" "}
                          {row.next.days < 0
                            ? `${Math.abs(row.next.days)}d past`
                            : row.next.days === 0
                              ? "today"
                              : `${row.next.days}d`}
                        </Chip>
                      </>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>

                  <td className="num px-3 py-2 text-right align-top whitespace-nowrap">
                    {row.stake || <span className="text-faint">—</span>}
                    {row.demand && (
                      <span className="text-12 text-redpen block">
                        demand {row.demand}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2 align-top">
                    <Chip tone={row.stage === "Closed" ? "good" : "info"}>
                      {row.stage}
                    </Chip>
                    {row.adjournments.used > 0 && (
                      <span className="text-12 text-ink-muted mt-1 block">
                        {row.adjournments.used} adjourned
                        {row.adjournments.left !== null
                          ? ` · ${row.adjournments.left} left`
                          : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
