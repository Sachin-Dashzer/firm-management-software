// @ts-check

import { istDate, istParts, addWorkingDays, isWorkingDay } from "../dates.js";
import { parsePeriod } from "../engagements/period.js";

/**
 * Working out when something is actually due (spec section 8).
 *
 * The one rule that matters here is CLAUDE.md rule 8: we do not invent
 * statutory dates. `statutoryDueFor` returns a date only from a rule a
 * person has verified, and says why when it returns nothing. Everything
 * else in the system treats a missing statutory date as "not known yet"
 * rather than "none".
 */

/** How many days earlier the firm's own target sits (spec section 8). */
export const INTERNAL_LEAD_WORKING_DAYS = Number(
  process.env.INTERNAL_TARGET_WORKING_DAYS || 3,
);

/** Days before the due date that next period's work is created. */
export const GENERATE_LEAD_DAYS = Number(process.env.GENERATE_LEAD_DAYS || 15);

/** The last day of a month, so "the 31st" of a short month behaves. */
function lastDayOf(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Months since year zero, so month arithmetic never wraps wrongly. */
function addMonths(year, month, n) {
  const index = year * 12 + (month - 1) + n;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * The formula to use for one period: a variant if the period matches one,
 * the rule's own otherwise.
 * @param {any} rule
 * @param {string} periodCode
 */
export function formulaFor(rule, periodCode) {
  const variant = (rule.variants ?? []).find((v) =>
    String(periodCode).endsWith(v.match),
  );
  return variant?.formula ?? rule.formula;
}

/**
 * Apply a formula to a period.
 *
 * Returns null for an event-based rule, whose date comes from something
 * dated on the engagement rather than from the calendar.
 *
 * @param {any} formula
 * @param {{ start: Date, end: Date }} period
 * @returns {Date|null}
 */
export function applyFormula(formula, period) {
  if (!formula || formula.kind !== "dayOfMonth") return null;

  // `end` is exclusive — the first moment of the next period — so step back
  // a day to land in the period's own last month
  const lastMoment = new Date(period.end.getTime() - 1);
  const { month, year } = istParts(lastMoment);

  const target = addMonths(year, month, formula.monthsAfter ?? 0);
  const day = Math.min(formula.day ?? 1, lastDayOf(target.year, target.month));

  return istDate(target.year, target.month, day);
}

/**
 * The statutory due date for one period of one service.
 *
 * @param {any} rule        a DueDateRule, or null
 * @param {string} periodCode
 * @param {{ eventDate?: Date|null }} [context]
 * @returns {{ date: Date|null, basis: string, why?: string }}
 */
export function statutoryDueFor(rule, periodCode, context = {}) {
  if (!rule) {
    return {
      date: null,
      basis: "none",
      why: "No due-date rule exists for this service yet.",
    };
  }

  if (!rule.verifiedAt) {
    // the whole point of rule 8: an unchecked date is worse than no date,
    // because people act on a date
    return {
      date: null,
      basis: "unverified",
      why: `The due-date rule for ${rule.serviceCode} has not been confirmed by the firm yet.`,
    };
  }

  // a date the government actually moved wins over any formula
  const override = (rule.overrides ?? []).find((o) => o.period === periodCode);
  if (override) {
    return {
      date: new Date(override.dueDate),
      basis: "override",
      why: override.reason,
    };
  }

  const formula = formulaFor(rule, periodCode);

  if (formula?.kind === "daysAfterEvent") {
    if (!context.eventDate) {
      return {
        date: null,
        basis: "event",
        why: `This date runs from the ${formula.event || "event"}, which has not been entered yet.`,
      };
    }
    const from = new Date(context.eventDate);
    return {
      date: new Date(from.getTime() + (formula.days ?? 0) * 86_400_000),
      basis: "event",
      why: `${formula.days} days after the ${formula.event}`,
    };
  }

  let period;
  try {
    period = parsePeriod(periodCode);
  } catch {
    return { date: null, basis: "none", why: `Unknown period ${periodCode}.` };
  }

  const date = applyFormula(formula, period);
  return date
    ? { date, basis: "formula" }
    : { date: null, basis: "none", why: "The rule has no usable formula." };
}

/**
 * The firm's own target: three working days before the statutory date, so
 * review happens before the last day (spec section 8).
 *
 * @param {Date|null} statutoryDue
 * @param {number} [workingDays]
 * @returns {Date|null}
 */
export function internalTargetFor(statutoryDue, workingDays) {
  if (!statutoryDue) return null;
  const lead = workingDays ?? INTERNAL_LEAD_WORKING_DAYS;

  let date = new Date(statutoryDue);
  let left = lead;
  while (left > 0) {
    date = new Date(date.getTime() - 86_400_000);
    if (isWorkingDay(date)) left -= 1;
  }
  return date;
}

/**
 * When next period's work should be created: a fortnight before it is due,
 * or straight away if that moment has passed (spec section 8).
 * @param {Date|null} statutoryDue
 * @param {number} [leadDays]
 */
export function generateFrom(statutoryDue, leadDays = GENERATE_LEAD_DAYS) {
  if (!statutoryDue) return null;
  return new Date(statutoryDue.getTime() - leadDays * 86_400_000);
}

/** Only used where a turnaround has to be measured, not a statutory date. */
export { addWorkingDays };
