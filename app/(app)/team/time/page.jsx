import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { branchFilter, can, scopeOf } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import TimeEntry from "@/models/TimeEntry";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import Invoice from "@/models/Invoice";
import User from "@/models/User";
import { formatPaise } from "@/lib/money";
import {
  formatISTDate,
  istDate,
  istInputDate,
  istParts,
  startOfISTDay,
  financialYearLabel,
  financialYearRange,
} from "@/lib/dates";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import {
  byClient,
  formatHours,
  realisation,
  startOfISTWeek,
  timeValue,
  totals,
  unrecorded,
  utilisation,
  weekDays,
  workingDaysBetween,
} from "@/lib/team/time";
import { Panel } from "@/components/dashboard/Tiles";
import Timer from "./Timer";
import AddTime from "./AddTime";
import Lines from "./Lines";
import { runningTimer } from "./actions";

export const metadata = { title: "Timesheet · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Time, and what it was worth (P3-28, spec section 9).
 *
 * The screen answers three questions in this order, which is the order a
 * firm actually asks them:
 *
 *  1. **Is my own week recorded?** The sheet, with the clock above it.
 *     Everybody who reaches this page sees this part, because everybody
 *     has their own hours to put down.
 *  2. **Is the firm's time being recorded at all?** Utilisation per
 *     person, and the working days nobody has filled in. A profitability
 *     figure built on half a timesheet is worse than no figure, so the
 *     gaps are named before the money is.
 *  3. **Which clients cost more than they pay?** Fee against time value,
 *     worst first.
 *
 * **Nothing here invents a rate.** Time value needs an hourly rate per
 * person, which is a partner's decision about what the firm's work is
 * worth (CLAUDE.md rules 8 and 9). Until one is set the money half of the
 * screen says so plainly and shows hours instead; it does not pick a
 * plausible number.
 */
export default async function TimePage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "timeEntries")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const now = new Date();

  /* The week on screen: 0 is this one, 1 is last week, up to eight back.
     Forward is not offered — there is no time to record in a week that has
     not happened. */
  const back = Math.min(8, Math.max(0, Number(params.back) || 0));
  const weekOf = new Date(
    startOfISTWeek(now).getTime() - back * 7 * 86_400_000,
  );
  const days = weekDays(weekOf);
  const weekStart = days[0];
  const weekEnd = new Date(days[6].getTime() + 86_400_000);

  const seesOthers = scopeOf(actor, "timeEntries") !== "own";

  await connectDB();

  /* The jobs this person can put time on: their own open work first, which
     is what a dropdown of a hundred engagements is otherwise useless for. */
  const openJobs = await Engagement.find({
    ...(branchFilter(actor, "engagementsWork") ?? {}),
    status: { $nin: CLOSED_STATUSES },
    $or: [{ assigneeId: actor.id }, { reviewerId: actor.id }],
  })
    .select("clientId templateSnapshot periodLabel period")
    .sort({ internalDue: 1 })
    .limit(200)
    .lean();

  const myWeek = await TimeEntry.find({
    userId: actor.id,
    on: { $gte: weekStart, $lt: weekEnd },
  })
    .sort({ on: 1, createdAt: 1 })
    .limit(500)
    .lean();

  const running = await runningTimer();

  /* Every client named anywhere on this screen, looked up once. */
  const needClients = new Set(
    [...openJobs, ...myWeek].map((row) => String(row.clientId ?? "")),
  );

  /* The month, by the Indian calendar and not the server's: on a machine
     running UTC the first of the month is still yesterday for five and a
     half hours, which is long enough to drop a day of everybody's time out
     of the figures. */
  const ist = istParts(now);
  const month = {
    start: istDate(ist.year, ist.month, 1),
    end: new Date(startOfISTDay(now).getTime() + 86_400_000),
  };
  const fy = financialYearRange(now);

  /** @type {any[]} */
  let people = [];
  /** @type {any[]} */
  let monthEntries = [];
  /** @type {any[]} */
  let fyEntries = [];

  if (seesOthers) {
    const peopleQuery = { active: true };
    if (branchFilter(actor, "team")) {
      peopleQuery.branchIds = { $in: actor.branchIds };
    }
    [people, monthEntries, fyEntries] = await Promise.all([
      User.find(peopleQuery)
        .select("name role capacityHours chargeRatePaise")
        .sort({ role: 1, name: 1 })
        .limit(200)
        .lean(),
      TimeEntry.find({
        ...(branchFilter(actor, "timeEntries") ?? {}),
        on: { $gte: month.start, $lt: month.end },
      })
        .select("userId on minutes chargeable")
        .limit(20000)
        .lean(),
      TimeEntry.find({
        ...(branchFilter(actor, "timeEntries") ?? {}),
        on: { $gte: fy.start, $lt: fy.end },
        chargeable: true,
      })
        .select("userId clientId minutes")
        .limit(50000)
        .lean(),
    ]);
  } else {
    const me = await User.findById(actor.id)
      .select("name role capacityHours chargeRatePaise")
      .lean();
    if (me) people = [me];
  }

  const rateByUser = new Map(
    people.map((p) => [String(p._id), p.chargeRatePaise ?? 0]),
  );
  const noRate = people.filter((p) => !(p.chargeRatePaise > 0));

  for (const row of fyEntries) needClients.add(String(row.clientId ?? ""));

  const clients = await Client.find({
    _id: { $in: [...needClients].filter(Boolean) },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  const jobs = openJobs.map((job) => ({
    id: String(job._id),
    client: clientName.get(String(job.clientId)) ?? "Client",
    label: `${job.templateSnapshot?.name ?? "Job"} · ${job.periodLabel || job.period}`,
  }));
  const jobLabel = new Map(jobs.map((job) => [job.id, job]));

  /* --- my week --- */
  const today = istInputDate(now);
  const weekLines = days.map((day, index) => {
    const key = istInputDate(day);
    const rows = myWeek.filter(
      (row) => istInputDate(row.on) === key && row.minutes > 0,
    );
    return {
      key,
      today: key === today,
      label: `${WEEKDAYS[index]} ${formatISTDate(day)}`,
      hours: formatHours(rows.reduce((sum, r) => sum + r.minutes, 0)),
      rows: rows.map((row) => {
        const job = jobLabel.get(String(row.engagementId ?? ""));
        return {
          id: String(row._id),
          hours: formatHours(row.minutes),
          chargeable: Boolean(row.chargeable),
          what: job
            ? `${job.client} · ${job.label}`
            : row.engagementId
              ? `${clientName.get(String(row.clientId)) ?? "A job"} · job`
              : row.what,
          href: row.engagementId ? `/engagements/${row.engagementId}` : "",
          mayChange: true,
        };
      }),
    };
  });

  const mine = totals(myWeek.filter((row) => row.minutes > 0));
  /* Available is this person's own capacity over the working days of the
     week, so a week with a holiday in it does not read as a week somebody
     slacked. */
  const myCapacity =
    people.find((p) => String(p._id) === actor.id)?.capacityHours ?? 8;
  const myAvailable = workingDaysBetween(weekStart, days[6]) * myCapacity * 60;
  const myUtilisation = utilisation(mine.chargeable, myAvailable);

  /* --- the firm's month --- */
  const monthWorkingDays = workingDaysBetween(month.start, now);
  const perPerson = people.map((person) => {
    const theirs = monthEntries.filter(
      (row) => String(row.userId) === String(person._id),
    );
    const sums = totals(theirs);
    const available = monthWorkingDays * (person.capacityHours ?? 8) * 60;
    return {
      id: String(person._id),
      name: person.name,
      minutes: sums.minutes,
      chargeable: sums.chargeable,
      utilisation: utilisation(sums.chargeable, available),
      rate: person.chargeRatePaise ?? 0,
    };
  });

  const gaps = seesOthers
    ? unrecorded(
        monthEntries,
        people.map((p) => ({ id: String(p._id), name: p.name })),
        weekDays(now).filter((day) => day <= startOfISTDay(now)),
      )
    : [];

  /* --- the year's money --- */
  const firmValue = timeValue(fyEntries, rateByUser);

  let billedByClient = new Map();
  if (seesOthers && firmValue.paise > 0) {
    const invoices = await Invoice.find({
      ...(branchFilter(actor, "invoices") ?? {}),
      status: { $nin: ["Draft", "Cancelled"] },
      date: { $gte: fy.start, $lt: fy.end },
    })
      .select("clientId totalPaise subtotalPaise")
      .limit(20000)
      .lean();
    for (const invoice of invoices) {
      const key = String(invoice.clientId);
      billedByClient.set(
        key,
        (billedByClient.get(key) ?? 0) +
          (invoice.subtotalPaise || invoice.totalPaise || 0),
      );
    }
  }

  const profitability =
    seesOthers && firmValue.paise > 0
      ? byClient(
          [...new Set(fyEntries.map((row) => String(row.clientId ?? "")))]
            .filter(Boolean)
            .map((id) => {
              const theirs = fyEntries.filter(
                (row) => String(row.clientId) === id,
              );
              const value = timeValue(theirs, rateByUser);
              return {
                clientId: id,
                name: clientName.get(id) ?? "Client",
                feePaise: billedByClient.get(id) ?? 0,
                minutes: theirs.reduce((sum, r) => sum + r.minutes, 0),
                valuePaise: value.paise,
              };
            })
            .filter((row) => row.valuePaise > 0),
        )
      : [];

  const firmBilled = [...billedByClient.values()].reduce((a, b) => a + b, 0);
  const firmRealisation = realisation(firmBilled, firmValue.paise);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            {seesOthers ? "Time and profitability" : "My timesheet"}
          </h1>
          <p className="text-13 text-ink-muted max-w-[72ch]">
            Hours against jobs. An hour on a job is chargeable; an hour on
            anything else is not, and that one distinction is what every figure
            on this page is built from.
          </p>
        </div>
        <p className="num text-13 text-ink-muted">
          FY {financialYearLabel(now)}
        </p>
      </div>

      <Panel
        title="The clock"
        what="Start it when you start, or type the line in afterwards."
      >
        <Timer jobs={jobs} running={running} />
      </Panel>

      <Panel
        title={back === 0 ? "This week" : `Week of ${formatISTDate(weekStart)}`}
        what={`${formatHours(mine.minutes)} hours recorded, ${formatHours(mine.chargeable)} of them chargeable${
          myUtilisation === null ? "" : ` · ${myUtilisation}% of your week`
        }.`}
        action={
          <span className="text-13 flex gap-3">
            {back < 8 && (
              <Link
                href={`/team/time?back=${back + 1}`}
                className="underline underline-offset-4"
              >
                Week before
              </Link>
            )}
            {back > 0 && (
              <Link
                href={back === 1 ? "/team/time" : `/team/time?back=${back - 1}`}
                className="underline underline-offset-4"
              >
                Week after
              </Link>
            )}
          </span>
        }
      >
        <AddTime
          jobs={jobs}
          people={
            seesOthers
              ? people.map((p) => ({ id: String(p._id), name: p.name }))
              : []
          }
          me={actor.id}
          defaultDate={back === 0 ? today : istInputDate(days[0])}
        />
        <div className="rounded-ledger border-rule bg-surface mt-1 border p-4">
          <Lines days={weekLines} />
        </div>
      </Panel>

      {seesOthers && (
        <>
          <Panel
            title="Who recorded what, this month"
            what={`${monthWorkingDays} working ${monthWorkingDays === 1 ? "day" : "days"} so far. Utilisation is chargeable hours over the hours each person is down for.`}
          >
            <div className="rounded-table border-rule bg-surface overflow-x-auto border">
              <table className="text-14 w-full">
                <thead>
                  <tr className="border-rule text-12 text-faint border-b text-left">
                    <th className="px-3 py-2 font-medium">Who</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Recorded
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Chargeable
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Utilisation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {perPerson.map((row) => (
                    <tr
                      key={row.id}
                      className="border-rule border-b last:border-0"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/team/${row.id}`}
                          className="underline underline-offset-4"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="num px-3 py-2 text-right">
                        {formatHours(row.minutes)}
                      </td>
                      <td className="num px-3 py-2 text-right">
                        {formatHours(row.chargeable)}
                      </td>
                      <td
                        className={`num px-3 py-2 text-right ${
                          row.utilisation === null
                            ? "text-faint"
                            : row.utilisation < 40
                              ? "text-waiting"
                              : ""
                        }`}
                      >
                        {row.utilisation === null ? "—" : `${row.utilisation}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Days nobody has filled in"
            what="This week's working days with no line against them at all."
          >
            {gaps.length === 0 ? (
              <p className="text-13 text-ink-muted">
                Every working day this week has time against it.
              </p>
            ) : (
              <ul className="rounded-ledger border-rule bg-surface divide-rule divide-y border">
                {gaps.map((row) => (
                  <li
                    key={row.id}
                    className="text-14 flex flex-wrap items-baseline justify-between gap-2 px-4 py-2"
                  >
                    <span>{row.name}</span>
                    <span className="num text-13 text-waiting">
                      {row.days.length} {row.days.length === 1 ? "day" : "days"}{" "}
                      · {row.days.map((day) => formatISTDate(day)).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="What the time was worth"
            what="Fee billed this financial year against the value of the time that went into it."
          >
            {noRate.length === people.length ? (
              <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
                <strong>No hourly rates are set.</strong> Time value,
                realisation and client profitability all need one rate per
                person — what an hour of their time is worth to the firm.
                Nothing here guesses at one. Set them on each person&rsquo;s
                page under{" "}
                <Link href="/team" className="underline underline-offset-4">
                  the team
                </Link>
                , and these figures appear.
              </p>
            ) : (
              <>
                {noRate.length > 0 && (
                  <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
                    <strong>
                      {noRate.length} of {people.length} have no rate set
                    </strong>{" "}
                    — {noRate.map((p) => p.name).join(", ")}. Their hours are
                    counted but valued at nothing, so every figure below
                    understates what the work cost.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Figure
                    label="Time value, FY to date"
                    value={formatPaise(firmValue.paise)}
                  />
                  <Figure
                    label="Billed, FY to date"
                    value={formatPaise(firmBilled)}
                  />
                  <Figure
                    label="Realisation"
                    value={
                      firmRealisation === null ? "—" : `${firmRealisation}%`
                    }
                    tone={
                      firmRealisation !== null && firmRealisation < 100
                        ? "late"
                        : undefined
                    }
                  />
                </div>

                <p className="text-12 text-faint">
                  Work in progress drags realisation down until it is invoiced:
                  the time is spent and the bill has not gone out. A figure
                  under 100% at the start of a quarter is usually that, and at
                  the end of one usually is not.
                </p>

                {profitability.length > 0 && (
                  <div className="rounded-table border-rule bg-surface mt-1 overflow-x-auto border">
                    <table className="text-14 w-full">
                      <thead>
                        <tr className="border-rule text-12 text-faint border-b text-left">
                          <th className="px-3 py-2 font-medium">Client</th>
                          <th className="px-3 py-2 text-right font-medium">
                            Hours
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Time value
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Billed
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Realisation
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {profitability.map((row) => (
                          <tr
                            key={row.clientId}
                            className="border-rule border-b last:border-0"
                          >
                            <td className="px-3 py-2">
                              <Link
                                href={`/clients/${row.clientId}`}
                                className="underline underline-offset-4"
                              >
                                {row.name}
                              </Link>
                            </td>
                            <td className="num px-3 py-2 text-right">
                              {formatHours(row.minutes)}
                            </td>
                            <td className="num px-3 py-2 text-right">
                              {formatPaise(row.valuePaise)}
                            </td>
                            <td className="num px-3 py-2 text-right">
                              {formatPaise(row.feePaise)}
                            </td>
                            <td
                              className={`num px-3 py-2 text-right ${
                                row.realisation === null
                                  ? "text-faint"
                                  : row.realisation < 90
                                    ? "text-redpen"
                                    : "text-filed"
                              }`}
                            >
                              {row.realisation === null
                                ? "—"
                                : `${row.realisation}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A figure with its name over it. Not a tile: nothing here links anywhere. */
function Figure({ label, value, tone }) {
  return (
    <div className="rounded-ledger border-rule bg-surface flex flex-col gap-1 border px-4 py-3">
      <span className="text-12 text-ink-muted">{label}</span>
      <span
        className={`num font-display text-24 leading-none ${tone === "late" ? "text-redpen" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
