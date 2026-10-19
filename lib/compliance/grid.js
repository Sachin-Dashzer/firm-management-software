// @ts-check

import { istDate } from "../dates.js";
import { periodFor, parsePeriod } from "../engagements/period.js";

/**
 * The compliance status grid (spec section 8): clients down the side,
 * periods across the top, each cell coloured by status — the fastest way to
 * spot a month nobody filed.
 *
 * Kept pure so it can be tested without a database, and so the hard part —
 * which periods a financial year contains, and what an empty cell means —
 * is stated once.
 */

/**
 * Every period of one financial year, oldest first.
 *
 * @param {string} recurrence
 * @param {number} fyStart the calendar year the financial year starts in
 * @returns {Array<{code: string, label: string, short: string, start: Date, end: Date}>}
 */
export function periodsInYear(recurrence, fyStart) {
  if (recurrence === "annual" || recurrence === "one-time") {
    const period = periodFor("annual", istDate(fyStart, 6, 1));
    return [{ ...period, short: period.label }];
  }

  const out = [];
  // step through the year a fortnight at a time and collect what we land in:
  // shorter than special-casing months, quarters and halves separately
  for (let month = 4; month <= 15; month += 1) {
    const year = month > 12 ? fyStart + 1 : fyStart;
    const real = month > 12 ? month - 12 : month;
    const period = periodFor(recurrence, istDate(year, real, 15));
    if (!out.some((p) => p.code === period.code)) {
      out.push({ ...period, short: shortLabel(period, recurrence) });
    }
  }
  return out;
}

/** "Oct", "Q3", "H2" — a column heading has to be narrow. */
function shortLabel(period, recurrence) {
  if (recurrence === "monthly") return period.label.split(" ")[0];
  const match = /-(Q[1-4]|H[12])$/.exec(period.code);
  return match ? match[1] : period.label;
}

/**
 * What a cell says.
 *
 * The distinction that matters is between *nothing was created* and *it was
 * created and not done*: the first is a hole in the system, the second is
 * work in progress. They are never shown the same way.
 *
 * @param {object|null} engagement
 * @param {Date} now
 * @param {{ start: Date, end: Date }} period
 */
export function cellFor(engagement, now, period) {
  if (!engagement) {
    if (period.start > now) {
      return { state: "future", label: "—", title: "Not due yet" };
    }
    // The period the firm is *in* is not a hole: October's return is not
    // missing on 17 October, and the generator only creates it a fortnight
    // before it falls due. Only a period that has ended counts against
    // anyone — otherwise the grid cries wolf every month.
    if (period.end > now) {
      return {
        state: "current",
        label: "–",
        title: "This period, not yet due",
      };
    }
    return {
      state: "missing",
      label: "·",
      title: "No engagement was ever created for this period",
    };
  }

  const due = engagement.statutoryDue ?? engagement.internalDue ?? null;
  const late = due ? new Date(due) < now : false;

  switch (engagement.status) {
    case "Completed":
      return { state: "done", label: "✓", title: "Completed" };
    case "Filed / delivered":
      return { state: "filed", label: "✓", title: "Filed, awaiting sign-off" };
    case "Cancelled":
      return { state: "cancelled", label: "×", title: "Cancelled" };
    case "On hold":
      return { state: "held", label: "‖", title: "On hold" };
    default:
      return late
        ? { state: "late", label: "!", title: `${engagement.status}, overdue` }
        : {
            state: "open",
            label: "•",
            title: engagement.status,
          };
  }
}

/**
 * Assemble the grid.
 *
 * The firm's grid puts one service's clients down the side; a client's own
 * case file puts one client's services down the side. Same cells, same rule
 * about what an empty one means, so `keyOf` says which field of an engagement
 * names its row and the two grids cannot drift apart.
 *
 * @param {object} input
 * @param {Array<{id: string, name: string}>} input.clients the rows
 * @param {Array<any>} input.engagements  plain objects with period, status, dates
 * @param {Array<{code: string, short: string, start: Date, end: Date}>} input.periods
 * @param {(engagement: any) => string} [input.keyOf] which row an engagement belongs to
 * @param {Date} [input.now]
 */
export function buildGrid({
  clients,
  engagements,
  periods,
  keyOf = (engagement) => String(engagement.clientId),
  now = new Date(),
}) {
  const byRowPeriod = new Map();
  for (const engagement of engagements) {
    byRowPeriod.set(`${keyOf(engagement)}:${engagement.period}`, engagement);
  }

  const rows = clients.map((client) => {
    const cells = periods.map((period) => {
      const engagement = byRowPeriod.get(`${client.id}:${period.code}`);
      return {
        period: period.code,
        engagementId: engagement ? String(engagement._id) : null,
        ...cellFor(engagement ?? null, now, period),
      };
    });

    return {
      ...client,
      cells,
      missing: cells.filter((c) => c.state === "missing").length,
      late: cells.filter((c) => c.state === "late").length,
    };
  });

  return {
    rows,
    // the two numbers a partner actually wants off this screen
    totalMissing: rows.reduce((sum, r) => sum + r.missing, 0),
    totalLate: rows.reduce((sum, r) => sum + r.late, 0),
  };
}

export { parsePeriod };
