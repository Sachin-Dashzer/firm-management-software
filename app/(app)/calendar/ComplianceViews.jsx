"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { DueChip, StatusChip } from "../engagements/chips";

/**
 * The firm's deadlines, two ways (spec section 8): a calendar of what is
 * due, and the grid of what was never filed.
 *
 * The grid is the one that earns its place. A missed month is invisible in
 * any list — there is nothing to see, which is the problem — so the grid
 * shows absence as a mark of its own, and counts it at the top.
 */
export default function ComplianceViews({
  view,
  rows = [],
  grid,
  gridService,
  fyStart,
  params,
  branches,
  services,
  team,
  statuses,
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState("month");

  function linkTo(changes) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `${pathname}?${next}`;
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-28 font-semibold">Compliance</h1>
        <p className="text-13 text-ink-muted">
          What is due, and what was never filed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["calendar", "Calendar"],
          ["grid", "Status grid"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={linkTo({ view: key === "calendar" ? "" : key })}
            aria-current={view === key ? "page" : undefined}
            className={`rounded-ledger text-14 h-9 border px-3 leading-9 ${
              view === key
                ? "border-carbon bg-carbon-wash text-carbon"
                : "border-rule hover:bg-carbon-wash"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <form
        method="get"
        className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input type="hidden" name="view" value={view} />
        <Filter
          label="Service"
          name="service"
          value={params.service}
          options={services.map((s) => [s.id, s.name])}
          includeAny={view !== "grid"}
        />
        {view === "grid" ? (
          <Filter
            label="Financial year"
            name="fy"
            value={String(fyStart ?? "")}
            options={[0, 1, 2].map((back) => {
              const year = (fyStart ?? new Date().getFullYear()) - back;
              return [
                String(year),
                `FY ${year}-${String((year + 1) % 100).padStart(2, "0")}`,
              ];
            })}
            includeAny={false}
          />
        ) : (
          <>
            <Filter
              label="Status"
              name="status"
              value={params.status}
              options={statuses.map((s) => [s, s])}
            />
            <Filter
              label="Assignee"
              name="assignee"
              value={params.assignee}
              options={team.map((u) => [u.id, u.name])}
            />
          </>
        )}
        <Filter
          label="Branch"
          name="branch"
          value={params.branch}
          options={branches.map((b) => [b.id, b.code])}
        />
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
          >
            Filter
          </button>
          <Link
            href={view === "grid" ? "/calendar?view=grid" : "/calendar"}
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Clear
          </Link>
        </div>
      </form>

      {view === "grid" ? (
        <Grid grid={grid} service={gridService} />
      ) : (
        <>
          <div className="flex gap-2">
            {[
              ["month", "Month"],
              ["week", "Week"],
              ["list", "List"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                aria-pressed={mode === key}
                className={`rounded-ledger text-14 h-9 border px-3 ${
                  mode === key
                    ? "border-carbon bg-carbon-wash text-carbon"
                    : "border-rule"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "list" ? (
            <ListView rows={rows} />
          ) : (
            <CalendarView rows={rows} weeks={mode === "week"} />
          )}
        </>
      )}
    </div>
  );
}

const CELL_TONE = {
  done: "bg-filed-wash text-filed",
  filed: "bg-filed-wash text-filed",
  open: "bg-carbon-wash text-carbon",
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
  // only one cell is ever in the tab order, and it is the one you are on
  current.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}

function Grid({ grid, service }) {
  if (!service || !grid) {
    return (
      <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
        Choose a service to see its grid. Nothing is listed until the catalog
        has at least one active service.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Figure
          label="Periods with nothing created"
          value={grid.totalMissing}
          tone={grid.totalMissing > 0}
        />
        <Figure
          label="Open and overdue"
          value={grid.totalLate}
          tone={grid.totalLate > 0}
        />
      </div>

      {/* Arrow keys walk the grid (spec section 15). One tab stop gets you
          in, the arrows move from cell to cell, Enter opens the one you are
          on — the same way a spreadsheet behaves, which is what this is. */}
      <div
        className="rounded-ledger border-rule bg-surface overflow-x-auto border"
        onKeyDown={onGridKeys}
      >
        <table className="text-14 w-full">
          <caption className="sr-only">
            {service.name} by client and period. Use the arrow keys to move
            between cells and Enter to open one.
          </caption>
          <thead>
            <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th
                scope="col"
                className="bg-surface sticky left-0 px-3 py-2 font-medium"
              >
                Client
              </th>
              {grid.periods.map((p) => (
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
            {grid.rows.map((row, rowIndex) => (
              <tr key={row.id} className="border-rule border-b last:border-0">
                <th
                  scope="row"
                  className="bg-surface text-14 sticky left-0 px-3 py-2 text-left font-normal"
                >
                  <Link
                    href={`/clients/${row.id}`}
                    className="underline underline-offset-4"
                  >
                    {row.name}
                  </Link>
                  {row.missing > 0 && (
                    <span className="text-12 text-redpen">
                      {" "}
                      · {row.missing} missing
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
                        tabIndex={rowIndex === 0 && columnIndex === 0 ? 0 : -1}
                        aria-label={`${row.name}, ${cell.period}: ${cell.title}`}
                        className={`rounded-ledger block py-1 ${CELL_TONE[cell.state]}`}
                      >
                        {cell.label}
                      </Link>
                    ) : (
                      <span
                        title={`${cell.period}: ${cell.title}`}
                        data-cell={`${rowIndex}-${columnIndex}`}
                        tabIndex={rowIndex === 0 && columnIndex === 0 ? 0 : -1}
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
            ))}
            {grid.rows.length === 0 && (
              <tr>
                <td
                  colSpan={grid.periods.length + 1}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  No client is signed up for {service.name} yet.
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

function Figure({ label, value, tone }) {
  return (
    <div
      className={`rounded-ledger border p-3 ${
        tone ? "border-redpen bg-redpen-wash" : "border-rule bg-surface"
      }`}
    >
      <p className="num font-display text-24">{value}</p>
      <p className="text-13 text-ink-muted">{label}</p>
    </div>
  );
}

function ListView({ rows }) {
  const dated = rows.filter((r) => r.dueISO);
  const undated = rows.filter((r) => !r.dueISO);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Work</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {dated.map((r) => (
              <tr key={r.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2">
                  <DueChip
                    label={r.statutory ? "Statutory" : "Internal"}
                    date={r.due}
                    days={r.dueDays}
                  />
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/engagements/${r.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {r.client}
                  </Link>
                </td>
                <td className="text-13 px-3 py-2">
                  {r.service} · {r.period}
                </td>
                <td className="px-3 py-2">
                  <StatusChip status={r.status} />
                </td>
                <td className="text-13 px-3 py-2">{r.assignee}</td>
              </tr>
            ))}
            {dated.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  Nothing with a date matches these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {undated.length > 0 && (
        <p className="text-13 text-ink-muted">
          {undated.length} more have no date yet — either the service has no
          due-date rule, or its rule has not been confirmed in Settings → Due
          dates.
        </p>
      )}
    </div>
  );
}

/** A month, or the seven days from today. */
function CalendarView({ rows, weeks }) {
  const [offset, setOffset] = useState(0);
  const today = new Date();

  if (weeks) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() + i + offset * 7);
      return date;
    });

    return (
      <div className="flex flex-col gap-3">
        <Stepper
          label={`${days[0].toLocaleDateString("en-GB")} – ${days[6].toLocaleDateString("en-GB")}`}
          onBack={() => setOffset(offset - 1)}
          onForward={() => setOffset(offset + 1)}
        />
        <div className="grid gap-2 sm:grid-cols-7">
          {days.map((date) => {
            const iso = toISO(date);
            const list = rows.filter((r) => r.dueISO === iso);
            return (
              <section
                key={iso}
                className="rounded-ledger border-rule bg-surface flex min-h-32 flex-col gap-1 border p-2"
              >
                <p className="text-12 text-ink-muted">
                  {date.toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                  })}
                </p>
                {list.map((r) => (
                  <Pill key={r.id} row={r} />
                ))}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  return (
    <div className="flex flex-col gap-3">
      <Stepper
        label={month.toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        })}
        onBack={() => setOffset(offset - 1)}
        onForward={() => setOffset(offset + 1)}
      />
      <div className="rounded-ledger border-rule bg-surface grid grid-cols-7 gap-px border p-px">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="bg-surface text-12 text-ink-muted px-2 py-1 font-medium tracking-wide uppercase"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} className="bg-surface min-h-24" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const date = new Date(year, monthIndex, i + 1);
          const iso = toISO(date);
          const list = rows.filter((r) => r.dueISO === iso);
          return (
            <div
              key={iso}
              className="bg-paper flex min-h-24 flex-col gap-1 p-1"
            >
              <span className="num text-12 text-ink-muted">{i + 1}</span>
              {list.slice(0, 4).map((r) => (
                <Pill key={r.id} row={r} />
              ))}
              {list.length > 4 && (
                <span className="text-12 text-ink-muted">
                  +{list.length - 4} more
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pill({ row }) {
  return (
    <Link
      href={`/engagements/${row.id}`}
      title={`${row.client} · ${row.service} · ${row.status}`}
      className={`text-12 truncate rounded px-1 ${
        row.dueDays < 0
          ? "bg-redpen-wash text-redpen"
          : row.statutory
            ? "bg-waiting-wash text-waiting"
            : "bg-carbon-wash text-carbon"
      }`}
    >
      {row.client}
    </Link>
  );
}

function Stepper({ label, onBack, onForward }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="rounded-ledger border-rule text-14 h-9 border px-3"
      >
        ← Previous
      </button>
      <h2 className="font-display text-20">{label}</h2>
      <button
        type="button"
        onClick={onForward}
        className="rounded-ledger border-rule text-14 h-9 border px-3"
      >
        Next →
      </button>
    </div>
  );
}

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function Filter({ label, name, value = "", options, includeAny = true }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
      >
        {includeAny && <option value="">Any</option>}
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
