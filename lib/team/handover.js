// @ts-check

import Engagement from "../../models/Engagement.js";
import Client from "../../models/Client.js";
import User from "../../models/User.js";
import { can } from "../permissions.js";
import { CLOSED_STATUSES } from "../engagements/status.js";
import { canExecute, canReview, tierLabel } from "../services/catalog.js";
import { formatISTDate } from "../dates.js";

/**
 * One person's open work, with who may legally take each piece (P3-16).
 *
 * Lifted out of the offboarding wizard (D6), which had it inline, because
 * the take-over page asks exactly the same question for a different reason:
 * somebody is away for a fortnight rather than gone for good. Two screens
 * reading one function is the point — a candidate list that differed
 * between them would mean one of the two offers somebody the server
 * refuses.
 *
 * The candidates are worked out here rather than in the browser, so the
 * dropdown cannot offer a person `checkAssignment` would turn down.
 */

/**
 * @param {string} userId whose work
 * @param {{id: string, role: string, branchIds?: string[]}} actor
 */
export async function handoverRows(userId, actor) {
  const open = await Engagement.find({
    status: { $nin: CLOSED_STATUSES },
    $or: [{ assigneeId: userId }, { reviewerId: userId }],
  })
    .select(
      "code status assigneeId reviewerId clientId templateSnapshot periodLabel period statutoryDue internalDue",
    )
    .sort({ statutoryDue: 1 })
    .lean();

  const clients = await Client.find({
    _id: { $in: [...new Set(open.map((row) => String(row.clientId)))] },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((row) => [String(row._id), row.tradeName || row.legalName]),
  );

  const colleagues = await User.find({
    active: true,
    _id: { $ne: userId },
    ...(can(actor, "edit", "team", {}) && actor.role === "partner"
      ? {}
      : { branchIds: { $in: actor.branchIds ?? [] } }),
  })
    .select("name role")
    .sort({ name: 1 })
    .lean();

  return open.map((engagement) => {
    const snapshot = engagement.templateSnapshot ?? {};
    const isAssignee = String(engagement.assigneeId ?? "") === String(userId);

    const candidates = colleagues.filter((person) =>
      isAssignee
        ? canExecute(person.role, snapshot.minExecRole ?? "intern")
        : canReview(person.role, snapshot.minReviewRole ?? "ca"),
    );

    return {
      id: String(engagement._id),
      code: engagement.code,
      service: snapshot.name ?? "Work",
      level: tierLabel(snapshot.level),
      period: engagement.periodLabel || engagement.period,
      status: engagement.status,
      client: clientName.get(String(engagement.clientId)) ?? "—",
      role: isAssignee ? "assignee" : "reviewer",
      due: engagement.statutoryDue ?? engagement.internalDue,
      dueLabel: engagement.statutoryDue
        ? formatISTDate(engagement.statutoryDue)
        : engagement.internalDue
          ? formatISTDate(engagement.internalDue)
          : "—",
      needs: isAssignee
        ? (snapshot.minExecRole ?? "intern")
        : (snapshot.minReviewRole ?? "ca"),
      candidates: candidates.map((person) => ({
        id: String(person._id),
        name: person.name,
        role: person.role,
      })),
    };
  });
}
