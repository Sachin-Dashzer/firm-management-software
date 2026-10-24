// @ts-check

import { can } from "../permissions.js";
import { clientListFilter } from "../access/clientAccess.js";
import { engagementQuery } from "../engagements/filter.js";
import { connectDB } from "../db.js";
import Client from "../../models/Client.js";
import ClientGroup from "../../models/ClientGroup.js";
import Engagement from "../../models/Engagement.js";
import Invoice from "../../models/Invoice.js";
import { outstandingSummary } from "../billing/allocation.js";

/**
 * A group is one owner — a person or a family — and its businesses are the
 * client records under it (owner decision D7, 24-10-2026).
 *
 * With separate PANs each business is already its own client, with its own
 * GSTINs, fees, engagements and invoices, so nothing below the client was
 * needed. This is the layer above: the one place that reads a group's
 * businesses together.
 *
 * Everything here is scoped three times over, by the same helpers the lists
 * use: `clientListFilter` for which businesses exist at all,
 * `engagementQuery` for which work counts, and `can(…, "invoices")` for
 * whether money is read. An employee who may see one business of a group
 * sees a group of one, with that one business's work — never a count of what
 * the rest of the group is up to.
 */

/** Invoices still owed on — the three statuses receivables ages. */
const UNPAID = { $in: ["Sent", "Partially paid", "Disputed"] };

/**
 * @typedef {object} Business
 * @property {string} id
 * @property {string} code
 * @property {string} name trade name where there is one
 * @property {string} legalName
 * @property {string} entityType
 * @property {string} status
 * @property {number} openWork open engagements this person may see
 * @property {number} outstandingPaise 0 when this person may not see money
 * @property {number} overduePaise
 */

/**
 * The businesses of one group, or of every group, each with its open work and
 * what it owes.
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {string[]|null} [groupIds] null for every group
 * @returns {Promise<Array<{id: string, name: string, notes: string, businesses: Business[], openWork: number, outstandingPaise: number, overduePaise: number}>>}
 */
export async function groupRollup(actor, groupIds = null) {
  await connectDB();

  const scope = await clientListFilter(actor);
  const clients = await Client.find({
    ...scope,
    groupId: groupIds ? { $in: groupIds } : { $ne: null },
  })
    .select("code legalName tradeName entityType status groupId")
    .sort({ legalName: 1 })
    .lean();

  if (clients.length === 0) return [];

  const ids = clients.map((c) => c._id);
  const seesMoney = can(actor, "view", "invoices");

  const [groups, openWork, invoices] = await Promise.all([
    ClientGroup.find({
      _id: { $in: [...new Set(clients.map((c) => String(c.groupId)))] },
    })
      .select("name notes")
      .lean(),
    // the same open-work definition, branch scope and own-work rule as the
    // engagement list, so this count can never be wider than that list
    Engagement.aggregate([
      { $match: { ...engagementQuery(actor, {}), clientId: { $in: ids } } },
      { $group: { _id: "$clientId", open: { $sum: 1 } } },
    ]),
    seesMoney
      ? Invoice.find({
          clientId: { $in: ids },
          status: UNPAID,
          type: { $ne: "Credit note" },
        })
          .select("clientId totalPaise paidPaise tdsCreditedPaise dueDate")
          .lean()
      : [],
  ]);

  const openOf = new Map(openWork.map((row) => [String(row._id), row.open]));

  /** @type {Map<string, any[]>} */
  const billsOf = new Map();
  for (const invoice of invoices) {
    const key = String(invoice.clientId);
    billsOf.set(key, [...(billsOf.get(key) ?? []), invoice]);
  }

  /** @type {Map<string, Business[]>} */
  const businessesOf = new Map();
  for (const client of clients) {
    const id = String(client._id);
    const money = outstandingSummary(billsOf.get(id) ?? []);
    const key = String(client.groupId);
    businessesOf.set(key, [
      ...(businessesOf.get(key) ?? []),
      {
        id,
        code: client.code,
        name: client.tradeName || client.legalName,
        legalName: client.legalName,
        entityType: client.entityType,
        status: client.status,
        openWork: openOf.get(id) ?? 0,
        outstandingPaise: money.totalPaise,
        overduePaise: money.overduePaise,
      },
    ]);
  }

  const sum = (rows, field) => rows.reduce((n, row) => n + row[field], 0);

  return groups
    .map((group) => {
      const businesses = businessesOf.get(String(group._id)) ?? [];
      return {
        id: String(group._id),
        name: group.name,
        notes: group.notes ?? "",
        businesses,
        openWork: sum(businesses, "openWork"),
        outstandingPaise: sum(businesses, "outstandingPaise"),
        overduePaise: sum(businesses, "overduePaise"),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The other businesses in this client's group — the sibling panel on the case
 * file. Empty when the client is ungrouped, or is the only one of its group
 * this person may see.
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {{_id: any, groupId?: any}} client
 * @returns {Promise<Business[]>}
 */
export async function siblingsOf(actor, client) {
  if (!client?.groupId) return [];
  const [group] = await groupRollup(actor, [String(client.groupId)]);
  if (!group) return [];
  return group.businesses.filter((b) => b.id !== String(client._id));
}

/**
 * Every client id in these groups that this person may see — what the group
 * filter on the engagement and receivables lists turns a group into.
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {string} groupId
 * @returns {Promise<string[]>}
 */
export async function clientIdsInGroup(actor, groupId) {
  await connectDB();
  const scope = await clientListFilter(actor);
  const rows = await Client.find({ ...scope, groupId })
    .select("_id")
    .lean();
  return rows.map((row) => String(row._id));
}
