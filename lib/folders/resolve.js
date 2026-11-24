// @ts-check

import { connectDB } from "../db.js";
import { can, whyNot } from "../permissions.js";
import { visibleClientIds, targetForClient } from "../access/clientAccess.js";
import { canEditWork } from "../engagements/status.js";
import { financialYearLabel } from "../dates.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import Folder from "../../models/Folder.js";
import { anchorFor, canHoldFolders, fyLabel, parsePath } from "./paths.js";

/**
 * Turning a URL into a node of the work drive (P3-48b).
 *
 * One function, used by the page, by the folder actions and by search, so
 * there is one answer to "may this person be here, and what is here". Two
 * answers is how a screen that hides a folder ends up beside an action that
 * opens it.
 *
 * It does three things, in this order, and the order is the point:
 *
 *  1. **reads the shape** of the path (`parsePath`), so nonsense is refused
 *     before a single record is read;
 *  2. **checks the permission** for the zone and the client;
 *  3. **checks the records agree with each other** — that the job really
 *     belongs to that client, under that service, in that year.
 *
 * Step 3 is what makes a hand-edited URL useless. `clients/c-<A>/svc/
 * s-<X>/fy-2025-26/e-<id>` where the job is client B's is **not found**,
 * rather than a page showing client B's files under client A's name.
 */

/** @typedef {{ error: "notFound"|"noAccess", reason?: string }} Refusal */

/** Not found, and deliberately not "not allowed": see `resolveNode`. */
const NOT_FOUND = { error: /** @type {const} */ ("notFound") };

/**
 * @param {object} actor
 * @param {string[]} [segments] the catch-all route's segments
 * @returns {Promise<any>} the node, or a refusal
 */
export async function resolveNode(actor, segments) {
  const path = parsePath(segments);
  if (!path) return NOT_FOUND;

  const { context, node, folderIds, route } = path;
  /** The segments as the parser read them, so the crumbs line up. */
  const raw = (segments ?? []).map(String).filter(Boolean);

  await connectDB();

  /** @type {Array<{label: string, href: string}>} */
  const crumbs = [{ label: "Home", href: "/documents/folders" }];
  /** Everything the labels and the write rules need, loaded as we descend. */
  const records = {
    /** @type {any} */ client: null,
    /** @type {any} */ service: null,
    /** @type {any} */ engagement: null,
    /** @type {any[]} */ folders: [],
  };

  // --- the zone ------------------------------------------------------------

  if (context.zone === "personal") {
    // D-F2: not even a partner browses somebody else's My Docs
    crumbs.push({ label: "My Docs", href: "/documents/folders/my" });
  } else if (route === "hq") {
    if (!can(actor, "view", "firmFiles")) {
      return { error: "noAccess", reason: whyNot(actor, "view", "firmFiles") };
    }
    crumbs.push({ label: "HQ", href: "/documents/folders/hq" });
  } else if (route === "clients" || route === "services") {
    if (!can(actor, "view", "documents")) {
      return { error: "noAccess", reason: whyNot(actor, "view", "documents") };
    }
  } else if (!can(actor, "view", "firmFiles")) {
    // Home itself, and the firm-zone folders that sit on it
    return { error: "noAccess", reason: whyNot(actor, "view", "firmFiles") };
  }

  if (route === "clients") {
    crumbs.push({ label: "Clients", href: "/documents/folders/clients" });
  }
  if (route === "services") {
    crumbs.push({ label: "Services", href: "/documents/folders/services" });
  }

  // --- the client, and whether this person may see it ----------------------

  /** @type {any} */
  let target = { branchId: "" };

  if (context.clientId) {
    const visible = await visibleClientIds(actor);
    if (visible && !visible.some((id) => String(id) === context.clientId)) {
      // "not found" rather than "not allowed": a refusal that names a
      // client confirms the client exists to somebody who may not know
      return NOT_FOUND;
    }

    records.client = await Client.findById(context.clientId)
      .select("code legalName tradeName branchId")
      .lean();
    if (!records.client) return NOT_FOUND;

    target = await targetForClient(actor, {
      _id: String(records.client._id),
      branchId: String(records.client.branchId ?? ""),
    });
    if (!can(actor, "view", "documents", target)) {
      return {
        error: "noAccess",
        reason: whyNot(actor, "view", "documents", target),
      };
    }
  }

  if (context.serviceTemplateId) {
    records.service = await ServiceTemplate.findById(context.serviceTemplateId)
      .select("name code category")
      .lean();
    if (!records.service) return NOT_FOUND;
  }

  // --- the job, which has to agree with everything above it ---------------

  let fyAssumed = false;

  if (context.engagementId) {
    records.engagement = await Engagement.findById(context.engagementId)
      .select(
        // `checklist` is here because the job's folder lists the papers
        // the checklist points at, and a thin engagement loses them
        // silently — which is what `documents.forEngagement.test.js`
        // caught when it compared the folder against the Files tab
        "code clientId serviceTemplateId periodStart periodLabel period status branchId assigneeId reviewerId templateSnapshot createdAt checklist",
      )
      .lean();
    const job = records.engagement;
    if (!job) return NOT_FOUND;

    const sameClient = String(job.clientId) === context.clientId;
    const sameService =
      String(job.serviceTemplateId) === context.serviceTemplateId;
    const when = job.periodStart ?? job.createdAt;
    const jobFy = `FY${financialYearLabel(new Date(when))}`;
    fyAssumed = !job.periodStart;

    if (!sameClient || !sameService || jobFy !== context.fy) return NOT_FOUND;
  }

  // --- the folder chain ---------------------------------------------------

  if (folderIds.length) {
    const rows = await Folder.find({ _id: { $in: folderIds } }).lean();
    const byId = new Map(rows.map((row) => [String(row._id), row]));
    const anchor = anchorFor(context);

    /** @type {string|null} */
    let expectedParent = null;
    for (const [depth, id] of folderIds.entries()) {
      const folder = byId.get(id);
      if (!folder) return NOT_FOUND;

      // the path it was opened under must be the path it was made under
      if (String(folder.anchor) !== anchor) return NOT_FOUND;
      if (String(folder.parentId ?? "") !== String(expectedParent ?? "")) {
        return NOT_FOUND;
      }
      if (folder.depth !== depth) return NOT_FOUND;
      if (folder.zone === "personal" && String(folder.ownerId) !== actor.id) {
        return NOT_FOUND;
      }

      records.folders.push(folder);
      expectedParent = id;
    }
  }

  // --- the crumbs, now that every label is loaded -------------------------

  /**
   * One crumb per segment of the path actually walked, each linking to the
   * path up to and including itself.
   *
   * Built from the segments rather than from the context, so a person who
   * came in by service walks back out by service: the breadcrumb is the way
   * they came, not the canonical spelling of where they are.
   */
  const clientName = records.client
    ? records.client.tradeName || records.client.legalName
    : "";
  const WORD_LABELS = {
    my: "My Docs",
    hq: "HQ",
    clients: "Clients",
    services: "Services",
    svc: "Services",
    permanent: "Permanent file",
  };

  const walked = [];
  let folderDepth = 0;
  /** The name a person reads for one level. */
  const labelOf = (segment) => {
    if (WORD_LABELS[segment.type]) return WORD_LABELS[segment.type];
    if (segment.type === "client") return clientName;
    if (segment.type === "service") return records.service?.name ?? "";
    if (segment.type === "fy") return fyLabel(segment.fy ?? "");
    if (segment.type === "engagement") {
      /*
        The period alone, not the whole job label: the service's own name is
        two crumbs back, and a trail reading "GSTR 3B › FY 2025-26 › GSTR 3B
        · Oct 2025" spends its last and most-read crumb repeating itself.
        The tile keeps the full name, having no trail to read it in.
      */
      const job = records.engagement;
      const period = job?.periodLabel || job?.period || "";
      /*
        An annual job's period *is* the year, so "FY 2026-27 › FY 2026-27"
        says nothing twice. Its code is then the only thing that tells one
        year's audit from another's.
      */
      return period && period !== fyLabel(context.fy)
        ? period
        : job?.code || jobLabel(job, records.service);
    }
    return records.folders[folderDepth++]?.name ?? "";
  };

  for (const [i, segment] of path.nodes.slice(1).entries()) {
    walked.push(raw[i]);
    const label = labelOf(segment);

    // the zone crumbs are already in, from the permission checks above
    if (i === 0 && ["my", "hq", "clients", "services"].includes(segment.type)) {
      continue;
    }
    crumbs.push({
      label,
      href: ["/documents/folders", ...walked].join("/"),
    });
  }

  // --- what may be done here ----------------------------------------------

  const writeRules = await rulesFor(actor, {
    context,
    node,
    route,
    target,
    engagement: records.engagement,
  });

  return {
    ok: true,
    route,
    node: {
      ...node,
      /**
       * What this node is called when it is named on its own — "filed in
       * …", a confirmation, the empty state. The last crumb, except for a
       * job, whose crumb is deliberately only its period.
       */
      label:
        node.type === "engagement"
          ? jobLabel(records.engagement, records.service)
          : (crumbs[crumbs.length - 1]?.label ?? "Home"),
      system: node.type !== "folder",
      fyAssumed,
    },
    crumbs,
    context: { ...context, folderIds, branchId: String(target.branchId ?? "") },
    records,
    canWrite: writeRules.folders || writeRules.upload,
    writeRules,
  };
}

/** `GSTR-3B · Oct 2025`, with the code shown under it by the tile. */
export function jobLabel(engagement, service) {
  const name =
    engagement?.templateSnapshot?.name ?? service?.name ?? "This job";
  const period = engagement?.periodLabel || engagement?.period || "";
  return period ? `${name} · ${period}` : name;
}

/**
 * May this person make a folder here, and may they upload here?
 *
 * Both carry their reason, so a disabled control can say why it is disabled
 * (P3-8's `whyNot`) rather than leaving somebody clicking at it.
 */
async function rulesFor(actor, { context, node, route, target, engagement }) {
  /** @type {{folders: boolean, upload: boolean, reason: string}} */
  const rules = { folders: false, upload: false, reason: "" };

  if (!canHoldFolders(node.type)) {
    rules.reason =
      "Folders here come from the records. Add a client or a job instead.";
  }

  if (context.zone === "personal") {
    rules.folders = canHoldFolders(node.type);
    rules.upload = true;
    return rules;
  }

  if (route === "hq" || route === "root") {
    const may = can(actor, "edit", "firmFiles");
    rules.folders = may && canHoldFolders(node.type);
    rules.upload = may && canHoldFolders(node.type);
    if (!may) rules.reason = whyNot(actor, "edit", "firmFiles") ?? "";
    return rules;
  }

  const may = can(actor, "edit", "documents", target);
  if (!may) {
    rules.reason = whyNot(actor, "edit", "documents", target) ?? "";
    return rules;
  }

  /**
   * A job that is closed or under somebody else's review takes nothing new,
   * which is the rule `requestUpload` has always applied — the drive must
   * not become a second door into a locked job.
   */
  if (engagement && !canEditWork(actor, engagement)) {
    rules.reason = `Nothing can be attached while this is ${engagement.status}.`;
    return rules;
  }

  rules.folders = canHoldFolders(node.type);
  // the permanent file takes files but no folders
  rules.upload = canHoldFolders(node.type) || node.type === "permanent";
  return rules;
}
