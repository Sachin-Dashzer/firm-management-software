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
 * One formula, one period, one date. The shared core of everything below.
 *
 * @param {any} formula
 * @param {string} periodCode
 * @param {{ eventDate?: Date|null }} context
 * @returns {{ date: Date|null, basis: string, why?: string }}
 */
function resolveFormula(formula, periodCode, context) {
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
 * The formula for one named milestone of a rule, honouring its own variants
 * before the rule's.
 * @param {any} milestone
 * @param {string} periodCode
 */
function milestoneFormulaFor(milestone, periodCode) {
  const variant = (milestone.variants ?? []).find((v) =>
    String(periodCode).endsWith(v.match),
  );
  return variant?.formula ?? milestone.formula;
}

/**
 * Every statutory filing one period of one service owes, in date order
 * (P3-1).
 *
 * A rule with no `milestones` owes exactly one, which is how every rule
 * written before P3-1 behaves and why none of them needed editing. Monthly
 * GST owes two.
 *
 * An override naming a milestone moves that one; an override naming none
 * moves all of them, which is what an override meant before P3-1.
 *
 * @param {any} rule        a DueDateRule, or null
 * @param {string} periodCode
 * @param {{ eventDate?: Date|null }} [context]
 * @returns {{ milestones: Array<{key: string, name: string, date: Date|null, basis: string, why?: string}>, basis: string, why?: string }}
 */
export function milestonesFor(rule, periodCode, context = {}) {
  if (!rule) {
    const why = "No due-date rule exists for this service yet.";
    return { milestones: [], basis: "none", why };
  }

  if (!rule.verifiedAt) {
    // the whole point of rule 8: an unchecked date is worse than no date,
    // because people act on a date
    const why = `The due-date rule for ${rule.serviceCode} has not been confirmed by the firm yet.`;
    return { milestones: [], basis: "unverified", why };
  }

  const overrides = rule.overrides ?? [];
  const forPeriod = overrides.filter((o) => o.period === periodCode);
  const wholeRule = forPeriod.find((o) => !o.milestone);

  const defined =
    (rule.milestones ?? []).length > 0
      ? rule.milestones
      : [
          {
            key: String(rule.serviceCode ?? "").toUpperCase(),
            name: rule.name || rule.serviceCode || "Filing",
            formula: formulaFor(rule, periodCode),
            variants: [],
          },
        ];

  const resolved = defined.map((m) => {
    const key = String(m.key ?? "").toUpperCase();
    const named = forPeriod.find((o) => o.milestone === key);
    const override = named ?? wholeRule;

    if (override) {
      return {
        key,
        name: m.name || key,
        date: new Date(override.dueDate),
        basis: "override",
        why: override.reason,
      };
    }

    const formula =
      (rule.milestones ?? []).length > 0
        ? milestoneFormulaFor(m, periodCode)
        : m.formula;

    const out = resolveFormula(formula, periodCode, context);
    return { key, name: m.name || key, ...out };
  });

  // dated ones first, in order; undated keep their listed order at the end
  const dated = resolved
    .filter((m) => m.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const undated = resolved.filter((m) => !m.date);
  const milestones = [...dated, ...undated];

  const basis = milestones.length ? milestones[0].basis : "none";
  const why = milestones.find((m) => m.why)?.why;
  return { milestones, basis, ...(why ? { why } : {}) };
}

/**
 * The one date that governs the engagement: the earliest filing still
 * outstanding, or the last one once everything is in.
 *
 * This is what the lists, the calendar, the digest and the reports read, and
 * it still answers what they ask — "when is this due". For a monthly GST
 * engagement with nothing filed that is now **GSTR-1 on the 11th**, not
 * GSTR-3B on the 20th, because the 11th is the next thing that has to
 * happen. Before P3-1 the pair collapsed to the later date and the GSTR-1
 * deadline was invisible.
 *
 * Takes either shape: `date` as the rule resolver returns it, or `dueDate`
 * as the engagement stores it. They are the same date under two names, and
 * reading only one of them was a bug the tests caught.
 *
 * @param {Array<{date?: Date|null, dueDate?: Date|null, filedOn?: Date|null}>} milestones
 * @returns {Date|null}
 */
export function governingDate(milestones) {
  const at = (m) => m?.dueDate ?? m?.date ?? null;
  const list = (milestones ?? []).filter((m) => at(m));

  const open = list.filter((m) => !m.filedOn);
  const pool = open.length ? open : list;
  if (!pool.length) return null;

  // the next thing that has to happen while anything is open; the last date
  // once everything is in
  const pick = open.length
    ? (a, b) => (at(a).getTime() <= at(b).getTime() ? a : b)
    : (a, b) => (at(a).getTime() >= at(b).getTime() ? a : b);

  return at(pool.reduce(pick, pool[0]));
}

/**
 * The statutory due date for one period of one service.
 *
 * Unchanged contract, so the forty files that call it did not have to move;
 * since P3-1 it is the governing milestone of `milestonesFor`.
 *
 * @param {any} rule        a DueDateRule, or null
 * @param {string} periodCode
 * @param {{ eventDate?: Date|null }} [context]
 * @returns {{ date: Date|null, basis: string, why?: string }}
 */
export function statutoryDueFor(rule, periodCode, context = {}) {
  const { milestones, basis, why } = milestonesFor(rule, periodCode, context);
  const date = governingDate(milestones);
  if (!date) return { date: null, basis, ...(why ? { why } : {}) };
  const winner = milestones.find(
    (m) => m.date && m.date.getTime() === date.getTime(),
  );
  return {
    date,
    basis: winner?.basis ?? basis,
    ...(winner?.why ? { why: winner.why } : {}),
  };
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
