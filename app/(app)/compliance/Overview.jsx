import Link from "next/link";
import Segmented from "@/components/ui/Segmented";
import StatTile from "@/components/ui/StatTile";
import ProgressBar from "@/components/ui/ProgressBar";
import Chip from "@/components/ui/Chip";
import { FREQUENCIES, periodsElapsed } from "@/lib/compliance/heads";
import NeverOpened from "./NeverOpened";

/**
 * Where the firm stands on every head of compliance (P3-34 phase 4).
 *
 * The screen answers the question before the grid's: not "which client
 * missed August" but **where does the firm stand overall**. Four cards,
 * then one line per head under the category the catalog puts it in.
 *
 * The banner between them is the reason this screen exists at all. A job
 * list can show work that is late; it cannot show a period **nobody
 * opened a job for**, because there is nothing in it to list. That number
 * is worked out from each client's signed-up services against the periods
 * that have closed, and it is the only figure here a normal list could
 * never produce.
 */
export default function Overview({
  heads,
  summary,
  fy,
  fyLabel,
  params,
  branches,
  partners,
  groups,
}) {
  const keep = (extra) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(extra)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const tail = next.toString();
    return tail ? `?${tail}` : "";
  };

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Compliance
          </h1>
          <p className="text-13 text-ink-muted max-w-[72ch]">
            Every client, every period — including the ones nobody opened a job
            for. FY <span className="num">{fyLabel}</span> to date.
          </p>
        </div>

        <Segmented
          label="How to read compliance"
          value="heads"
          items={[
            { key: "heads", label: "By head", href: `/compliance${keep({})}` },
            {
              key: "grid",
              label: "Status grid",
              href: `/compliance/monthly${keep({})}`,
            },
            {
              key: "next30",
              label: "Next 30 days",
              href: `/compliance${keep({ view: "next30" })}`,
            },
          ]}
        />
      </div>

      <Filters
        params={params}
        fy={fy}
        branches={branches}
        partners={partners}
        groups={groups}
      />

      {/* the four cards: all heads, then each rhythm */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="All heads"
          summary={summary.all}
          href={`/compliance${keep({})}`}
          selected
        />
        {FREQUENCIES.map((frequency) => (
          <SummaryCard
            key={frequency.key}
            title={frequency.label}
            summary={summary[frequency.key]}
            href={`${frequency.href}${keep({})}`}
          />
        ))}
      </div>

      {heads.totals.missing > 0 && (
        <NeverOpened count={heads.totals.missing} fy={fy} />
      )}

      {heads.categories.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
          No service in the catalog recurs, so there is nothing to stand against
          a calendar yet.
        </p>
      ) : (
        heads.categories.map((category) => (
          <section key={category.name} className="flex flex-col gap-2">
            <h2 className="font-display text-15 font-semibold">
              {category.name}
            </h2>
            <HeadsTable
              lines={category.lines}
              fy={fy}
              keep={keep}
              category={category.name}
            />
          </section>
        ))
      )}
    </div>
  );
}

/**
 * The filter bar. A plain `method="get"` form, so it narrows without
 * JavaScript; the selects submit themselves once JavaScript is there.
 */
function Filters({ params, fy, branches, partners, groups }) {
  const years = [fy, fy - 1, fy - 2];

  return (
    <form
      method="get"
      className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-6"
    >
      <Field label="Financial year" name="fy" value={String(fy)}>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}-{String((year + 1) % 100).padStart(2, "0")}
          </option>
        ))}
      </Field>

      <Field
        label="Branch"
        name="branch"
        value={params.branch}
        any="All branches"
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </Field>

      <Field
        label="Client partner"
        name="partner"
        value={params.partner}
        any="Anyone"
      >
        {partners.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </Field>

      <Field
        label="Client group"
        name="group"
        value={params.group}
        any="All groups"
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </Field>

      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted font-medium">Client</span>
        <input
          name="client"
          defaultValue={params.client ?? ""}
          placeholder="Name, PAN or GSTIN"
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        />
      </label>

      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded-control bg-carbon text-on-carbon text-13 h-9 px-3 font-medium"
        >
          Narrow
        </button>
        <Link
          href="/compliance"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}

function Field({ label, name, value, any, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-12 text-ink-muted font-medium">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
      >
        {any && <option value="">{any}</option>}
        {children}
      </select>
    </label>
  );
}

/**
 * One rhythm, in four figures.
 *
 * On time is `—` and not `0%` when nothing can be judged yet: a firm that
 * has filed nothing is not a firm that is nought per cent on time, and a
 * zero there would be the most alarming number on the screen for no
 * reason.
 */
function SummaryCard({ title, summary, href, selected = false }) {
  const names = summary.heads.slice(0, 4).join(" · ");
  const more = summary.heads.length > 4 ? " …" : "";

  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={`rounded-ledger lift flex flex-col gap-3 border p-4 ${
        selected ? "border-carbon bg-carbon-wash" : "border-rule bg-surface"
      }`}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-display text-15 font-semibold">{title}</span>
        <span className="text-12 text-ink-muted truncate">
          {summary.count} {summary.count === 1 ? "head" : "heads"}
        </span>
      </span>

      <span className="text-12 text-faint block truncate">
        {names}
        {more}
      </span>

      <span className="grid grid-cols-4 gap-2">
        <Mini
          label="On time"
          value={summary.onTime === null ? "—" : `${summary.onTime}%`}
          tone="carbon"
        />
        <Mini label="In hand" value={summary.inHand} />
        <Mini
          label="Overdue"
          value={summary.overdue}
          tone={summary.overdue > 0 ? "redpen" : ""}
        />
        <Mini
          label="Never opened"
          value={summary.missing}
          tone={summary.missing > 0 ? "redpen" : ""}
        />
      </span>
    </Link>
  );
}

function Mini({ label, value, tone = "" }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-11 text-ink-muted leading-tight font-medium uppercase">
        {label}
      </span>
      <span
        className={`num text-20 leading-none font-semibold ${
          tone === "redpen"
            ? "text-redpen"
            : tone === "carbon"
              ? "text-carbon"
              : ""
        }`}
      >
        {value}
      </span>
    </span>
  );
}

const BASIS = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "half-yearly": "Half-yearly",
  annual: "Annual",
};

/** One line per head, with the row a link to that head's grid. */
function HeadsTable({ lines, fy, keep, category }) {
  return (
    <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
      <table className="w-full">
        <caption className="sr-only">
          Where each head of {category} stands this financial year
        </caption>
        <thead>
          <tr className="text-12 text-ink-muted border-rule border-b text-left">
            <th scope="col" className="px-4 py-2 font-medium">
              Head
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              Basis
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Clients
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              Progress (done of due)
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Open
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Overdue
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Never opened
            </th>
          </tr>
        </thead>
        <tbody className="divide-rule-soft divide-y">
          {lines.map((line) => {
            const due =
              line.clients * periodsElapsed(line.recurrence, fy, new Date());
            const href = `/compliance/${
              line.recurrence === "monthly"
                ? "monthly"
                : line.recurrence === "quarterly"
                  ? "quarterly"
                  : "annual"
            }${keep({ service: line.id })}`;

            return (
              <tr key={line.id} className="text-14 hover:bg-carbon-wash/50">
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  <Link href={href} className="block">
                    <span className="block font-semibold">{line.name}</span>
                    <span className="text-12 text-ink-muted block">
                      {line.code}
                    </span>
                  </Link>
                </th>
                <td className="px-2 py-2.5">
                  <Chip tone="neutral">
                    {BASIS[line.recurrence] ?? line.recurrence}
                  </Chip>
                </td>
                <td className="num px-2 py-2.5 text-right">{line.clients}</td>
                <td className="px-2 py-2.5">
                  {/*
                    An annual head on the year the firm is still *in* has
                    no closed period, so there is nothing for its work to
                    be a proportion of. A bar reading 100% there would say
                    the year was finished in October. Work done early is
                    ahead, not complete, and this says so in words.
                  */}
                  {due === 0 ? (
                    <span className="text-12 text-ink-muted">
                      <span className="num">{line.done}</span> done · no period
                      has closed yet
                    </span>
                  ) : (
                    <ProgressBar
                      value={line.done}
                      max={due}
                      trailing={`${line.done}/${due}`}
                      label={`${line.name}: ${line.done} of ${due} done`}
                    />
                  )}
                </td>
                <td className="num px-2 py-2.5 text-right">{line.open}</td>
                <td
                  className={`num px-2 py-2.5 text-right ${line.overdue > 0 ? "text-redpen font-semibold" : "text-ink-muted"}`}
                >
                  {line.overdue}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {line.missing > 0 ? (
                    <Chip tone="dashed" mono>
                      {line.missing}
                    </Chip>
                  ) : (
                    <span className="num text-ink-muted">0</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
