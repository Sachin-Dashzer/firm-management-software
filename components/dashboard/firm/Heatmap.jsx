"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { canRun3D } from "@/components/login/capability";
import Panel from "@/components/ui/Panel";
import {
  HEAT_FILL,
  heatThresholds,
  heatStep,
  heatClasses,
} from "@/lib/reports/heat";

/**
 * The next eight weeks (P3-34 phase 3).
 *
 * The same `deadlineTerrain()` data as before, shaded differently. The old
 * grid shaded by `value / peak`, which on this firm's numbers put almost
 * every cell in the bottom shade — one busy week sets the peak and the
 * rest become one flat tone. `lib/reports/heat.js` shades by quantile
 * instead, so whatever spread exists is the spread you see.
 *
 * The branch column is sticky, because eight weeks do not fit on a laptop
 * without scrolling and a row of figures with no name against it is a row
 * of figures about nothing.
 *
 * The 3D landscape stays behind its toggle, loaded only when asked for and
 * never offered to a device that said no.
 */

const Terrain = dynamic(() => import("../DeadlineTerrain"), {
  ssr: false,
  loading: () => (
    <p className="text-13 text-ink-muted p-4">Drawing the landscape…</p>
  ),
});

export default function Heatmap({ data }) {
  const [solid, setSolid] = useState(false);
  const [offer, setOffer] = useState(false);

  // after mount only: the server has no WebGL to ask about, so deciding
  // during render makes the first client paint disagree with the HTML
  useEffect(() => setOffer(canRun3D().ok), []);

  if (!data) return null;

  const thresholds = heatThresholds(
    data.grid.flatMap((row) => row.cells.map((cell) => cell.due)),
  );

  return (
    <Panel
      title="The next eight weeks"
      hint={
        data.total === 0
          ? "Nothing is due in the next eight weeks."
          : "Filings falling due, by branch and week. Click a cell to open those jobs."
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {offer && data.total > 0 ? (
          <button
            type="button"
            onClick={() => setSolid((was) => !was)}
            aria-pressed={solid}
            className="text-13 text-carbon underline-offset-4 hover:underline"
          >
            {solid ? "Show the flat grid" : "Show it as a landscape"}
          </button>
        ) : (
          <span />
        )}

        {!solid && data.total > 0 && (
          <p className="text-12 text-ink-muted flex items-center gap-1.5">
            Fewer
            {HEAT_FILL.map((fill) => (
              <span
                key={fill}
                aria-hidden="true"
                className={`rounded-control size-3 ${fill}`}
              />
            ))}
            More
          </p>
        )}
      </div>

      {solid ? (
        <div className="rounded-table border-rule h-72 overflow-hidden border">
          <Terrain data={data} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1">
            <caption className="sr-only">
              Work due by branch and week. Each figure opens that week&rsquo;s
              list for that branch.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="text-12 text-ink-muted bg-surface sticky left-0 z-10 px-2 py-1 text-left font-medium whitespace-nowrap"
                >
                  Branch · week of
                </th>
                {data.weeks.map((week) => (
                  <th
                    key={week.index}
                    scope="col"
                    className={`num text-12 px-1 py-1 text-center font-medium ${
                      week.index === 0
                        ? "text-carbon font-semibold"
                        : "text-ink-muted"
                    }`}
                  >
                    {week.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.grid.map((row, rowIndex) => (
                <tr key={row.id}>
                  <th
                    scope="row"
                    className="text-13 bg-surface sticky left-0 z-10 px-2 py-1 text-left font-medium whitespace-nowrap"
                  >
                    {row.name}
                  </th>
                  {row.cells.map((cell, colIndex) => (
                    <td key={cell.week} className="p-0">
                      <Cell
                        cell={cell}
                        branch={row.name}
                        step={heatStep(cell.due, thresholds)}
                        index={Math.min(30, rowIndex + colIndex)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** One cell: how much is due, and a way into it. */
function Cell({ cell, branch, step, index }) {
  const title = `${cell.due} ${cell.due === 1 ? "filing" : "filings"} due · ${branch} · week of ${cell.label}`;

  if (cell.due === 0) {
    return (
      <span
        title={`Nothing due · ${branch} · week of ${cell.label}`}
        style={{ "--i": index }}
        className={`anim-cell num text-13 rounded-control grid h-9 min-w-10 place-items-center ${heatClasses(0)}`}
      >
        0
      </span>
    );
  }

  return (
    <Link
      href={cell.href}
      title={title}
      style={{ "--i": index }}
      className={`anim-cell num text-13 rounded-control focus-visible:outline-brass grid h-9 min-w-10 place-items-center font-medium focus-visible:outline-2 ${heatClasses(step)} ${
        cell.overdue > 0 ? "ring-redpen ring-2" : ""
      }`}
    >
      <span className="sr-only">{title}</span>
      {cell.due}
    </Link>
  );
}
