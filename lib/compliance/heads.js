// @ts-check

import { periodsInYear } from "./grid.js";
import { wasOnTime } from "../engagements/milestones.js";

/**
 * Compliance read by head (GST, TDS, ITR, audit…) rather than one service at
 * a time.
 *
 * The status grid answers "which client missed which month" for one service.
 * This answers the question before it: **where does the firm stand overall,
 * this month, this quarter and this year**. One line per service, grouped
 * under the catalog's own categories, so nothing new has to be invented or
 * maintained — GSTR-3B is the GST monthly line because that is what the
 * catalog calls it.
 *
 * Kept pure, like `grid.js`, so the counting can be tested without a
 * database and so the two screens cannot come to disagree about what
 * "overdue" means.
 */

/** Work that is finished, from the compliance point of view. */
const DONE = ["Completed", "Filed / delivered"];

/**
 * How many periods of this financial year have already closed.
 *
 * The period the firm is *in* does not count against anybody: October's
 * return is not missing on 17 October. This is the same rule `cellFor()`
 * applies to one cell, applied to the year.
 *
 * @param {string} recurrence
 * @param {number} fyStart
 * @param {Date} now
 */
export function periodsElapsed(recurrence, fyStart, now) {
  return periodsInYear(recurrence, fyStart).filter((p) => p.end <= now).length;
}

/**
 * One line per service, grouped by the category it sits in.
 *
 * @param {object} input
 * @param {Array<{id: string, code: string, name: string, category: string, recurrence: string}>} input.services
 * @param {Array<any>} input.engagements plain engagement objects for the year
 * @param {Map<string, number>} input.subscribers clients signed up, by service id
 * @param {number} input.fyStart
 * @param {Date} [input.now]
 */
export function buildHeads({
  services,
  engagements,
  subscribers,
  fyStart,
  now = new Date(),
}) {
  /** @type {Map<string, any>} */
  const byService = new Map(
    services.map((service) => [
      service.id,
      {
        ...service,
        clients: subscribers.get(service.id) ?? 0,
        created: 0,
        done: 0,
        open: 0,
        overdue: 0,
        onHold: 0,
        /**
         * The two halves of "on time %" (P3-34 phase 4), counted rather
         * than divided here so a category can add them up before the
         * division. Averaging four percentages would weight a head with
         * three filings the same as one with a hundred and sixty-eight.
         */
        judged: 0,
        met: 0,
      },
    ]),
  );

  for (const engagement of engagements) {
    const line = byService.get(String(engagement.serviceTemplateId));
    if (!line) continue;

    line.created += 1;
    if (DONE.includes(engagement.status)) {
      line.done += 1;
      /**
       * `wasOnTime()` is three-valued, and the third value is the point:
       * work with nothing filed against it, or filed with no date behind
       * it, cannot be judged. Counting it as on time would be lying by
       * omission, so it is left out of both halves.
       */
      const onTime = wasOnTime(engagement);
      if (onTime !== null) {
        line.judged += 1;
        if (onTime) line.met += 1;
      }
      continue;
    }
    if (engagement.status === "Cancelled") continue;
    if (engagement.status === "On hold") {
      line.onHold += 1;
      continue;
    }

    line.open += 1;
    const due = engagement.statutoryDue ?? engagement.internalDue ?? null;
    if (due && new Date(due) < now) line.overdue += 1;
  }

  /** @type {Map<string, any[]>} */
  const byCategory = new Map();
  for (const line of byService.values()) {
    const expected =
      line.clients * periodsElapsed(line.recurrence, fyStart, now);

    /**
     * ponytail: periods nobody created, counted as "one engagement per
     * subscribed client per closed period, less what exists" rather than by
     * walking every client against every period as the grid does. It is the
     * same arithmetic wherever a client was signed up for the whole year,
     * and reads one engagement short per client who joined mid-year. The
     * grid behind each line is the exact answer, which is why every line
     * links to it.
     */
    line.missing = Math.max(0, expected - line.created);
    line.attention = line.overdue + line.missing;

    const list = byCategory.get(line.category) ?? [];
    list.push(line);
    byCategory.set(line.category, list);
  }

  const categories = [...byCategory.entries()]
    .map(([name, lines]) => ({
      name,
      lines: lines.sort((a, b) => a.name.localeCompare(b.name)),
      attention: lines.reduce((sum, l) => sum + l.attention, 0),
      open: lines.reduce((sum, l) => sum + l.open, 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = [...byService.values()];

  return {
    categories,
    lines,
    totals: {
      open: categories.reduce((sum, c) => sum + c.open, 0),
      overdue: lines.reduce((sum, l) => sum + l.overdue, 0),
      missing: lines.reduce((sum, l) => sum + l.missing, 0),
      judged: lines.reduce((sum, l) => sum + l.judged, 0),
      met: lines.reduce((sum, l) => sum + l.met, 0),
    },
  };
}

/**
 * Which of the three cards a head belongs on (P3-34 phase 4).
 *
 * Half-yearly sits under Annual rather than getting a fourth card. Two
 * filings a year is an annual rhythm in every way that matters to the
 * person reading this screen, and a card holding one service is a card
 * that teaches nothing.
 */
export const FREQUENCY_OF = {
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "annual",
  "half-yearly": "annual",
};

export const FREQUENCIES = [
  { key: "monthly", label: "Monthly", href: "/compliance/monthly" },
  { key: "quarterly", label: "Quarterly", href: "/compliance/quarterly" },
  { key: "annual", label: "Annual", href: "/compliance/annual" },
];

/**
 * The four summary cards over the heads tables.
 *
 * **On time is a ratio of counts, not an average of percentages.** GSTR-1
 * at 157 of 168 and a one-client ROC filing at 0 of 1 are not two numbers
 * to average: the firm's monthly on-time figure is 157 of 169. Averaging
 * them would let a head with three filings swing a figure built on two
 * hundred.
 *
 * `onTime` is `null` rather than 0 when nothing can be judged, so the
 * screen can print "—" and say so. A firm that has filed nothing yet is
 * not a firm that is 0% on time.
 *
 * @param {ReturnType<typeof buildHeads>} heads
 */
export function frequencySummary(heads) {
  const lines = heads.lines ?? [];

  const of = (keep) => {
    const kept = lines.filter(keep);
    const sum = (field) => kept.reduce((total, l) => total + l[field], 0);
    const judged = sum("judged");

    return {
      heads: kept.map((line) => line.name),
      count: kept.length,
      onTime: judged === 0 ? null : Math.round((sum("met") / judged) * 100),
      // open and not yet past its date: work the firm still holds the time for
      inHand: sum("open") - sum("overdue"),
      overdue: sum("overdue"),
      missing: sum("missing"),
    };
  };

  return {
    all: of(() => true),
    monthly: of((l) => FREQUENCY_OF[l.recurrence] === "monthly"),
    quarterly: of((l) => FREQUENCY_OF[l.recurrence] === "quarterly"),
    annual: of((l) => FREQUENCY_OF[l.recurrence] === "annual"),
  };
}
