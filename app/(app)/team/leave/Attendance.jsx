import Link from "next/link";
import { formatISTDate } from "@/lib/dates";

/**
 * The month, person by day (owner request, 01-11-2026).
 *
 * **What a cell can honestly say.** This application has no clock-in, so it
 * cannot mark anybody present. Two things it does know: what they put on
 * their timesheet, and whether approved leave covers the day. So a day is
 * *worked* (with the hours), *leave*, a weekend, or **nothing recorded** —
 * which is deliberately not the word "absent". On a day somebody was at
 * their desk and forgot the timesheet, "nothing recorded" is true and
 * "absent" is a false statement about a colleague, in a record the firm
 * keeps.
 *
 * **Each kind has its own mark, not its own colour.** A grid where five
 * states are five hues is a stained-glass window; the firm's palette puts
 * colour on what needs a decision. Worked is a filled cell in the one
 * accent at a weight that rises with the hours, leave is a hatch, a weekend
 * is the ground, and nothing-recorded is a hollow cell with a rule through
 * it. The legend is the marks themselves, at size.
 *
 * It is a real `<table>` with a row header per person: a screen reader
 * reading "Ritika Bhandari, 12 November, worked 6 hours" is the whole point,
 * and a grid of `div`s cannot say that.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

export default function Attendance({ grid, year, month, thisMonth }) {
  const previous = month === 1 ? `${year - 1}-12` : stamp(year, month - 1);
  const next = month === 12 ? `${year + 1}-01` : stamp(year, month + 1);

  const worked = grid.rows.reduce((sum, row) => sum + row.workedDays, 0);
  const onLeave = grid.rows.reduce((sum, row) => sum + row.leaveDays, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MonthLink to={previous} label="Previous month">
            ←
          </MonthLink>
          <h2 className="font-display text-16 min-w-[11ch] text-center font-semibold">
            {MONTHS[month - 1]} {year}
          </h2>
          <MonthLink to={next} label="Next month">
            →
          </MonthLink>
          {!thisMonth && (
            <Link
              href="/team/leave?tab=attendance"
              className="text-13 text-carbon ml-1 underline underline-offset-4"
            >
              This month
            </Link>
          )}
        </div>

        <p className="num text-13 text-ink-muted">
          {worked} {worked === 1 ? "day" : "days"} worked · {onLeave} on leave
        </p>
      </div>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="w-full border-separate border-spacing-0">
          <caption className="sr-only">
            {MONTHS[month - 1]} {year}: each person&rsquo;s month, from their
            timesheet and their approved leave
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-rule bg-surface text-12 text-faint sticky left-0 z-20 border-b px-3 py-2 text-left font-medium"
              >
                Who
              </th>
              {grid.days.map((slot) => (
                <th
                  key={slot.day}
                  scope="col"
                  className={`border-rule text-11 w-7 border-b px-0 py-1 text-center font-medium ${
                    slot.weekend ? "text-faint bg-sunk/50" : "text-ink-muted"
                  } ${slot.today ? "text-carbon font-bold" : ""}`}
                >
                  <span className="block leading-tight">{slot.day}</span>
                  <span className="text-faint block leading-tight font-normal">
                    {WEEKDAY[slot.weekday]}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="border-rule text-12 text-faint border-b px-3 py-2 text-right font-medium"
              >
                Worked
              </th>
              <th
                scope="col"
                className="border-rule text-12 text-faint border-b px-3 py-2 text-right font-medium"
              >
                Leave
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.userId} className="group">
                <th
                  scope="row"
                  className="border-rule bg-surface group-hover:bg-carbon-wash sticky left-0 z-10 border-b px-3 py-1.5 text-left font-normal"
                >
                  <Link
                    href={`/team/${row.userId}?tab=leave`}
                    className="text-14 text-carbon font-medium underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                </th>

                {row.cells.map((cell, index) => (
                  <td
                    key={grid.days[index].day}
                    className={`border-rule border-b p-0 ${
                      grid.days[index].weekend ? "bg-sunk/50" : ""
                    }`}
                  >
                    <Cell cell={cell} day={grid.days[index]} name={row.name} />
                  </td>
                ))}

                <td className="border-rule num text-13 border-b px-3 py-1.5 text-right">
                  {row.workedDays}
                  <span className="text-faint">
                    {" "}
                    · {hours(row.workedMinutes)}
                  </span>
                </td>
                <td
                  className={`border-rule num text-13 border-b px-3 py-1.5 text-right ${
                    row.leaveDays ? "" : "text-faint"
                  }`}
                >
                  {row.leaveDays}
                </td>
              </tr>
            ))}
            {grid.rows.length === 0 && (
              <tr>
                <td
                  colSpan={grid.days.length + 3}
                  className="text-14 text-ink-muted px-3 py-10 text-center"
                >
                  Nobody to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Legend />
    </div>
  );
}

/**
 * One day. The mark is the shape, so the grid reads in greyscale and for
 * somebody who cannot tell the hatch from the fill by colour alone.
 */
function Cell({ cell, day, name }) {
  const when = formatISTDate(day.date);

  if (cell.kind === "worked") {
    /* Three weights by length of day, so a half day is visibly a half day
       without printing a number in a 28px box. */
    const full =
      cell.minutes >= 420
        ? "bg-carbon"
        : cell.minutes >= 240
          ? "bg-carbon/60"
          : "bg-carbon/30";
    return (
      <span
        title={`${name} · ${when} · worked ${hours(cell.minutes)}${
          cell.onLeave ? " (on approved leave)" : ""
        }`}
        className="grid h-7 w-7 place-items-center"
      >
        <span className="sr-only">
          {when}: worked {hours(cell.minutes)}
        </span>
        <span
          aria-hidden="true"
          className={`block size-4 rounded-sm ${full}`}
        />
      </span>
    );
  }

  if (cell.kind === "leave") {
    return (
      <span
        title={`${name} · ${when} · ${cell.leaveKind.toLowerCase()}${
          cell.note ? ` — ${cell.note}` : ""
        }`}
        className="grid h-7 w-7 place-items-center"
      >
        <span className="sr-only">
          {when}: {cell.leaveKind}
        </span>
        <span
          aria-hidden="true"
          className="border-waiting/50 block size-4 rounded-sm border"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--waiting) 0 1.5px, transparent 1.5px 4px)",
            opacity: 0.75,
          }}
        />
      </span>
    );
  }

  if (cell.kind === "blank") {
    return (
      <span
        title={`${name} · ${when} · nothing recorded`}
        className="grid h-7 w-7 place-items-center"
      >
        <span className="sr-only">{when}: nothing recorded</span>
        <span aria-hidden="true" className="bg-rule block h-px w-3" />
      </span>
    );
  }

  // a weekend, or a day not reached yet: the ground says it
  return <span className="block h-7 w-7" />;
}

/** The marks themselves, at size — never a row of coloured dots. */
function Legend() {
  return (
    <ul className="text-12 text-ink-muted flex flex-wrap items-center gap-x-5 gap-y-2">
      <li className="flex items-center gap-2">
        <span className="bg-carbon block size-4 rounded-sm" />
        Worked a full day
      </li>
      <li className="flex items-center gap-2">
        <span className="bg-carbon/60 block size-4 rounded-sm" />
        Part of a day
      </li>
      <li className="flex items-center gap-2">
        <span
          className="border-waiting/50 block size-4 rounded-sm border"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--waiting) 0 1.5px, transparent 1.5px 4px)",
            opacity: 0.75,
          }}
        />
        Approved leave
      </li>
      <li className="flex items-center gap-2">
        <span className="bg-rule block h-px w-3" />
        Nothing recorded
      </li>
      <li className="flex items-center gap-2">
        <span className="bg-sunk border-rule block size-4 rounded-sm border" />
        Weekend
      </li>
      <li className="max-w-[60ch]">
        Built from the timesheet and approved leave. There is no clock-in, so a
        day with nothing on it means nothing was recorded — not that somebody
        was absent.
      </li>
    </ul>
  );
}

function MonthLink({ to, label, children }) {
  return (
    <Link
      href={`/team/leave?tab=attendance&month=${to}`}
      aria-label={label}
      className="rounded-control border-rule text-14 hover:bg-carbon-wash grid h-8 w-8 place-items-center border"
    >
      {children}
    </Link>
  );
}

function stamp(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Minutes as the firm says them: "6h 30m", "45m". */
function hours(minutes) {
  if (!minutes) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
