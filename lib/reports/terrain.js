// @ts-check

import Engagement from "../../models/Engagement.js";
import { engagementQuery } from "../engagements/filter.js";
import { startOfISTDay, formatISTDate, daysUntil } from "../dates.js";
import { NOT_FILED_STATUSES } from "../mailer/sweep.js";

/**
 * The deadline landscape (spec section 15): weeks along one axis, branches
 * along the other, how much is due in each cell, and how much of it is
 * already late.
 *
 * Built as a plain grid of numbers with no opinion about how it is drawn,
 * because it is drawn two ways — as a flat heatmap and as a 3D terrain —
 * and both have to agree. Each cell carries the filter that produced it,
 * so clicking any square or column opens exactly the work it counted.
 *
 * @param {object} actor
 * @param {Array<{_id: any, code: string, name: string}>} branches
 * @param {{ weeks?: number, now?: Date }} [options]
 */
export async function deadlineTerrain(actor, branches, options = {}) {
  const weeks = options.weeks ?? 8;
  const now = options.now ?? new Date();
  const today = startOfISTDay(now);
  const WEEK = 7 * 86_400_000;

  // the week that contains today starts on its Monday, so the columns line
  // up with how the firm talks about a week
  const weekday = (new Date(today).getUTCDay() + 6) % 7;
  const firstMonday = new Date(today.getTime() - weekday * 86_400_000);

  const spans = Array.from({ length: weeks }, (_, index) => {
    const start = new Date(firstMonday.getTime() + index * WEEK);
    const end = new Date(start.getTime() + WEEK);
    return {
      index,
      start,
      end,
      label: `${formatISTDate(start).slice(0, 5)}`,
      from: start.toISOString().slice(0, 10),
      to: new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10),
    };
  });

  const horizon = new Date(firstMonday.getTime() + weeks * WEEK);

  const rows = await Engagement.find({
    ...engagementQuery(actor, {}, now),
    status: NOT_FILED_STATUSES,
    $or: [
      { statutoryDue: { $lt: horizon } },
      { statutoryDue: null, internalDue: { $lt: horizon } },
    ],
  })
    .select("branchId statutoryDue internalDue")
    .limit(20000)
    .lean();

  /** @type {Map<string, {due: number, overdue: number}>} */
  const cells = new Map();
  const key = (branchId, week) => `${branchId}:${week}`;

  for (const row of rows) {
    const due = row.statutoryDue ?? row.internalDue;
    if (!due) continue;

    const when = startOfISTDay(new Date(due));
    // anything already past its date lands in this week's column: it is
    // today's problem, not the week it was originally due
    const offset = Math.floor((when.getTime() - firstMonday.getTime()) / WEEK);
    const week = Math.max(0, Math.min(weeks - 1, offset));

    const id = String(row.branchId);
    const cell = cells.get(key(id, week)) ?? { due: 0, overdue: 0 };
    cell.due += 1;
    if (daysUntil(when, now) < 0) cell.overdue += 1;
    cells.set(key(id, week), cell);
  }

  const grid = branches.map((branch) => {
    const id = String(branch._id);
    return {
      id,
      code: branch.code,
      name: branch.name,
      cells: spans.map((span) => {
        const cell = cells.get(key(id, span.index)) ?? { due: 0, overdue: 0 };
        return {
          week: span.index,
          label: span.label,
          due: cell.due,
          overdue: cell.overdue,
          // what the colour says: none, some, or mostly late
          share: cell.due === 0 ? 0 : cell.overdue / cell.due,
          href: `/engagements?branch=${id}&from=${span.from}&to=${span.to}`,
        };
      }),
    };
  });

  const peak = Math.max(
    1,
    ...grid.flatMap((row) => row.cells.map((cell) => cell.due)),
  );

  return {
    weeks: spans.map(({ index, label, from, to }) => ({
      index,
      label,
      from,
      to,
    })),
    grid,
    peak,
    total: rows.length,
  };
}
