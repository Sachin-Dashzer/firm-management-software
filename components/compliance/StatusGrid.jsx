"use client";

import Link from "next/link";

/**
 * The compliance status grid (spec section 8): something down the side,
 * periods across the top, each cell coloured by what happened in that period.
 *
 * It is used twice over the same cells from `lib/compliance/grid.js`: the
 * firm's screen puts one service's **clients** down the side, and a client's
 * case file puts that client's **services** down the side. One component, so
 * the colours, the keyboard behaviour and — most of all — the mark that means
 * "nothing was ever created here" cannot come to mean two different things on
 * two screens.
 *
 * A missed period is invisible in any list, because there is nothing to list.
 * That is the whole reason this grid exists, so absence gets a mark of its own.
 */

const CELL_TONE = {
  done: "bg-filed-wash text-filed",
  filed: "bg-filed-wash text-filed",
  open: "bg-carbon-wash text-carbon",
  /** One of a pair in, the other still owing — neither open nor filed (P3-1). */
  part: "bg-waiting-wash text-waiting font-medium",
  late: "bg-redpen-wash text-redpen",
  missing: "bg-redpen-wash text-redpen font-bold",
  held: "bg-waiting-wash text-waiting",
  cancelled: "text-ink-muted",
  current: "text-ink-muted",
  future: "text-ink-muted",
};

/**
 * Arrow-key movement across the grid (spec section 15).
 *
 * The cells are found in the DOM by their row and column rather than held
 * in state: the grid is already rendered, and reading where to go next off
 * the markup is both shorter and impossible to get out of step with it.
 */
function onGridKeys(event) {
  const keys = {
    ArrowRight: [0, 1],
    ArrowLeft: [0, -1],
    ArrowDown: [1, 0],
    ArrowUp: [-1, 0],
  };
  const step = keys[event.key];
  if (!step) return;

  const current = event.target.closest?.("[data-cell]");
  if (!current) return;

  const [row, column] = current.dataset.cell.split("-").map(Number);
  const next = event.currentTarget.querySelector(
    `[data-cell="${row + step[0]}-${column + step[1]}"]`,
  );
  if (!next) return;

  event.preventDefault();
  current.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}

/**
 * @param {object} props
 * @param {Array<{code: string, short: string}>} props.periods column headings
 * @param {Array<any>} props.rows from `buildGrid`
 * @param {string} props.caption what the grid is, for a screen reader
 * @param {string} props.rowHeading the heading over the row labels
 * @param {(row: any) => string|null} [props.rowHref] where a row label links
 * @param {string} props.emptyText when there are no rows at all
 */
export default function StatusGrid({
  periods,
  rows,
  caption,
  rowHeading,
  rowHref,
  emptyText,
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Arrow keys walk the grid (spec section 15). One tab stop gets you
          in, the arrows move from cell to cell, Enter opens the one you are
          on — the same way a spreadsheet behaves, which is what this is. */}
      <div
        className="rounded-ledger border-rule bg-surface overflow-x-auto border"
        onKeyDown={onGridKeys}
      >
        <table className="text-14 w-full">
          <caption className="sr-only">
            {caption} Use the arrow keys to move between cells and Enter to open
            one.
          </caption>
          <thead>
            <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th
                scope="col"
                className="bg-surface sticky left-0 px-3 py-2 font-medium"
              >
                {rowHeading}
              </th>
              {periods.map((p) => (
                <th
                  key={p.code}
                  scope="col"
                  className="px-2 py-2 text-center font-medium"
                >
                  {p.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const href = rowHref?.(row) ?? null;
              return (
                <tr key={row.id} className="border-rule border-b last:border-0">
                  <th
                    scope="row"
                    className="bg-surface text-14 sticky left-0 px-3 py-2 text-left font-normal"
                  >
                    {href ? (
                      <Link
                        href={href}
                        className="underline underline-offset-4"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                    {row.missing > 0 && (
                      <span className="text-12 text-redpen">
                        {" "}
                        · {row.missing} missing
                      </span>
                    )}
                    {/* who the row belongs to — the client partner on the
                        firm's grid, nothing on a client's own case file */}
                    {row.note && (
                      <span className="text-12 text-ink-muted block">
                        {row.note}
                      </span>
                    )}
                  </th>
                  {row.cells.map((cell, columnIndex) => (
                    <td key={cell.period} className="px-1 py-1 text-center">
                      {cell.engagementId ? (
                        <Link
                          href={`/engagements/${cell.engagementId}`}
                          title={`${cell.period}: ${cell.title}`}
                          data-cell={`${rowIndex}-${columnIndex}`}
                          // one tab stop for the whole grid: the first cell
                          tabIndex={
                            rowIndex === 0 && columnIndex === 0 ? 0 : -1
                          }
                          aria-label={`${row.name}, ${cell.period}: ${cell.title}`}
                          className={`rounded-ledger block py-1 ${CELL_TONE[cell.state]}`}
                        >
                          {cell.label}
                        </Link>
                      ) : (
                        <span
                          title={`${cell.period}: ${cell.title}`}
                          data-cell={`${rowIndex}-${columnIndex}`}
                          tabIndex={
                            rowIndex === 0 && columnIndex === 0 ? 0 : -1
                          }
                          role="gridcell"
                          aria-label={`${row.name}, ${cell.period}: ${cell.title}`}
                          className={`rounded-ledger block py-1 ${CELL_TONE[cell.state]}`}
                        >
                          {cell.label}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={periods.length + 1}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-12 text-ink-muted flex flex-wrap gap-3">
        <Key tone="done" mark="✓" text="completed" />
        <Key tone="open" mark="•" text="in hand" />
        <Key tone="late" mark="!" text="overdue" />
        <Key tone="missing" mark="·" text="nothing was ever created" />
        <Key tone="held" mark="‖" text="on hold" />
        <Key tone="current" mark="–" text="this period, not yet due" />
      </p>
    </div>
  );
}

function Key({ tone, mark, text }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`rounded px-1.5 ${CELL_TONE[tone]}`}>{mark}</span>
      {text}
    </span>
  );
}
