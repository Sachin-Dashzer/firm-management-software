"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import TierBadge from "@/components/ledger/TierBadge";
import { setServiceActive } from "./actions";
import { Result } from "@/components/ui/Notice";

/**
 * The catalog (redrawn 03-11-2026).
 *
 * ## What was wrong with it
 *
 * **Nine columns in ten tables.** Each of the ten categories printed its
 * own nine-cell header — seventy cells of chrome around twenty-five rows of
 * data — and nine columns do not fit the settings column, so the whole
 * thing sat in an `overflow-x-auto`. On a laptop the column scrolled off
 * the right was *Actions*, which is what somebody opened the page to
 * reach.
 *
 * **Everything at the same weight.** Version, SAC, recurrence, turnaround,
 * fee and two counts, all `text-13`, all equally loud, around the one
 * thing anybody scans by: the name.
 *
 * **A warning that led nowhere.** "Some services have no SAC code yet",
 * above a list with no way to find them.
 *
 * ## What it is now
 *
 * Rows, not columns — a service is a name, a tier and five short facts,
 * which reads as two lines and never needs sideways scrolling. One list,
 * category headings instead of ten repeated headers.
 *
 * The warnings became **counted filters**. A count you can click is worth
 * more than a sentence saying the same thing, and the four that matter are
 * the four ways a service is not finished being set up: no SAC, no steps,
 * a checklist nobody has divided by step, and archived.
 */
export default function CatalogList({
  rows,
  categories,
  editable,
  showArchived,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      all: rows.length,
      noSac: rows.filter((r) => !r.sac && r.active).length,
      noSteps: rows.filter((r) => r.stepCount === 0 && r.active).length,
      undivided: rows.filter((r) => r.looseItems > 0 && r.active).length,
      archived: rows.filter((r) => !r.active).length,
    }),
    [rows],
  );

  /**
   * Filter, then search, then group — in that order, so the numbers on the
   * chips describe the catalog and not whatever is typed in the box.
   */
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = rows.filter((row) => {
      if (filter === "noSac" && (row.sac || !row.active)) return false;
      if (filter === "noSteps" && (row.stepCount > 0 || !row.active))
        return false;
      if (filter === "undivided" && (row.looseItems === 0 || !row.active))
        return false;
      if (filter === "archived" && row.active) return false;
      if (!needle) return true;
      return `${row.name} ${row.code} ${row.category}`
        .toLowerCase()
        .includes(needle);
    });

    return categories
      .map((category) => [
        category,
        matches.filter((row) => row.category === category),
      ])
      .filter(([, list]) => list.length > 0);
  }, [rows, categories, filter, query]);

  const shown = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* --- toolbar ------------------------------------------------------ */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search services</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, code or category"
              className="rounded-control border-rule bg-paper text-14 h-9 w-full min-w-[12rem] border px-2"
            />
          </label>
          <Link
            href={showArchived ? "/settings/services" : "?archived=1"}
            className="rounded-control border-rule hover:bg-carbon-wash text-13 flex h-9 shrink-0 items-center border px-3"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Chip
            on={filter === "all"}
            onClick={() => setFilter("all")}
            count={counts.all}
          >
            All
          </Chip>
          <Chip
            on={filter === "noSac"}
            onClick={() => setFilter("noSac")}
            count={counts.noSac}
            tone="warn"
          >
            No SAC code
          </Chip>
          <Chip
            on={filter === "noSteps"}
            onClick={() => setFilter("noSteps")}
            count={counts.noSteps}
            tone="warn"
          >
            No steps
          </Chip>
          <Chip
            on={filter === "undivided"}
            onClick={() => setFilter("undivided")}
            count={counts.undivided}
            tone="warn"
          >
            Checklist not split by step
          </Chip>
          {showArchived && (
            <Chip
              on={filter === "archived"}
              onClick={() => setFilter("archived")}
              count={counts.archived}
            >
              Archived
            </Chip>
          )}
        </div>
      </div>

      <Result message={message} />

      {filter === "noSac" && counts.noSac > 0 && (
        <p className="text-13 text-ink-muted">
          A SAC code goes on the GST invoice, so these want filling in before
          the service is billed.
        </p>
      )}
      {filter === "undivided" && counts.undivided > 0 && (
        <p className="text-13 text-ink-muted max-w-[72ch]">
          Every document on these is attached to the whole job rather than to
          the step that asks for it, so a job shows all of them on step one.
          Open the service and move each one onto its step.
        </p>
      )}

      {/* --- the catalog -------------------------------------------------- */}
      {shown === 0 ? (
        <p className="text-13 text-ink-muted rounded-ledger border-rule border border-dashed px-3 py-6 text-center">
          {rows.length === 0
            ? "The catalog is empty. Run the seed script to load the starter services."
            : query.trim()
              ? `Nothing matches “${query.trim()}”.`
              : "Nothing in this filter — which is the good answer."}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([category, list]) => (
            <section key={category} className="flex flex-col gap-1.5">
              <h2 className="text-12 text-ink-muted font-medium tracking-wide uppercase">
                {category}
                <span className="num text-faint ml-1.5">{list.length}</span>
              </h2>
              <ul className="rounded-ledger border-rule bg-surface flex flex-col border">
                {list.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    editable={editable}
                    pending={pending}
                    onToggle={() =>
                      startTransition(async () =>
                        setMessage(await setServiceActive(row.id, !row.active)),
                      )
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** A counted filter. A count you can click beats a sentence saying it. */
function Chip({ on, count, tone, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`rounded-chip text-13 border px-2.5 py-0.5 ${
        on
          ? "border-carbon bg-carbon text-on-carbon"
          : tone === "warn" && count > 0
            ? "border-waiting text-waiting hover:bg-waiting-wash"
            : "border-rule text-ink-muted hover:bg-carbon-wash"
      }`}
      {...rest}
    >
      {children}
      <span className="num ml-1.5 opacity-70">{count}</span>
    </button>
  );
}

/**
 * One service: the name you scan by, then the facts, then what is unfinished
 * about it.
 *
 * The whole row is a link for anyone who may edit, so reaching a service is
 * a click anywhere rather than hunting for the word "Edit" — and Archive
 * stays a real button beside it, because it changes data and must not be
 * something you hit by aiming for the row.
 */
function Row({ row, editable, pending, onToggle }) {
  const facts = [
    row.recurrence,
    row.turnaround,
    row.stepCount > 0
      ? `${row.stepCount} ${row.stepCount === 1 ? "step" : "steps"}`
      : null,
    row.checklistCount > 0
      ? `${row.checklistCount} ${row.checklistCount === 1 ? "document" : "documents"}`
      : null,
    row.fee === "Not set" ? null : row.fee,
  ].filter(Boolean);

  return (
    <li
      className={`border-rule flex flex-wrap items-start gap-x-3 gap-y-1.5 border-b px-3 py-2.5 last:border-0 ${
        row.active ? "" : "opacity-60"
      }`}
    >
      <span className="mt-0.5 shrink-0">
        <TierBadge level={row.level} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-14 flex flex-wrap items-baseline gap-x-2">
          {editable ? (
            <Link
              href={`/settings/services/${row.id}`}
              className="hover:text-carbon font-medium underline-offset-4 hover:underline"
            >
              {row.name}
            </Link>
          ) : (
            <span className="font-medium">{row.name}</span>
          )}
          <span className="text-12 text-ink-muted font-mono">{row.code}</span>
          <span className="num text-12 text-faint">v{row.version}</span>
          {!row.active && <span className="text-12 text-faint">archived</span>}
        </p>

        <p className="text-12 text-ink-muted">
          {facts.join(" · ")}
          {row.sac ? (
            <>
              {facts.length > 0 && " · "}
              <span className="font-mono">SAC {row.sac}</span>
            </>
          ) : null}
          {row.udinRequired && (
            <span className="text-brass-ink"> · needs a UDIN</span>
          )}
          {row.strictSteps > 0 && (
            <span className="text-brass-ink">
              {" · "}
              <span className="num">{row.strictSteps}</span>{" "}
              {row.strictSteps === 1 ? "step" : "steps"} restricted by role
            </span>
          )}
        </p>

        {/* what is unfinished about this one, said where it applies */}
        {row.active &&
          (row.stepCount === 0 || !row.sac || row.looseItems > 0) && (
            <p className="text-12 text-waiting">
              {[
                row.stepCount === 0 ? "no steps yet" : null,
                !row.sac ? "no SAC code" : null,
                row.looseItems > 0
                  ? `${row.looseItems} ${
                      row.looseItems === 1 ? "document" : "documents"
                    } not on a step`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
      </div>

      {editable && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href={`/settings/services/${row.id}`}
            className="rounded-control border-rule hover:bg-carbon-wash text-13 flex h-8 items-center border px-2"
          >
            Edit
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={onToggle}
            className="rounded-control border-rule hover:bg-carbon-wash text-13 h-8 border px-2 disabled:opacity-60"
          >
            {row.active ? "Archive" : "Restore"}
          </button>
        </div>
      )}
    </li>
  );
}
