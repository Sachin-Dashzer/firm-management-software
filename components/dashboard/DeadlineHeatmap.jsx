"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { canRun3D } from "@/components/login/capability";

/**
 * The deadline landscape (spec section 15), flat.
 *
 * This is the default view and the only one on a device that should not be
 * running WebGL. It is also the honest one: a ledger square per branch per
 * week, shaded by how much is due and outlined in red pen where some of it
 * is already late, with every square a link to the work it counted.
 *
 * The 3D terrain is the same numbers given height. It is offered behind a
 * toggle, loaded only when asked for, and the toggle is not even shown on
 * a device that told us not to (spec section 15's rules for 3D).
 */

const Terrain = dynamic(() => import("./DeadlineTerrain"), {
  ssr: false,
  loading: () => (
    <p className="text-13 text-ink-muted p-4">Drawing the landscape…</p>
  ),
});

export default function DeadlineHeatmap({ data }) {
  const [solid, setSolid] = useState(false);
  const [offer, setOffer] = useState(false);

  // after mount only: the server has no WebGL to ask about, so deciding
  // during render makes the first client paint disagree with the HTML
  useEffect(() => setOffer(canRun3D().ok), []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-13 text-ink-muted">
          {data.total === 0
            ? "Nothing is due in the next eight weeks."
            : `${data.total} ${data.total === 1 ? "job" : "jobs"} due over the next eight weeks. Red means already late.`}
        </p>
        {offer && data.total > 0 && (
          <button
            type="button"
            onClick={() => setSolid((was) => !was)}
            aria-pressed={solid}
            className="text-13 underline underline-offset-4"
          >
            {solid ? "Show the flat grid" : "Show it as a landscape"}
          </button>
        )}
      </div>

      {solid ? (
        <div className="rounded-ledger border-rule bg-surface h-72 overflow-hidden border">
          <Terrain data={data} />
        </div>
      ) : (
        <div className="rounded-table border-rule bg-surface overflow-x-auto border p-3">
          <table className="text-13 w-full">
            <caption className="sr-only">
              Work due by branch and week. Each figure links to that
              week&rsquo;s list.
            </caption>
            <thead>
              <tr className="text-12 text-ink-muted">
                <th scope="col" className="px-2 py-1 text-left font-medium">
                  Branch
                </th>
                {data.weeks.map((week) => (
                  <th
                    key={week.index}
                    scope="col"
                    className="num px-1 py-1 text-center font-medium"
                  >
                    {week.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.grid.map((row) => (
                <tr key={row.id}>
                  <th
                    scope="row"
                    className="text-13 px-2 py-1 text-left font-normal whitespace-nowrap"
                  >
                    {row.name}
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.week} className="p-0.5">
                      <Cell cell={cell} peak={data.peak} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One ledger square: depth of ink for how much, red pen for how late. */
function Cell({ cell, peak }) {
  if (cell.due === 0) {
    return (
      <span
        className="border-rule block h-9 rounded-sm border"
        aria-hidden="true"
      />
    );
  }

  // four steps rather than a continuous ramp: a reader can tell four
  // shades apart, and cannot tell 38% from 44%
  const step = Math.ceil((cell.due / peak) * 4);
  const ink = [
    "bg-carbon-wash",
    "bg-carbon/25",
    "bg-carbon/45",
    "bg-carbon/65",
  ][Math.min(3, Math.max(0, step - 1))];

  return (
    <Link
      href={cell.href}
      title={`${cell.due} due, ${cell.overdue} late`}
      className={`num text-13 focus-visible:outline-brass grid h-9 min-w-9 place-items-center rounded-sm focus-visible:outline-2 ${ink} ${
        cell.overdue > 0 ? "border-redpen border-2" : "border-rule border"
      } ${step >= 3 ? "text-white" : "text-ink"}`}
    >
      <span className="sr-only">
        {cell.due} due in the week of {cell.label}
        {cell.overdue > 0 ? `, ${cell.overdue} already late` : ""}:{" "}
      </span>
      {cell.due}
    </Link>
  );
}
