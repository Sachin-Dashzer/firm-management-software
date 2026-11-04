"use client";

import Link from "next/link";
import CellPopover from "@/components/ui/CellPopover";

/**
 * The compliance status grid (spec section 8): something down the side,
 * periods across the top, each cell marked by what happened in that period.
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
 *
 * ## The redraw of 04-11-2026
 *
 * **The box explains itself now.** Every cell's explanation was a `title`
 * attribute: a tooltip that does not exist on a phone, takes a second to
 * appear on a laptop, cannot be read by somebody arrowing across the grid,
 * and cannot hold a link. `components/ui/CellPopover` was written for this
 * grid in P3-34 — its own first line is "the compliance grid is eight
 * hundred boxes" — and nothing ever used it. It does now: the box opens
 * what is behind it, with the way through to the job inside.
 *
 * A cell in a period that has not arrived gets no popover. There is
 * nothing behind it, and a box that opens to say "not due yet" is a
 * promise the grid should not make.
 *
 * **The marks are on the ledger grid.** `✓ • ! ½ ‖ × ·` in the body sans
 * each have their own advance width, so a column of them was not a column.
 * In the mono face they sit on one axis down the page, which is the whole
 * point of marking a register this way.
 *
 * **The key explains every mark.** It listed six of the ten the grid can
 * draw — `½`, `×`, `E` and `NE` were on screen and not in the key, and
 * `½` is the one nobody guesses.
 *
 * **The columns are declared.** `table-fixed` and a `colgroup`: a period
 * column as wide as whatever landed in it meant the twelve months were
 * twelve different widths.
 */

const CELL_TONE = {
  done: "bg-filed-wash text-filed",
  filed: "bg-filed-wash text-filed",
  open: "bg-carbon-wash text-carbon",
  /** One of a pair in, the other still owing — neither open nor filed (P3-1). */
  part: "bg-waiting-wash text-waiting font-medium",
  late: "bg-redpen-wash text-redpen",
  missing: "bg-redpen-wash text-redpen font-bold",
  /** Empty, but somebody has said why — not a miss (P3-9). */
  explained: "text-ink-muted",
  held: "bg-waiting-wash text-waiting",
  cancelled: "text-ink-muted",
  current: "text-ink-muted",
  future: "text-faint",
};

/** Every mark the grid can draw, in the order a period moves through them. */
const KEY = [
  { tone: "done", mark: "✓", text: "completed or filed" },
  { tone: "open", mark: "•", text: "in hand" },
  { tone: "part", mark: "½", text: "one of a pair filed, the other owing" },
  { tone: "late", mark: "!", text: "overdue" },
  { tone: "held", mark: "‖", text: "on hold" },
  { tone: "cancelled", mark: "×", text: "cancelled" },
  { tone: "missing", mark: "·", text: "nothing was ever created" },
  { tone: "explained", mark: "E", text: "another professional filed it" },
  { tone: "explained", mark: "NE", text: "client was not engaged then" },
  { tone: "current", mark: "–", text: "this period, not yet due" },
  { tone: "future", mark: "—", text: "period has not started" },
];

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

/** The box: one mark, on the ledger grid, with a finger-sized target. */
const BOX =
  "num rounded-ledger flex h-7 w-full items-center justify-center text-13 leading-none";

/**
 * @param {object} props
 * @param {Array<{code: string, short: string, label?: string}>} props.periods column headings
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
  const labelOf = new Map(periods.map((p) => [p.code, p.label ?? p.short]));

  return (
    <div className="flex flex-col gap-3">
      {/* Arrow keys walk the grid (spec section 15). One tab stop gets you
          in, the arrows move from box to box, Enter opens the one you are
          on — the same way a spreadsheet behaves, which is what this is. */}
      <div
        className="rounded-table border-rule bg-surface overflow-x-auto border"
        onKeyDown={onGridKeys}
      >
        <table className="text-14 w-full table-fixed">
          <caption className="sr-only">
            {caption} Use the arrow keys to move between cells and Enter to open
            one.
          </caption>
          <colgroup>
            {/* the row label needs room for a client's legal name; every
                period gets the same width as every other, which is what
                makes a column readable down the page */}
            <col className="w-[15rem]" />
            {periods.map((p) => (
              <col key={p.code} className="w-[3.25rem]" />
            ))}
          </colgroup>
          <thead>
            <tr className="border-rule bg-sunk border-b text-left">
              <th
                scope="col"
                className="text-11 text-ink-muted bg-sunk sticky left-0 px-3 py-2 font-semibold tracking-wide uppercase"
              >
                {rowHeading}
              </th>
              {periods.map((p) => (
                <th
                  key={p.code}
                  scope="col"
                  className="text-11 text-ink-muted px-1 py-2 text-center font-semibold tracking-wide uppercase"
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
                        className="hover:text-carbon underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:decoration-current"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                    {row.missing > 0 && (
                      <span className="text-12 text-redpen">
                        {" · "}
                        <span className="num">{row.missing}</span> missing
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
                  {row.cells.map((cell, columnIndex) => {
                    const first = rowIndex === 0 && columnIndex === 0;
                    const periodLabel = labelOf.get(cell.period) ?? cell.period;
                    const reading = `${row.name}, ${periodLabel}: ${cell.title}`;

                    /* Nothing is behind a period that has not started, so
                       the box is not a control. A disclosure that opens on
                       nothing teaches people to stop opening them. */
                    if (cell.state === "future") {
                      return (
                        <td key={cell.period} className="px-1 py-1">
                          <span
                            className={`${BOX} ${CELL_TONE.future}`}
                            aria-label={reading}
                          >
                            {cell.label}
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td key={cell.period} className="px-1 py-1">
                        <CellPopover
                          title={`${row.name} · ${periodLabel}`}
                          wrapClassName="block w-full"
                          triggerLabel={reading}
                          triggerClassName={`${BOX} ${CELL_TONE[cell.state]} focus-visible:outline-offset-1`}
                          triggerProps={{
                            "data-cell": `${rowIndex}-${columnIndex}`,
                            tabIndex: first ? 0 : -1,
                          }}
                          trigger={cell.label}
                        >
                          <p className="text-13 text-ink-muted">{cell.title}</p>
                          {cell.engagementId ? (
                            <Link
                              href={`/engagements/${cell.engagementId}`}
                              className="text-13 text-carbon hover:text-carbon-ink font-medium underline underline-offset-4"
                            >
                              Open the job
                            </Link>
                          ) : (
                            <p className="text-12 text-faint">
                              Nothing is on file for this period.
                            </p>
                          )}
                        </CellPopover>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={periods.length + 1}
                  className="text-ink-muted px-3 py-12 text-center"
                >
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <dl className="text-12 text-ink-muted flex flex-wrap gap-x-4 gap-y-1.5">
        {KEY.map((item) => (
          <div key={item.mark} className="flex items-center gap-1.5">
            <dt
              className={`num rounded-ledger text-11 flex h-5 min-w-5 items-center justify-center px-1 leading-none ${CELL_TONE[item.tone]}`}
            >
              {item.mark}
            </dt>
            <dd>{item.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
