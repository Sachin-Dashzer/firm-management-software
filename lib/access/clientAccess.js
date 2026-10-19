// @ts-check

import { can, scopeOf, seesOnlyOwnRecords } from "../permissions.js";
import { connectDB } from "../db.js";
import Engagement from "../../models/Engagement.js";
import ClientAccess from "../../models/ClientAccess.js";
import { SECTIONS, ASSIGNMENT_SECTIONS } from "./sections.js";

/**
 * Who may see which part of a client (owner decision D3, 19-10-2026).
 *
 * One question, asked in one place, by the client list, every tab of the case
 * file, every client write, the document links, the firm document search and
 * the command bar. Spreading it would mean a tab that shows what an action
 * then refuses, or worse, the other way round.
 *
 * Three ways in, narrowest first:
 *
 *  - **assignment** — assignee or reviewer on an *open* engagement, which
 *    gives the profile, the engagement list and the documents, and nothing
 *    else. No grant needed; it lapses when the work closes.
 *  - **grant** — a CA named this person, this client, these sections and a
 *    reason (`models/ClientAccess.js`).
 *  - **role** — a Partner, a CA in their branches, or the accounts person,
 *    exactly as spec section 2 had it before any of this.
 *
 * An expiry is honoured here, when the grant is read, rather than waiting for
 * `jobs/expireGrants.js` to notice. The job only tidies up, so a missed cron
 * can never leave access open past its date.
 */

/**
 * @typedef {object} Access
 * @property {boolean} visible may this person open the client at all
 * @property {Set<string>} sections which parts of the file they may see
 * @property {"role"|"assignment"|"grant"|"none"} via how they got in
 * @property {string[]|null} engagementIds when they are in by assignment,
 *   the only engagements they may see; `null` means no such limit
 */

/** Work that is still live. A closed engagement stops opening its client. */
const OPEN = { $nin: ["Completed", "Cancelled"] };

/**
 * Which permission area decides each section.
 *
 * `engagements` hangs off `clients` rather than `engagementsWork` on purpose:
 * this is the *list* on the case file, and a grant is meant to let somebody
 * see that a client has this work. Opening and working an engagement is still
 * `engagementsWork`, which stays assignment-scoped — so a grant shows the
 * work without handing over the working papers.
 */
const SECTION_AREA = {
  profile: "clients",
  notes: "clients",
  engagements: "clients",
  documents: "documents",
  identifiers: "clientIdentifiers",
  credentials: "clientCredentials",
  billing: "invoices",
};

/** The grant in force for this person on this client, if any. */
async function liveGrant(userId, clientId, now) {
  const grant = await ClientAccess.findOne({
    userId,
    clientId,
    active: true,
  }).lean();
  if (!grant) return null;
  if (grant.expiresAt && grant.expiresAt <= now) return null;
  return grant;
}

/** The open engagements on this client that this person is on. */
async function assignmentOn(clientId, userId) {
  const rows = await Engagement.find({
    clientId,
    status: OPEN,
    $or: [{ assigneeId: userId }, { reviewerId: userId }],
  })
    .select("_id")
    .lean();
  return rows.map((row) => String(row._id));
}

/**
 * What this person may see of this client.
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {{ _id: any, branchId: any }} client
 * @param {Date} [now]
 * @returns {Promise<Access>}
 */
export async function accessFor(actor, client, now = new Date()) {
  const none = {
    visible: false,
    sections: new Set(),
    via: /** @type {const} */ ("none"),
    engagementIds: [],
  };
  if (!actor || !client) return none;

  await connectDB();

  const clientId = String(client._id);
  const branchId = String(client.branchId ?? "");
  const recordScoped = seesOnlyOwnRecords(actor, "clients");

  // Only the record-scoped roles need the two extra reads. A Partner's client
  // file should not pay for a query that can only ever say "yes, obviously".
  const [engagementIds, grant] = recordScoped
    ? await Promise.all([
        assignmentOn(clientId, actor.id),
        liveGrant(actor.id, clientId, now),
      ])
    : [[], null];

  const target = {
    branchId,
    assignedUserIds: engagementIds.length > 0 ? [actor.id] : [],
    grantedUserIds: grant ? [actor.id] : [],
  };

  if (!can(actor, "view", "clients", target)) return none;

  // what the role allows at all, before any grant narrows it
  const byRole = new Set(
    SECTIONS.filter((section) =>
      can(actor, "view", SECTION_AREA[section], target),
    ),
  );

  if (!recordScoped) {
    return { visible: true, sections: byRole, via: "role", engagementIds: null };
  }

  // A grant says which sections; without one, being on the work gives three.
  const asked = new Set(grant ? grant.sections : ASSIGNMENT_SECTIONS);
  const sections = new Set([...byRole].filter((section) => asked.has(section)));

  return {
    visible: true,
    sections,
    via: grant ? "grant" : "assignment",
    // a grant covers the whole client; an assignment covers only its own work
    engagementIds: grant ? null : engagementIds,
  };
}

/**
 * Every client this person can reach, when their role reaches clients one at
 * a time rather than a branch at a time. `null` means "no such limit" — ask
 * the branch instead.
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {Date} [now]
 * @returns {Promise<string[]|null>}
 */
export async function visibleClientIds(actor, now = new Date()) {
  if (!seesOnlyOwnRecords(actor, "clients")) return null;

  await connectDB();
  const [assigned, granted] = await Promise.all([
    Engagement.distinct("clientId", {
      status: OPEN,
      $or: [{ assigneeId: actor.id }, { reviewerId: actor.id }],
    }),
    ClientAccess.distinct("clientId", {
      userId: actor.id,
      active: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }),
  ]);

  return [...new Set([...assigned, ...granted].map(String))];
}

/**
 * The condition for any list of records that belong to a client, so a query
 * can never return one this person may not see.
 *
 * `{}` means no restriction (a Partner). A CA and the accounts person get
 * their branches. An employee or an intern get the union of the clients they
 * have open work on and the clients they hold a grant for — and deliberately
 * **no** branch condition, because a grant is not branch-tested (see
 * `lib/permissions.js`).
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {string} [field] the field holding the client's id on these records
 * @param {Date} [now]
 * @returns {Promise<Record<string, any>>}
 */
export async function scopedByClient(actor, field = "clientId", now) {
  const ids = await visibleClientIds(actor, now);
  if (ids) return { [field]: { $in: ids } };
  if (scopeOf(actor, "clients") === "all") return {};
  return { branchId: { $in: actor.branchIds ?? [] } };
}

/**
 * The same filter for the client list itself, where the client's id is `_id`.
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {Date} [now]
 * @returns {Promise<Record<string, any>>}
 */
export function clientListFilter(actor, now) {
  return scopedByClient(actor, "_id", now);
}

/**
 * Everyone holding a live grant on this client, for the `grantedUserIds` that
 * the `granted` scope in `lib/permissions.js` matches against.
 *
 * @param {string} clientId
 * @param {Date} [now]
 * @returns {Promise<string[]>}
 */
export async function grantedUserIds(clientId, now = new Date()) {
  await connectDB();
  const rows = await ClientAccess.find({
    clientId,
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .select("userId")
    .lean();
  return rows.map((row) => String(row.userId));
}

/**
 * The target for a `can()` call about one client, with both kinds of
 * attachment filled in. Use it wherever a client's branch alone used to be
 * passed — a write action, a document link — so the `granted` scope has
 * something to match.
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {{ _id: any, branchId: any }} client
 * @param {Date} [now]
 */
export async function targetForClient(actor, client, now = new Date()) {
  const branchId = String(client.branchId ?? "");
  if (!seesOnlyOwnRecords(actor, "clients")) return { branchId };

  await connectDB();
  const [engagementIds, granted] = await Promise.all([
    assignmentOn(String(client._id), actor.id),
    grantedUserIds(String(client._id), now),
  ]);

  return {
    branchId,
    assignedUserIds: engagementIds.length > 0 ? [actor.id] : [],
    grantedUserIds: granted,
  };
}

export { SECTIONS };
