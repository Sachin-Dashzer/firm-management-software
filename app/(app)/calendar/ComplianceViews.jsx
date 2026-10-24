"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { DueChip, StatusChip } from "../engagements/chips";
import StatusGrid from "@/components/compliance/StatusGrid";

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
  heads,
  gridService,
  fyStart,
  params,
  branches,
  services,
  team,
  partners,
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
          Where each head stands, what is due, and what was never filed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["heads", "By head"],
          ["calendar", "Calendar"],
          ["grid", "Status grid"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={linkTo({ view: key === "heads" ? "" : key })}
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
        {view !== "heads" && (
          <Filter
            label="Service"
            name="service"
            value={params.service}
            options={services.map((s) => [s.id, s.name])}
            includeAny={view !== "grid"}
          />
        )}
        <Filter
          label="Client partner"
          name="partner"
          value={params.partner}
          options={partners.map((p) => [p.id, p.name])}
        />
        {view !== "calendar" ? (
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
            href={view === "heads" ? "/calendar" : `/calendar?view=${view}`}
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Clear
          </Link>
        </div>
      </form>

      {view === "heads" ? (
        <Heads heads={heads} fyStart={fyStart} linkTo={linkTo} />
      ) : view === "grid" ? (
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

/** Monthly, quarterly, annual — the word the firm uses for each head. */
const RECURRENCE = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "half-yearly": "Half-yearly",
  annual: "Yearly",
  "one-time": "One-time",
};

/**
 * Where each head of compliance stands: GST, TDS, ITR, audit, ROC.
 *
 * One line per service, grouped under the catalog's categories, because the
 * first question of any month is not "which client" but "which head is
 * behind". The client-by-client answer is one click away on every line.
 */
function Heads({ heads, fyStart, linkTo }) {
  if (!heads || heads.categories.length === 0) {
    return (
      <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
        Nothing is listed until the service catalog has at least one active
        service.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Figure label="Open" value={heads.totals.open} />
        <Figure
          label="Open and overdue"
          value={heads.totals.overdue}
          tone={heads.totals.overdue > 0}
        />
        <Figure
          label="Periods with nothing created"
          value={heads.totals.missing}
          tone={heads.totals.missing > 0}
        />
      </div>

      {heads.categories.map((category) => (
        <section key={category.name} className="flex flex-col gap-2">
          <h2 className="font-display text-20">{category.name}</h2>
          <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <caption className="sr-only">
                {category.name} in FY {fyStart}-
                {String((fyStart + 1) % 100).padStart(2, "0")}
              </caption>
              <thead>
                <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                  <th className="px-3 py-2 font-medium">Head</th>
                  <th className="px-3 py-2 font-medium">Basis</th>
                  <th className="px-3 py-2 text-right font-medium">Clients</th>
                  <th className="px-3 py-2 text-right font-medium">Created</th>
                  <th className="px-3 py-2 text-right font-medium">Done</th>
                  <th className="px-3 py-2 text-right font-medium">Open</th>
                  <th className="px-3 py-2 text-right font-medium">Overdue</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Not created
                  </th>
                </tr>
              </thead>
              <tbody>
                {category.lines.map((line) => (
                  <tr
                    key={line.id}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={linkTo({
                          view: "grid",
                          service: line.id,
                          fy: String(fyStart),
                        })}
                        className="font-medium underline underline-offset-4"
                      >
                        {line.name}
                      </Link>
                      <span className="text-12 text-ink-muted block font-mono">
                        {line.code}
                      </span>
                    </td>
                    <td className="text-13 px-3 py-2">
                      {RECURRENCE[line.recurrence] ?? line.recurrence}
                    </td>
                    <Count value={line.clients} />
                    <Count value={line.created} />
                    <Count value={line.done} />
                    <Count value={line.open} />
                    <Count value={line.overdue} bad />
                    <Count value={line.missing} bad />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-13 text-ink-muted max-w-[72ch]">
        <strong>Not created</strong> counts periods that have closed with no
        engagement against them at all — the hole a list can never show, because
        there is nothing in it to list. It is worked out from the clients signed
        up for the service; open the head to see exactly which client and which
        month.
      </p>
    </div>
  );
}

function Count({ value, bad }) {
  return (
    <td
      className={`num px-3 py-2 text-right ${
        bad && value > 0 ? "text-redpen font-medium" : ""
      }`}
    >
      {value || <span className="text-ink-muted">—</span>}
    </td>
  );
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

      <StatusGrid
        periods={grid.periods}
        rows={grid.rows}
        caption={`${service.name} by client and period.`}
        rowHeading="Client"
        rowHref={(row) => `/clients/${row.id}`}
        emptyText={`No client is signed up for ${service.name} yet.`}
      />
    </div>
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
