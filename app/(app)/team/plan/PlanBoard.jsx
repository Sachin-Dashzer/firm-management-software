"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The weekly board (P3-16).
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

  function go(index) {
    const params = new URLSearchParams(search);
    if (index > 0) params.set("week", String(index));
    else params.delete("week");
    router.replace(`${pathname}?${params}`);
  }

  const busy = rows.filter(
    (row) => row.prepare.jobs.length || row.review.jobs.length || row.away.length,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {weeks.map((option) => (
          <button
            key={option.index}
            type="button"
            onClick={() => go(option.index)}
            aria-pressed={option.current}
            className={`rounded-chip text-13 border px-3 py-0.5 ${
              option.current
                ? "border-carbon bg-carbon text-on-carbon"
                : "border-rule bg-surface text-ink-muted"
            }`}
          >
            {option.index === 0 ? "This week" : option.label}
          </button>
        ))}
        <span className="text-13 text-ink-muted">{week}</span>
      </div>

      {warnings.map((warning) => (
        <p
          key={warning.userId}
          className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2"
        >
          <strong>{warning.name}</strong> is away{" "}
          {warning.away.map((leave) => `${leave.from} – ${leave.to}`).join(", ")}{" "}
          and has {warning.count}{" "}
          {warning.count === 1 ? "job due" : "jobs due"} on a day they are not
          here. {warning.cover} is covering —{" "}
          <Link
            href={`/team/${warning.userId}/takeover`}
            className="underline underline-offset-4"
          >
            move what cannot wait
          </Link>
          .
        </p>
      ))}

      {busy.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-6 text-center">
          Nothing is targeted at this week.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {busy.map((row) => (
            <article
              key={row.person.id}
              className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-15 font-bold">
                  <Link
                    href={`/team/${row.person.id}`}
                    className="underline underline-offset-4"
                  >
                    {row.person.name}
                  </Link>
                </h2>
                <p className="text-13 text-ink-muted">
                  {row.away.length > 0 && (
                    <span className="text-waiting">
                      Away{" "}
                      {row.away
                        .map((leave) => `${leave.from} – ${leave.to}`)
                        .join(", ")}{" "}
                      · {row.away[0].cover} covering ·{" "}
                    </span>
                  )}
                  {row.covering.length > 0 && (
                    <span>
                      Covering{" "}
                      {row.covering.map((entry) => entry.name).join(", ")} ·{" "}
                    </span>
                  )}
                  <span className="num">{row.capacityHours}</span> hours
                  available
                  {row.lostHours > 0 && (
                    <span className="text-ink-muted">
                      {" "}
                      ({row.fullCapacityHours} less {row.lostHours} away)
                    </span>
                  )}
                </p>
              </header>

              <div className="grid gap-3 md:grid-cols-2">
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
                <p className="text-13 text-redpen">
                  Over capacity by {row.prepare.hours - row.capacityHours}{" "}
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
        <p className="text-13 text-ink-muted">
          {unscheduled} open{" "}
          {unscheduled === 1 ? "engagement has" : "engagements have"} no date to
          plan from — usually a due-date rule a partner has not confirmed.
          Those are on{" "}
          <Link href="/issues" className="underline underline-offset-4">
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
        <h3 className="text-14 font-medium">{title}</h3>
        <p className={`text-12 ${tone === "over" ? "text-redpen" : "text-ink-muted"}`}>
          {note}
        </p>
      </div>
      {jobs.length > 0 && (
        <ul className="divide-rule divide-y">
          {jobs.map((job) => (
            <li key={`${title}-${job.id}`} className="py-1">
              <Link
                href={`/engagements/${job.id}`}
                className="text-14 underline underline-offset-4"
              >
                {job.service}
              </Link>
              <span className="text-12 text-ink-muted block">
                {job.client} · {job.period} · target {job.target}
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
