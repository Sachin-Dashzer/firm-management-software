"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { DueChip, StatusChip } from "../engagements/chips";
import StatusGrid from "@/components/compliance/StatusGrid";
import NeverCreated from "./NeverCreated";
import PageHead from "@/components/ui/PageHead";
import Segmented from "@/components/ui/Segmented";
import StatTile from "@/components/ui/StatTile";
import FilterBar, { FilterSelect } from "@/components/ui/FilterBar";
import {
  TableShell,
  Table,
  Head,
  Th,
  Tr,
  Td,
  Meta,
  Empty,
} from "@/components/ui/Table";

/**
 * The firm's deadlines, three ways (spec section 8): where each head
 * stands, a calendar of what is due, and the grid of what was never filed.
 *
 * The grid is the one that earns its place. A missed month is invisible in
 * any list — there is nothing to see, which is the problem — so the grid
 * shows absence as a mark of its own, and counts it at the top.
 *
 * ## The redraw of 04-11-2026
 *
 * This screen had written out five things the kit already draws, each a
 * little differently from the house version, and the three routes that
 * point at it were indistinguishable once you arrived.
 *
 *  - **`PageHead`, and the route names itself.** All four routes printed
 *    the same `<h1>Compliance</h1>` over the same grey line, so
 *    `/compliance/monthly` and `/compliance/annual` were the same screen
 *    as far as the reader could tell. Each says what it is now, and the
 *    second line is about the data rather than the interface.
 *  - **`Segmented` for the tabs, and they are no longer dead.** The three
 *    sub-routes force the view, and the view tabs still rendered as
 *    though they could change it: pressing "Calendar" on
 *    `/compliance/monthly` set a parameter the route then overrode. On a
 *    forced route the row chooses the **frequency** — monthly, quarterly,
 *    annual, which is the thing those routes actually differ by — and the
 *    other two views are one link away.
 *  - **`FilterBar` (D107)** instead of this screen's own six-column grid
 *    of labelled selects, which is the exact shape D107 was written to
 *    replace.
 *  - **`Table` (D108)** for the heads table and the list, instead of two
 *    more copies of the bordered scroller with a 12px grey header.
 *  - **`StatTile` (D102)** for the figures, instead of a local `Figure`
 *    that put a 24px number over a 13px label in a tinted box.
 *
 * The one thing deliberately left alone is the **calendar**, which is not
 * a list and has no primitive: a month of day cells is its own shape. Its
 * steppers lost their `←`/`→` characters for drawn carets, since the rest
 * of the application uses Phosphor and a glyph arrow sits on the text
 * baseline rather than the button's centre.
 */

/** Monthly, quarterly, annual — the word the firm uses for each head. */
const RECURRENCE = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "half-yearly": "Half-yearly",
  annual: "Yearly",
  "one-time": "One-time",
};

/** What each of the three sub-routes is called, and where it lives. */
const FREQUENCIES = [
  { key: "monthly", label: "Monthly", href: "/compliance/monthly" },
  { key: "quarterly", label: "Quarterly", href: "/compliance/quarterly" },
  { key: "annual", label: "Annual", href: "/compliance/annual" },
];

/**
 * The three views, and **where each one actually lives**.
 *
 * They were `?view=` on whatever path you were standing on, which stopped
 * being true when `/compliance` became its own screen (`Overview.jsx`) and
 * the grid moved to the three frequency routes. `/compliance?view=grid` is
 * not a thing the index handles, so that tab quietly landed back on the
 * index — the same dead control as the forced-route tabs, one level up.
 *
 * The words match the index's own tabs, because they are the same three
 * views and a reader should not have to work out that "Calendar" and
 * "Next 30 days" are one thing.
 */
const VIEWS = [
  { key: "heads", label: "By head", href: "/compliance" },
  { key: "grid", label: "Status grid", href: "/compliance/monthly" },
  { key: "calendar", label: "Next 30 days", href: "/compliance?view=next30" },
];

export default function ComplianceViews({
  view,
  rows = [],
  grid,
  heads,
  gridService,
  neverCreated = [],
  fyStart,
  params,
  branches,
  services,
  team,
  partners,
  statuses,
  freq = "",
  forced = {},
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

  const fyLabel = fyStart
    ? `FY ${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`
    : "";

  /** The noun, which is the route and not the view. */
  const title = forced.freq
    ? `${FREQUENCIES.find((f) => f.key === freq)?.label ?? "Compliance"} compliance`
    : "Compliance";

  /** One line about the data — never about the filters underneath it. */
  const sub = forced.freq ? (
    <>
      Every client signed up for a {freq} filing, period by period
      {fyLabel ? `, ${fyLabel}` : ""}.{" "}
      {grid?.totalMissing
        ? `${grid.totalMissing} closed periods have nothing against them.`
        : "Nothing has been missed."}
    </>
  ) : view === "heads" ? (
    <>
      Where GST, TDS, ITR, audit and ROC stand{fyLabel ? ` in ${fyLabel}` : ""}.
      The client-by-client answer is one click off any line.
    </>
  ) : view === "grid" ? (
    <>
      {gridService?.name ?? "One service"} by client and period
      {fyLabel ? `, ${fyLabel}` : ""}. An empty box that nobody has explained is
      the thing a list can never show.
    </>
  ) : (
    <>{rows.length} dated jobs, soonest first. What is due, and who has it.</>
  );

  const anyFilter = Boolean(
    params.service ||
    params.partner ||
    params.branch ||
    params.status ||
    params.assignee,
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      <PageHead title={title} sub={sub}>
        {forced.freq && (
          <Link
            href="/compliance"
            className="text-13 text-ink-muted hover:text-carbon underline underline-offset-4"
          >
            All heads and the calendar
          </Link>
        )}
      </PageHead>

      {/*
        On a forced route the row chooses the frequency; on `/compliance`
        it chooses the view. Either way every item in it goes somewhere
        that changes the screen.
      */}
      {forced.freq ? (
        <Segmented
          label="Which filings"
          variant="underline"
          value={freq}
          items={FREQUENCIES}
        />
      ) : (
        <Segmented
          label="How to read the deadlines"
          variant="underline"
          value={view}
          items={VIEWS}
        />
      )}

      <FilterBar
        action={pathname}
        search={false}
        active={anyFilter}
        hidden={<input type="hidden" name="view" value={view} />}
        primary={
          <>
            {view !== "heads" && (
              <FilterSelect
                label="Service"
                name="service"
                value={params.service}
                empty={view === "grid" ? undefined : "Any"}
                options={services.map((s) => [s.id, s.name])}
              />
            )}
            <FilterSelect
              label="Client partner"
              name="partner"
              value={params.partner}
              options={partners.map((p) => [p.id, p.name])}
            />
            {view !== "calendar" ? (
              <FilterSelect
                label="Year"
                name="fy"
                value={String(fyStart ?? "")}
                options={[0, 1, 2].map((back) => {
                  const year = (fyStart ?? new Date().getFullYear()) - back;
                  return [
                    String(year),
                    `FY ${year}-${String((year + 1) % 100).padStart(2, "0")}`,
                  ];
                })}
              />
            ) : (
              <>
                <FilterSelect
                  label="Status"
                  name="status"
                  value={params.status}
                  options={statuses.map((s) => [s, s])}
                />
                <FilterSelect
                  label="Assignee"
                  name="assignee"
                  value={params.assignee}
                  options={team.map((u) => [u.id, u.name])}
                />
              </>
            )}
            <FilterSelect
              label="Branch"
              name="branch"
              value={params.branch}
              options={branches.map((b) => [b.id, b.code])}
            />
          </>
        }
      />

      {view === "heads" ? (
        <Heads heads={heads} fyLabel={fyLabel} linkTo={linkTo} />
      ) : view === "grid" ? (
        <Grid
          grid={grid}
          service={gridService}
          neverCreated={neverCreated}
          fyStart={fyStart}
          linkTo={linkTo}
        />
      ) : (
        <>
          <Segmented
            label="How to lay the calendar out"
            value={mode}
            onSelect={setMode}
            items={[
              { key: "month", label: "Month" },
              { key: "week", label: "Week" },
              { key: "list", label: "List" },
            ]}
          />
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

/**
 * Where each head of compliance stands: GST, TDS, ITR, audit, ROC.
 *
 * One line per service, grouped under the catalog's categories, because the
 * first question of any month is not "which client" but "which head is
 * behind". The client-by-client answer is one click away on every line.
 */
function Heads({ heads, fyLabel, linkTo }) {
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
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Open"
          value={heads.totals.open}
          note="created and not finished"
          href="/compliance?view=next30"
          tone="info"
        />
        <StatTile
          label="Open and overdue"
          value={heads.totals.overdue}
          note="past the date on the job"
          href="/compliance?view=next30"
          tone={heads.totals.overdue > 0 ? "late" : "plain"}
        />
        <StatTile
          label="Periods with nothing created"
          value={heads.totals.missing}
          note="closed, and never opened"
          href="#the-grid"
          tone={heads.totals.missing > 0 ? "late" : "plain"}
        />
      </div>

      {heads.categories.map((category) => (
        <section key={category.name} className="flex flex-col gap-2">
          <h2 className="font-display text-15 font-semibold">
            {category.name}
          </h2>
          <TableShell>
            <Table caption={`${category.name} in ${fyLabel}`}>
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[11%]" />
              </colgroup>
              <Head>
                <Th>Head</Th>
                <Th>Basis</Th>
                <Th align="right">Clients</Th>
                <Th rule align="right">
                  Created
                </Th>
                <Th align="right">Done</Th>
                <Th align="right">Open</Th>
                <Th align="right">Overdue</Th>
                <Th align="right">Not created</Th>
              </Head>
              <tbody>
                {category.lines.map((line) => (
                  <Tr key={line.id}>
                    <Td>
                      <Link
                        href={linkTo({
                          view: "grid",
                          service: line.id,
                        })}
                        className="hover:text-carbon font-medium underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:decoration-current"
                      >
                        {line.name}
                      </Link>
                      <Meta className="num">{line.code}</Meta>
                    </Td>
                    <Td className="text-13 text-ink-muted">
                      {RECURRENCE[line.recurrence] ?? line.recurrence}
                    </Td>
                    <Count value={line.clients} />
                    <Count value={line.created} rule />
                    <Count value={line.done} />
                    <Count value={line.open} />
                    <Count value={line.overdue} bad />
                    <Count value={line.missing} bad />
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableShell>
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

/** A figure in a column of figures: nought is a dash, bad is red. */
function Count({ value, bad, rule }) {
  return (
    <Td align="right" rule={rule}>
      {value ? (
        <span className={`num ${bad ? "text-redpen font-medium" : ""}`}>
          {value}
        </span>
      ) : (
        <span className="text-faint">—</span>
      )}
    </Td>
  );
}

function Grid({ grid, service, neverCreated = [], fyStart, linkTo }) {
  if (!service || !grid) {
    return (
      <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
        Choose a service to see its grid. Nothing is listed until the catalog
        has at least one active service.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Nobody has answered for"
          value={grid.totalMissing}
          note="closed periods with nothing in them"
          href="#never-created"
          tone={grid.totalMissing > 0 ? "late" : "plain"}
        />
        <StatTile
          label="Explained, not a miss"
          value={grid.totalExplained}
          note="another professional, or not engaged then"
          href="#the-grid"
          tone="plain"
        />
        <StatTile
          label="Open and overdue"
          value={grid.totalLate}
          note="created, past its date"
          href="/compliance?view=next30"
          tone={grid.totalLate > 0 ? "late" : "plain"}
        />
      </div>

      {/*
        The grid comes before the worklist.

        They were the other way round, and on a service with ten unanswered
        periods the worklist is ten rows of two buttons — so the grid, which
        is the thing this screen is, started below the fold and the first
        thing a partner saw was a column of identical amber rows. The tile
        above counts them and links down; that is what a tile is for.

        The tile for explained periods points at the grid itself: there is
        no list of them to open, and the grid is where the E and NE marks
        are.
      */}
      <div id="the-grid" className="scroll-mt-4">
        <StatusGrid
          periods={grid.periods}
          rows={grid.rows}
          caption={`${service.name} by client and period.`}
          rowHeading="Client"
          rowHref={(row) => `/clients/${row.id}`}
          emptyText={`No client is signed up for ${service.name} yet.`}
        />
      </div>

      {neverCreated.length > 0 && (
        <div id="never-created" className="scroll-mt-4">
          <NeverCreated
            rows={neverCreated}
            service={service}
            fyStart={fyStart}
          />
        </div>
      )}
    </div>
  );
}

function ListView({ rows }) {
  const dated = rows.filter((r) => r.dueISO);
  const undated = rows.filter((r) => !r.dueISO);

  return (
    <div className="flex flex-col gap-3">
      <TableShell>
        <Table caption="Dated work, soonest first">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[26%]" />
            <col />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
          </colgroup>
          <Head>
            <Th>Due</Th>
            <Th>Client</Th>
            <Th>Work</Th>
            <Th>Status</Th>
            <Th>Assignee</Th>
          </Head>
          <tbody>
            {dated.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <DueChip
                    label={r.statutory ? "Statutory" : "Internal"}
                    date={r.due}
                    days={r.dueDays}
                  />
                </Td>
                <Td>
                  <Link
                    href={`/engagements/${r.id}`}
                    className="hover:text-carbon font-medium underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:decoration-current"
                  >
                    {r.client}
                  </Link>
                  <Meta className="num">{r.code}</Meta>
                </Td>
                <Td className="text-13">
                  {r.service}
                  <Meta>{r.period}</Meta>
                </Td>
                <Td>
                  <StatusChip status={r.status} />
                </Td>
                <Td className="text-13 text-ink-muted">{r.assignee}</Td>
              </Tr>
            ))}
            {dated.length === 0 && (
              <Empty colSpan={5}>
                Nothing with a date matches these filters.
              </Empty>
            )}
          </tbody>
        </Table>
      </TableShell>

      {undated.length > 0 && (
        <p className="text-13 text-ink-muted max-w-[72ch]">
          <span className="num">{undated.length}</span> more have no date yet —
          either the service has no due-date rule, or its rule has not been
          confirmed in{" "}
          <Link
            href="/settings/due-dates"
            className="text-carbon hover:text-carbon-ink underline underline-offset-4"
          >
            Settings → Due dates
          </Link>
          .
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
  const todayISO = toISO(today);

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
      <div className="rounded-table border-rule bg-rule grid grid-cols-7 gap-px overflow-hidden border">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="bg-sunk text-11 text-ink-muted px-2 py-2 font-semibold tracking-wide uppercase"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} className="bg-sunk/40 min-h-24" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const date = new Date(year, monthIndex, i + 1);
          const iso = toISO(date);
          const list = rows.filter((r) => r.dueISO === iso);
          const isToday = iso === todayISO;
          return (
            <div
              key={iso}
              className={`flex min-h-24 flex-col gap-1 p-1.5 ${
                isToday ? "bg-carbon-wash" : "bg-surface"
              }`}
            >
              {/* today is the one day on the sheet somebody is looking for */}
              <span
                className={`num text-12 ${
                  isToday ? "text-carbon font-semibold" : "text-ink-muted"
                }`}
              >
                {i + 1}
                {isToday && <span className="sr-only"> (today)</span>}
              </span>
              {list.slice(0, 4).map((r) => (
                <Pill key={r.id} row={r} />
              ))}
              {list.length > 4 && (
                <span className="text-12 text-ink-muted">
                  +<span className="num">{list.length - 4}</span> more
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
      aria-label={`${row.client}, ${row.service}, ${row.status}, due ${row.due}`}
      className={`text-12 truncate rounded px-1 py-0.5 transition-opacity duration-150 hover:opacity-80 ${
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
    <div className="flex items-center gap-2">
      <StepButton onClick={onBack} label="Previous">
        <CaretLeft size={16} weight="bold" aria-hidden="true" />
      </StepButton>
      <h2 className="font-display text-15 min-w-[14ch] font-semibold">
        {label}
      </h2>
      <StepButton onClick={onForward} label="Next">
        <CaretRight size={16} weight="bold" aria-hidden="true" />
      </StepButton>
    </div>
  );
}

function StepButton({ onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-control border-rule bg-surface hover:bg-carbon-wash hover:border-carbon grid size-9 place-items-center border transition-colors duration-150"
    >
      {children}
    </button>
  );
}

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}
