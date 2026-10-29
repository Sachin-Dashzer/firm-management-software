// @ts-check

import { istInputDate, isWorkingDay, startOfISTDay } from "../dates.js";

/**
 * Turning a timesheet into figures (spec section 9).
 *
 * Pure, like `workload.js` beside it: handed entries and people, it
 * returns totals. The queries live in the pages. The arithmetic lives here
 * because the arithmetic is what goes wrong quietly — a utilisation of 71%
 * looks exactly as plausible as a utilisation of 17%, and nobody checks a
 * figure that looks plausible.
 *
 * Three figures the firm has asked for, and what each one means:
 *
 *  - **Utilisation** — chargeable minutes ÷ minutes available. "Am I busy
 *    on the firm's work?" Available comes from each person's capacity and
 *    the working days in the window, so a week with a holiday in it does
 *    not read as a week somebody slacked.
 *  - **Realisation** — billed ÷ time value. "Did the firm get paid for
 *    what it spent?" Needs a rate per person, and there is none until a
 *    partner sets one.
 *  - **Client profitability** — fee against time value, client by client.
 *    The same division, grouped the other way.
 */

/** Minutes as the hours people say: 150 → "2.5". */
export function formatHours(minutes) {
  const hours = (minutes ?? 0) / 60;
  return hours.toFixed(hours % 1 === 0 ? 0 : 1);
}

/**
 * The Monday of the week a moment falls in, at IST midnight.
 *
 * Monday because the firm's week is Monday to Saturday and a timesheet
 * that starts on Sunday splits every week of work in two.
 */
export function startOfISTWeek(date) {
  const day = startOfISTDay(date);
  /* istWeekday is 0 Sunday … 6 Saturday; Monday is the start, so Sunday
     looks back six days rather than forward one. */
  const weekday = new Date(day.getTime() + 5.5 * 3_600_000).getUTCDay();
  const back = (weekday + 6) % 7;
  return new Date(day.getTime() - back * 86_400_000);
}

/** The seven IST midnights of that week, Monday first. */
export function weekDays(date) {
  const monday = startOfISTWeek(date);
  return Array.from(
    { length: 7 },
    (_, i) => new Date(monday.getTime() + i * 86_400_000),
  );
}

/** Working days in a window, both ends included. */
export function workingDaysBetween(from, to) {
  let count = 0;
  for (
    let day = startOfISTDay(from);
    day <= startOfISTDay(to);
    day = new Date(day.getTime() + 86_400_000)
  ) {
    if (isWorkingDay(day)) count += 1;
  }
  return count;
}

/**
 * How a person's minutes fell across a set of days.
 *
 * Keyed by `YYYY-MM-DD` in IST, because that is what a date input and a
 * column heading both want, and because bucketing a date stored at IST
 * midnight by its UTC day puts it in yesterday (see `istInputDate`).
 *
 * @param {{on: Date, minutes: number, chargeable: boolean}[]} entries
 * @returns {Map<string, {minutes: number, chargeable: number}>}
 */
export function byDay(entries) {
  const out = new Map();
  for (const entry of entries) {
    const key = istInputDate(entry.on);
    const row = out.get(key) ?? { minutes: 0, chargeable: 0 };
    row.minutes += entry.minutes ?? 0;
    if (entry.chargeable) row.chargeable += entry.minutes ?? 0;
    out.set(key, row);
  }
  return out;
}

/** Totals over a set of entries. */
export function totals(entries) {
  let minutes = 0;
  let chargeable = 0;
  for (const entry of entries) {
    minutes += entry.minutes ?? 0;
    if (entry.chargeable) chargeable += entry.minutes ?? 0;
  }
  return { minutes, chargeable, other: minutes - chargeable };
}

/**
 * Chargeable ÷ available, as a whole percentage.
 *
 * Null rather than zero when there is nothing to divide by: a person with
 * no capacity set has no utilisation, and 0% would read as a person who
 * did nothing.
 *
 * @returns {number|null}
 */
export function utilisation(chargeableMinutes, availableMinutes) {
  if (!availableMinutes) return null;
  return Math.round((chargeableMinutes / availableMinutes) * 100);
}

/**
 * What the time was worth, in paise.
 *
 * `rateByUser` is paise per hour, by user id. A person with no rate
 * contributes nothing and is counted in `unrated` instead, so a screen can
 * say "two people have no rate" rather than quietly understating the
 * firm's cost by their hours.
 *
 * @param {{userId: any, minutes: number}[]} entries
 * @param {Map<string, number>} rateByUser
 */
export function timeValue(entries, rateByUser) {
  let paise = 0;
  let ratedMinutes = 0;
  const unrated = new Set();

  for (const entry of entries) {
    const id = String(entry.userId);
    const rate = rateByUser.get(id) ?? 0;
    if (!rate) {
      if (entry.minutes > 0) unrated.add(id);
      continue;
    }
    /* Round once, at the end of each line: paise are integers and a
       half-paise on every line of a year adds up to a visible rupee. */
    paise += Math.round((rate * (entry.minutes ?? 0)) / 60);
    ratedMinutes += entry.minutes ?? 0;
  }

  return { paise, ratedMinutes, unrated: [...unrated] };
}

/**
 * Billed ÷ time value, as a whole percentage. Null when nothing was spent
 * — a job that took no recorded time has no realisation, and 0% or ∞ would
 * both be a lie about it.
 *
 * @returns {number|null}
 */
export function realisation(billedPaise, timeValuePaise) {
  if (!timeValuePaise) return null;
  return Math.round((billedPaise / timeValuePaise) * 100);
}

/**
 * Fee against time value, client by client, worst realisation first.
 *
 * The order is the point: the screen exists to find the clients costing
 * more than they pay, and sorting by name buries them.
 *
 * @param {{clientId: string, name: string, feePaise: number, minutes: number, valuePaise: number}[]} rows
 */
export function byClient(rows) {
  return rows
    .map((row) => ({
      ...row,
      realisation: realisation(row.feePaise, row.valuePaise),
    }))
    .sort((a, b) => {
      /* Clients with no recorded time sink to the bottom: there is nothing
         to say about them yet, and they are not the ones losing money. */
      if (a.realisation === null) return b.realisation === null ? 0 : 1;
      if (b.realisation === null) return -1;
      return a.realisation - b.realisation;
    });
}

/**
 * Who has not filled a timesheet, and for which working days.
 *
 * A day with no line at all, not a day that looks short: "I did three
 * hours on Tuesday" is a timesheet, and the firm chasing it would be
 * chasing an answer it already has.
 *
 * @param {{userId: any, on: Date, minutes: number}[]} entries
 * @param {{id: string, name: string}[]} people
 * @param {Date[]} days
 */
export function unrecorded(entries, people, days) {
  const filled = new Set();
  for (const entry of entries) {
    if ((entry.minutes ?? 0) > 0) {
      filled.add(`${String(entry.userId)}|${istInputDate(entry.on)}`);
    }
  }

  const working = days.filter(isWorkingDay);

  return people
    .map((person) => ({
      ...person,
      days: working.filter(
        (day) => !filled.has(`${person.id}|${istInputDate(day)}`),
      ),
    }))
    .filter((row) => row.days.length > 0);
}

/** Minutes between two moments, never negative, never a fraction. */
export function minutesSince(startedAt, now = new Date()) {
  return Math.max(
    0,
    Math.round((now.getTime() - new Date(startedAt).getTime()) / 60_000),
  );
}

/**
 * Reading what somebody typed into the add-time form.
 *
 * Hours in, minutes out: people say "2.5" or "2:30" and both mean the same
 * line. A day in the future is refused — a timesheet is a record of what
 * happened, and the one way to make it useless is to let it hold
 * intentions.
 *
 * @param {{on: string, hours: string, engagementId?: string, what?: string}} form
 * @param {Date} [now]
 */
export function checkTime(form, now = new Date()) {
  const text = String(form.hours ?? "").trim();
  if (!text) return { ok: false, error: "How long did it take?" };

  let hours;
  if (text.includes(":")) {
    const [h, m] = text.split(":");
    hours = Number(h) + Number(m) / 60;
  } else {
    hours = Number(text);
  }
  if (!Number.isFinite(hours) || hours <= 0) {
    return { ok: false, error: "Hours is a number, like 2.5 or 2:30." };
  }
  if (hours > 24) {
    return { ok: false, error: "A day holds 24 hours." };
  }

  const minutes = Math.round(hours * 60);
  if (minutes < 1)
    return { ok: false, error: "That rounds to no time at all." };

  const on = String(form.on ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) {
    return { ok: false, error: "Which day was it?" };
  }
  const day = new Date(`${on}T00:00:00+05:30`);
  if (Number.isNaN(day.getTime())) {
    return { ok: false, error: "Which day was it?" };
  }
  if (day > startOfISTDay(now)) {
    return { ok: false, error: "A timesheet is for days that have happened." };
  }

  const engagementId = String(form.engagementId ?? "").trim();
  const what = String(form.what ?? "").trim();
  if (!engagementId && !what) {
    return { ok: false, error: "Pick a job, or say what the time went on." };
  }

  return { ok: true, minutes, on: day, engagementId, what };
}
