"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Segmented from "@/components/ui/Segmented";
import Notice from "@/components/ui/Notice";
import ProgressBar from "@/components/ui/ProgressBar";

/**
 * The weekly board (P3-16, redrawn 04-11-2026).
 *
 * One block per person, two lanes side by side. The review lane carries two
 * counts that are deliberately kept apart — **here** and **coming** —
 * because a reviewer with nine reviews arriving on Thursday has a problem
 * on Monday, and a board that only shows what has arrived tells them about
 * it on Thursday.
 *
 * Hours appear only where every job in the lane has an estimate behind it.
 * A part-total reads as the whole and says somebody is free when they are
 * not, so the lane says how many are unestimated instead.
 *
 * ## What changed on 04-11-2026
 *
 * **The load is a bar.** `components/ui/ProgressBar` says in its own first
 * paragraph that the team-load rows "are the reason `marker` exists" — a
 * bar scaled past the limit with a tick drawn at the limit, so it reads as
 * *who is over, and by how much* rather than *who is busiest*. This board
 * never used it, so the one question it exists to answer — has anybody got
 * more than their week holds? — was a sentence of hours per person that had
 * to be compared in the reader's head, nine times.
 *
 * The bar is drawn **only when the hours are whole.** A lane with an
 * unestimated job in it gets the count and the reason, same as before: a
 * bar from a part-total would be the exact lie the hours rule exists to
 * prevent.
 *
 * **The people in trouble are first.** Over capacity, then away with work
 * due, then busiest. A board in role order puts the partner with two jobs
 * above the employee with fourteen.
 *
 * **`Segmented` for the weeks and `Notice` for the warnings**, instead of
 * this file's own chips and its own amber box.
 */
export default function PlanBoard({
  weeks,
  week,
  rows,
  warnings,
  unscheduled,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function go(key) {
    const index = Number(key);
    const params = new URLSearchParams(search);
    if (index > 0) params.set("week", String(index));
    else params.delete("week");
    router.replace(`${pathname}?${params}`);
  }

  /**
   * A person with work, and a person with none who is simply away.
   *
   * These were one list, so somebody away with an empty week got the whole
   * two-lane card — a workload block whose every lane read "Nothing
   * targeted this week." A card that holds nothing is not a card; their
   * absence is one line, and it belongs above the boards rather than
   * among them.
   */
  const busy = rows.filter(
    (row) => row.prepare.jobs.length || row.review.jobs.length,
  );
  const awayOnly = rows.filter(
    (row) =>
      row.away.length && !row.prepare.jobs.length && !row.review.jobs.length,
  );

  /**
   * Worst first. `over` is the only state somebody must act on today;
   * being away with work due is the next; after that it is simply how
   * much is on them, counting both lanes.
   */
  const ordered = [...busy].sort((a, b) => {
    const trouble = (row) =>
      (row.over ? 2 : 0) + (row.away.length && row.prepare.jobs.length ? 1 : 0);
    return (
      trouble(b) - trouble(a) ||
      b.prepare.jobs.length +
        b.review.jobs.length -
        (a.prepare.jobs.length + a.review.jobs.length)
    );
  });

  const current = weeks.find((option) => option.current)?.index ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Which week"
        value={String(current)}
        onSelect={go}
        items={weeks.map((option) => ({
          key: String(option.index),
          label: option.index === 0 ? "This week" : option.label,
        }))}
      />

      {warnings.map((warning) => (
        <Notice
          key={warning.userId}
          tone="warn"
          title={`${warning.name} is away with ${warning.count} ${
            warning.count === 1 ? "job" : "jobs"
          } due`}
        >
          <p>
            Away{" "}
            <span className="num">
              {warning.away
                .map((leave) => `${leave.from} – ${leave.to}`)
                .join(", ")}
            </span>
            , and {warning.count === 1 ? "one job falls" : "those fall"} on a
            day they are not here. {warning.cover} is covering —{" "}
            <Link
              href={`/team/${warning.userId}/takeover`}
              className="text-carbon hover:text-carbon-ink underline underline-offset-4"
            >
              move what cannot wait
            </Link>
            .
          </p>
        </Notice>
      ))}

      {awayOnly.length > 0 && (
        <p className="text-13 text-ink-muted rounded-ledger border-rule bg-surface border px-3 py-2">
          <span className="text-ink font-medium">Away, with nothing on:</span>{" "}
          {awayOnly.map((row, index) => (
            <span key={row.person.id}>
              {index > 0 && "; "}
              {row.person.name}{" "}
              <span className="num">
                {row.away
                  .map((leave) => `${leave.from} – ${leave.to}`)
                  .join(", ")}
              </span>
              {row.away[0]?.cover ? ` · ${row.away[0].cover} covering` : ""}
            </span>
          ))}
        </p>
      )}

      {ordered.length === 0 ? (
        <div className="rounded-ledger border-rule bg-surface flex flex-col items-center gap-1 border px-4 py-12 text-center">
          <p className="text-14 font-medium">Nothing is targeted at {week}.</p>
          <p className="text-13 text-ink-muted max-w-[52ch]">
            Work lands in a week four working days before its statutory date, so
            an empty board this early is normal. Jobs with no date to plan from
            are on Issues.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {ordered.map((row, index) => (
            <article
              key={row.person.id}
              className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
            >
              <header className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="text-15 font-bold">
                    <Link
                      href={`/team/${row.person.id}`}
                      className="hover:text-carbon underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:decoration-current"
                    >
                      {row.person.name}
                    </Link>
                  </h2>
                  <p className="text-13 text-ink-muted">
                    {row.away.length > 0 && (
                      <span className="text-waiting">
                        Away{" "}
                        <span className="num">
                          {row.away
                            .map((leave) => `${leave.from} – ${leave.to}`)
                            .join(", ")}
                        </span>{" "}
                        · {row.away[0].cover} covering ·{" "}
                      </span>
                    )}
                    {row.covering.length > 0 && (
                      <span>
                        Covering{" "}
                        {row.covering.map((entry) => entry.name).join(", ")}{" "}
                        ·{" "}
                      </span>
                    )}
                    <span className="num">{row.capacityHours}</span> hours
                    available
                    {row.lostHours > 0 && (
                      <>
                        {" ("}
                        <span className="num">
                          {row.fullCapacityHours}
                        </span>{" "}
                        less <span className="num">{row.lostHours}</span> away)
                      </>
                    )}
                  </p>
                </div>

                {/*
                  The bar, and only when the hours behind it are whole.
                  Scaled to whichever is larger — the load or the capacity —
                  with the tick at the capacity, so a person over it has a
                  fill that visibly crosses a line.
                */}
                {row.prepare.jobs.length > 0 &&
                  row.prepare.unestimated === 0 &&
                  row.capacityHours > 0 && (
                    <ProgressBar
                      index={index}
                      value={row.prepare.hours}
                      max={Math.max(row.prepare.hours, row.capacityHours)}
                      marker={
                        (row.capacityHours /
                          Math.max(row.prepare.hours, row.capacityHours)) *
                        100
                      }
                      tone={
                        row.prepare.hours > row.capacityHours * 1.25
                          ? "redpen"
                          : row.prepare.hours > row.capacityHours
                            ? "waiting"
                            : "carbon"
                      }
                      trailing={`${row.prepare.hours}/${row.capacityHours} h`}
                      label={`${row.person.name}: ${row.prepare.hours} hours to prepare against ${row.capacityHours} available`}
                    />
                  )}
              </header>

              <div className="grid gap-4 md:grid-cols-2">
                <Lane
                  title="To prepare"
                  jobs={row.prepare.jobs}
                  note={
                    row.prepare.jobs.length === 0
                      ? "Nothing targeted this week."
                      : row.prepare.unestimated > 0
                        ? `${row.prepare.jobs.length} jobs · ${row.prepare.unestimated} with no estimate, so hours are not totalled`
                        : `${row.prepare.jobs.length} jobs · ${row.prepare.hours} hours of ${row.capacityHours}`
                  }
                  tone={row.over ? "over" : ""}
                />
                <Lane
                  title="To review"
                  jobs={row.review.jobs}
                  note={
                    row.review.jobs.length === 0
                      ? "Nothing targeted this week."
                      : `${row.review.arrived} here now · ${row.review.coming} still being prepared`
                  }
                />
              </div>

              {row.over && (
                <p className="text-13 text-redpen border-redpen/30 border-t pt-2">
                  Over capacity by{" "}
                  <span className="num">
                    {row.prepare.hours - row.capacityHours}
                  </span>{" "}
                  hours this week.{" "}
                  <Link
                    href={`/team/${row.person.id}/takeover`}
                    className="underline underline-offset-4"
                  >
                    Move something
                  </Link>
                  .
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {unscheduled > 0 && (
        <p className="text-13 text-ink-muted max-w-[72ch]">
          <span className="num">{unscheduled}</span> open{" "}
          {unscheduled === 1 ? "engagement has" : "engagements have"} no date to
          plan from — usually a due-date rule a partner has not confirmed. Those
          are on{" "}
          <Link
            href="/issues"
            className="text-carbon hover:text-carbon-ink underline underline-offset-4"
          >
            Issues
          </Link>
          , not here.
        </p>
      )}
    </div>
  );
}

function Lane({ title, jobs, note, tone = "" }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-11 text-ink-muted font-semibold tracking-wide uppercase">
          {title}
        </h3>
        <p
          className={`text-12 ${tone === "over" ? "text-redpen" : "text-ink-muted"}`}
        >
          {note}
        </p>
      </div>
      {jobs.length > 0 && (
        <ul className="divide-rule divide-y">
          {jobs.map((job) => (
            <li key={`${title}-${job.id}`} className="py-1.5">
              <Link
                href={`/engagements/${job.id}`}
                className="text-14 hover:text-carbon font-medium underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:decoration-current"
              >
                {job.service}
              </Link>
              <span className="text-12 text-ink-muted block">
                {job.client} · {job.period} · target{" "}
                <span className="num">{job.target}</span>
                {job.tier ? ` · ${job.tier}` : ""}
                {job.state ? ` · ${job.state}` : ""}
                {title === "To review" && !job.arrived
                  ? " · not sent for review yet"
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
