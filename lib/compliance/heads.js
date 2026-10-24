// @ts-check

import { periodsInYear } from "./grid.js";

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
      },
    ]),
  );

  for (const engagement of engagements) {
    const line = byService.get(String(engagement.serviceTemplateId));
    if (!line) continue;

    line.created += 1;
    if (DONE.includes(engagement.status)) {
      line.done += 1;
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

  return {
    categories,
    totals: {
      open: categories.reduce((sum, c) => sum + c.open, 0),
      overdue: [...byService.values()].reduce((sum, l) => sum + l.overdue, 0),
      missing: [...byService.values()].reduce((sum, l) => sum + l.missing, 0),
    },
  };
}
