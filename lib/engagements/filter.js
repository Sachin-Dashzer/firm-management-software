// @ts-check

import { branchFilter } from "../permissions.js";
import { startOfISTDay } from "../dates.js";
import { CLOSED_STATUSES } from "./status.js";
import { LEVEL_OF } from "../services/catalog.js";
import { viewIsMine } from "../access/view.js";

/**
 * Turn the filters in the URL into one Mongo query (spec section 5 views).
 *
 * The list screen and the CSV export both call this, so what you see on
 * screen is exactly what you download — scoping included. Scope is applied
 * here and not left to the caller: a filter the user types must never widen
 * what their role may see.
 */

const DAY = 86_400_000;

/** @param {string} due @param {Date} now */
export function dueRange(due, now) {
  const today = startOfISTDay(now);
  switch (due) {
    case "overdue":
      return { $lt: today };
    case "today":
      return { $gte: today, $lt: new Date(today.getTime() + DAY) };
    case "week":
      return { $lt: new Date(today.getTime() + 7 * DAY) };
    case "month":
      return { $lt: new Date(today.getTime() + 30 * DAY) };
    default:
      return null;
  }
}

/**
 * @param {{id: string, role: string, branchIds?: string[]}} actor
 * @param {Record<string, string>} params
 * @param {Date} [now]
 * @returns {Record<string, any>}
 */
export function engagementQuery(actor, params = {}, now = new Date()) {
  /** @type {Record<string, any>} */
  const query = { ...(branchFilter(actor, "engagementsWork") ?? {}) };

  // closed work is out of the way unless asked for
  if (!params.closed) query.status = { $nin: CLOSED_STATUSES };
  if (params.status) query.status = params.status;

  if (params.priority) query.priority = params.priority;
  if (params.service) query.serviceTemplateId = params.service;
  if (params.period) query.period = params.period;
  if (params.branch) query.branchId = params.branch;

  /**
   * The group filter (P2-11). A group is resolved to its businesses before
   * this is called — by `clientIdsInGroup`, which applies the client scope —
   * so what arrives here is already a list this person may see. An empty
   * list is still a list: it must match nothing, not everything.
   */
  if (params.clientIds) query.clientId = { $in: params.clientIds };

  /**
   * A, B or C (owner decision D4). The engagement carries the level it was
   * created from in its snapshot, not a reference to the template, so this
   * reads the snapshot — which also means a service whose level was changed
   * last month does not retrospectively re-tier work already under way.
   */
  if (params.tier && LEVEL_OF[params.tier]) {
    query["templateSnapshot.level"] = LEVEL_OF[params.tier];
  }

  // an employee or intern only ever sees their own work (spec section 2),
  // whatever the URL asks for
  const ownWorkOnly = ["employee", "intern"].includes(actor.role);
  /**
   * "My work across branches" is the view half of P3-7, and it lands on
   * the condition that was already here. It narrows: a manager who picks
   * it sees the jobs they prepare or review, including the one in Noida
   * they review for somebody else — but still only inside their access,
   * because `branchFilter` above has already run.
   */
  if (ownWorkOnly || params.mine || viewIsMine(actor.view)) {
    query.$or = [{ assigneeId: actor.id }, { reviewerId: actor.id }];
  } else if (params.assignee) {
    query.assigneeId = params.assignee;
  }

  const range = dueRange(params.due, now);
  if (range) {
    // the statutory date governs where there is one, the internal date
    // otherwise — the same rule the due chips follow
    query.$and = [
      {
        $or: [
          { statutoryDue: range },
          { statutoryDue: null, internalDue: range },
        ],
      },
    ];
  }

  return query;
}
