// @ts-check

import { connectDB } from "../db.js";
import { targetForClient } from "../access/clientAccess.js";
import Client from "../../models/Client.js";
import Engagement from "../../models/Engagement.js";

/**
 * Who may touch a file, and what it is attached to (spec section 6).
 *
 * These two were private to `app/(app)/documents/actions.js` until the work
 * drive needed the same answers for a folder (P3-48). They are here, not
 * there, because a `"use server"` file may only export server actions — and
 * because two copies of a permission target is how one of them ends up
 * looser than the other.
 */

/**
 * The engagement and the client a file is being put on or taken from.
 *
 * @param {object} actor
 * @param {{ engagementId?: string, clientId?: string }} where
 */
export async function loadTarget(actor, { engagementId, clientId }) {
  await connectDB();

  if (engagementId) {
    const engagement = await Engagement.findById(engagementId).lean();
    if (!engagement) throw new Error("That engagement no longer exists.");
    const client = await Client.findById(engagement.clientId)
      .select("code branchId legalName tradeName")
      .lean();
    return { engagement, client };
  }

  const client = await Client.findById(clientId)
    .select("code branchId legalName tradeName")
    .lean();
  if (!client) throw new Error("That client no longer exists.");
  return { engagement: null, client };
}

/**
 * The target for a `can(… "documents" …)` call about one file.
 *
 * Everything that decides whether somebody may touch a document asks this,
 * so the paths through the documents actions cannot drift apart. It carries
 * three kinds of attachment:
 *
 *  - the branch, for a CA;
 *  - the engagement's own assignee and reviewer, for work on their desk;
 *  - who holds a grant on the client, and whether this person is on any of
 *    its open work (`targetForClient`) — which is what lets somebody reach
 *    the client's **permanent file**, the PAN card and the incorporation
 *    certificate that belong to no single engagement.
 *
 * `targetForClient` returns early for a Partner, a CA or the accounts
 * person, so their downloads pay for no extra query.
 *
 * @param {object} actor
 * @param {any} engagement
 * @param {any} client
 * @param {any} [clientId] when neither record was loaded
 */
export async function targetOf(actor, engagement, client, clientId) {
  const id = String(engagement?.clientId ?? client?._id ?? clientId ?? "");
  const branchId = String(engagement?.branchId ?? client?.branchId ?? "");

  const base = id
    ? await targetForClient(actor, { _id: id, branchId })
    : { branchId };

  return {
    ...base,
    assigneeId: String(engagement?.assigneeId ?? ""),
    reviewerId: String(engagement?.reviewerId ?? ""),
  };
}
