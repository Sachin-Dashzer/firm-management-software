// @ts-check

import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { visibleClientIds } from "../access/clientAccess.js";
import { CLIENT_FILES } from "../documents/zones.js";
import { financialYearLabel } from "../dates.js";
import { fyLabel, fySegment, anchorFor } from "./paths.js";
import { jobLabel } from "./resolve.js";
import { filesForEngagement } from "../documents/forEngagement.js";
import { fileRow } from "../documents/rows.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import Document from "../../models/Document.js";
import Folder from "../../models/Folder.js";

/**
 * What is inside one node of the work drive (P3-48b).
 *
 * The rule this file is written around: **one aggregation per level, never
 * one query per tile.** A client with forty services, each wanting a file
 * count, is one `$group`, not forty `countDocuments` — otherwise the Clients
 * level of a firm with five hundred clients opens five hundred queries and
 * the screen that should feel like a folder feels like a report.
 *
 * Everything is scoped before it is counted. A tile's count is of files the
 * person may actually open, so a number can never tell them that a client
 * they are not allowed to see exists.
 */

/** How many client tiles one page of the Clients level holds. */
export const CLIENTS_PAGE = 120;

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * @param {object} actor
 * @param {any} resolved what `resolveNode` returned
 * @param {{ sort?: string, page?: number, q?: string }} [options]
 */
export async function listChildren(actor, resolved, options = {}) {
  await connectDB();
  const { node, context, route, records } = resolved;
  const sort = ["name", "modified", "size"].includes(String(options.sort))
    ? String(options.sort)
    : "default";

  switch (node.type) {
    case "root":
      return atHome(actor);
    case "my":
      return inZone(actor, { zone: "personal", anchor: "my", sort });
    case "hq":
      return inZone(actor, { zone: "firm", anchor: "hq", sort });
    case "clients":
      return atClients(actor, options);
    case "services":
      return atServices(actor, { byClient: false });
    case "svc":
      return atServices(actor, { byClient: true, context });
    case "service":
      return route === "services"
        ? clientsOfService(actor, context)
        : yearsOf(actor, context);
    case "client":
      return insideClient(actor, context, sort);
    case "permanent":
      return {
        folders: [],
        ...(await filesOf(actor, permanentFilter(context), sort)),
      };
    case "fy":
      return insideYear(actor, context, sort);
    case "engagement":
      return insideJob(actor, resolved, sort);
    case "folder":
      return insideFolder(actor, context, sort);
    default:
      return { folders: [], files: [], totals: { folders: 0, files: 0 } };
  }
}

// --- the shapes a tile and a row come back in ------------------------------

/**
 * @param {object} input
 * @returns {{segment: string, label: string, sublabel: string, system: boolean, count: number|null, updatedAt: string}}
 */
function tile({
  segment,
  label,
  sublabel = "",
  system = true,
  count = null,
  updatedAt = null,
  locked = system,
  status = "",
}) {
  return {
    segment,
    label,
    sublabel,
    system,
    locked,
    count,
    status,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : "",
  };
}

const sortFiles = (rows, sort) =>
  [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "size") return (b.size ?? 0) - (a.size ?? 0);
    return a.at > b.at ? -1 : a.at < b.at ? 1 : 0;
  });

// --- the levels ------------------------------------------------------------

/** Home: the four drives, and the firm's own root folders. */
async function atHome(actor) {
  const [custom, counts] = await Promise.all([
    Folder.find({ anchor: "home", parentId: null })
      .select("name updatedAt")
      .sort({ name: 1 })
      .lean(),
    countsBy(actor, "folderId", { zone: "firm" }),
  ]);

  const folders = [
    tile({ segment: "my", label: "My Docs" }),
    tile({ segment: "hq", label: "HQ" }),
    tile({ segment: "clients", label: "Clients" }),
    tile({ segment: "services", label: "Services" }),
    ...custom.map((row) =>
      tile({
        segment: `f-${row._id}`,
        label: row.name,
        system: false,
        count: counts.get(String(row._id)) ?? 0,
        updatedAt: row.updatedAt,
      }),
    ),
  ];

  // Home holds no loose files; HQ is where the firm's own papers go
  return { folders, files: [], totals: { folders: folders.length, files: 0 } };
}

/** HQ or My Docs: folders somebody made, and the files not in one. */
async function inZone(actor, { zone, anchor, sort }) {
  const own = zone === "personal" ? { ownerId: actor.id } : {};
  const [custom, files, counts] = await Promise.all([
    Folder.find({ anchor, parentId: null, ...own })
      .select("name updatedAt")
      .sort({ name: 1 })
      .lean(),
    Document.find({ zone, folderId: null, ...own }).lean(),
    countsBy(actor, "folderId", { zone, ...own }),
  ]);

  const folders = custom.map((row) =>
    tile({
      segment: `f-${row._id}`,
      label: row.name,
      system: false,
      count: counts.get(String(row._id)) ?? 0,
      updatedAt: row.updatedAt,
    }),
  );
  const rows = sortFiles(
    files.map((d) => fileRow(d)),
    sort,
  );
  return {
    folders,
    files: rows,
    totals: { folders: folders.length, files: rows.length },
  };
}

/** Clients: one tile per client this person may see, paged. */
async function atClients(actor, { page = 1, q = "" } = {}) {
  const visible = await visibleClientIds(actor);
  /** @type {Record<string, any>} */
  const filter = visible ? { _id: { $in: visible } } : {};
  const needle = String(q ?? "").trim();
  if (needle) {
    const loose = new RegExp(
      needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    filter.$or = [{ legalName: loose }, { tradeName: loose }, { code: loose }];
  }

  const [total, clients, counts] = await Promise.all([
    Client.countDocuments(filter),
    Client.find(filter)
      .select("legalName tradeName code updatedAt")
      .sort({ legalName: 1 })
      .skip((Math.max(1, Number(page)) - 1) * CLIENTS_PAGE)
      .limit(CLIENTS_PAGE)
      .lean(),
    countsBy(actor, "clientId", {}),
  ]);

  const folders = clients.map((c) =>
    tile({
      segment: `c-${c._id}`,
      label: c.tradeName || c.legalName,
      sublabel: c.code,
      count: counts.get(String(c._id)) ?? 0,
      updatedAt: c.updatedAt,
    }),
  );

  return {
    folders,
    files: [],
    totals: {
      folders: total,
      files: 0,
      page: Number(page) || 1,
      pageSize: CLIENTS_PAGE,
    },
  };
}

/**
 * The services: every one in the catalog at the top level, and only the ones
 * a client actually has under that client.
 */
async function atServices(actor, { byClient, context }) {
  if (!byClient) {
    const [services, counts] = await Promise.all([
      ServiceTemplate.find({})
        .select("name code category")
        .sort({ name: 1 })
        .lean(),
      countsBy(actor, "serviceTemplateId", {}),
    ]);
    const folders = services.map((s) =>
      tile({
        segment: `s-${s._id}`,
        label: s.name,

        count: counts.get(String(s._id)) ?? 0,
      }),
    );
    return {
      folders,
      files: [],
      totals: { folders: folders.length, files: 0 },
    };
  }

  const clientId = oid(context.clientId);
  const [fromJobs, fromFiles, fromFolders] = await Promise.all([
    Engagement.distinct("serviceTemplateId", { clientId }),
    Document.distinct("serviceTemplateId", {
      clientId,
      ...CLIENT_FILES,
      serviceTemplateId: { $ne: null },
    }),
    Folder.distinct("serviceTemplateId", {
      clientId,
      serviceTemplateId: { $ne: null },
    }),
  ]);

  const ids = [
    ...new Set(
      [...fromJobs, ...fromFiles, ...fromFolders].filter(Boolean).map(String),
    ),
  ];
  const [services, counts] = await Promise.all([
    ServiceTemplate.find({ _id: { $in: ids } })
      .select("name code category")
      .sort({ name: 1 })
      .lean(),
    countsBy(actor, "serviceTemplateId", { clientId }),
  ]);

  const folders = services.map((s) =>
    tile({
      segment: `s-${s._id}`,
      label: s.name,
      count: counts.get(String(s._id)) ?? 0,
    }),
  );
  return { folders, files: [], totals: { folders: folders.length, files: 0 } };
}

/** Services → a service: the clients who have it. */
async function clientsOfService(actor, context) {
  const serviceTemplateId = oid(context.serviceTemplateId);
  const visible = await visibleClientIds(actor);
  const [fromJobs, fromFiles] = await Promise.all([
    Engagement.distinct("clientId", { serviceTemplateId }),
    Document.distinct("clientId", { serviceTemplateId, ...CLIENT_FILES }),
  ]);

  let ids = [
    ...new Set([...fromJobs, ...fromFiles].filter(Boolean).map(String)),
  ];
  if (visible) {
    const allowed = new Set(visible.map(String));
    ids = ids.filter((id) => allowed.has(id));
  }

  const [clients, counts] = await Promise.all([
    Client.find({ _id: { $in: ids } })
      .select("legalName tradeName code")
      .sort({ legalName: 1 })
      .lean(),
    countsBy(actor, "clientId", { serviceTemplateId }),
  ]);

  const folders = clients.map((c) =>
    tile({
      segment: `c-${c._id}`,
      label: c.tradeName || c.legalName,
      sublabel: c.code,
      count: counts.get(String(c._id)) ?? 0,
    }),
  );
  return { folders, files: [], totals: { folders: folders.length, files: 0 } };
}

/** A client: its permanent file, its services, its folders, its loose files. */
async function insideClient(actor, context, sort) {
  const clientId = oid(context.clientId);
  const anchor = anchorFor(context);

  const [permanent, custom, loose, counts] = await Promise.all([
    Document.countDocuments({ clientId, isPermanent: true, ...CLIENT_FILES }),
    Folder.find({ anchor, parentId: null })
      .select("name updatedAt")
      .sort({ name: 1 })
      .lean(),
    Document.find({
      clientId,
      ...CLIENT_FILES,
      isPermanent: { $ne: true },
      engagementId: null,
      folderId: null,
      serviceTemplateId: null,
    }).lean(),
    countsBy(actor, "folderId", { clientId }),
  ]);

  const folders = [
    tile({ segment: "permanent", label: "Permanent file", count: permanent }),
    tile({ segment: "svc", label: "Services" }),
    ...custom.map((row) =>
      tile({
        segment: `f-${row._id}`,
        label: row.name,
        system: false,
        count: counts.get(String(row._id)) ?? 0,
        updatedAt: row.updatedAt,
      }),
    ),
  ];

  const rows = sortFiles(
    loose.map((d) => fileRow(d)),
    sort,
  );
  return {
    folders,
    files: rows,
    totals: { folders: folders.length, files: rows.length },
  };
}

/** A client's service: the financial years, from jobs and from folders. */
async function yearsOf(actor, context) {
  const clientId = oid(context.clientId);
  const serviceTemplateId = oid(context.serviceTemplateId);

  const [jobs, stored, fromFiles, counts] = await Promise.all([
    Engagement.find({ clientId, serviceTemplateId })
      .select("periodStart createdAt")
      .lean(),
    Folder.find({ clientId, serviceTemplateId, kind: "fy" })
      .select("fy updatedAt")
      .lean(),
    Document.distinct("fy", {
      clientId,
      serviceTemplateId,
      ...CLIENT_FILES,
      fy: { $ne: "" },
    }),
    countsBy(actor, "fy", { clientId, serviceTemplateId }),
  ]);

  const years = new Set();
  for (const job of jobs) {
    years.add(
      `FY${financialYearLabel(new Date(job.periodStart ?? job.createdAt))}`,
    );
  }
  for (const folder of stored) if (folder.fy) years.add(folder.fy);
  for (const fy of fromFiles) if (fy) years.add(String(fy));

  const folders = [...years]
    .sort((a, b) => b.localeCompare(a))
    .map((fy) =>
      tile({
        segment: fySegment(fy),
        label: fyLabel(fy),
        count: counts.get(fy) ?? 0,
      }),
    );

  return { folders, files: [], totals: { folders: folders.length, files: 0 } };
}

/** A year: the jobs in it, folders made in it, and the files on no job. */
async function insideYear(actor, context, sort) {
  const clientId = oid(context.clientId);
  const serviceTemplateId = oid(context.serviceTemplateId);
  const anchor = anchorFor(context);

  const [jobs, custom, loose, jobCounts, folderCounts] = await Promise.all([
    Engagement.find({ clientId, serviceTemplateId })
      .select(
        "code periodStart periodLabel period status templateSnapshot createdAt",
      )
      .sort({ periodStart: -1 })
      .lean(),
    Folder.find({ anchor, parentId: null, kind: "custom" })
      .select("name updatedAt")
      .sort({ name: 1 })
      .lean(),
    Document.find({
      clientId,
      serviceTemplateId,
      fy: context.fy,
      ...CLIENT_FILES,
      engagementId: null,
      folderId: null,
    }).lean(),
    countsBy(actor, "engagementId", {
      clientId,
      serviceTemplateId,
      fy: context.fy,
    }),
    countsBy(actor, "folderId", {
      clientId,
      serviceTemplateId,
      fy: context.fy,
    }),
  ]);

  const inYear = jobs.filter(
    (job) =>
      `FY${financialYearLabel(new Date(job.periodStart ?? job.createdAt))}` ===
      context.fy,
  );

  const folders = [
    ...inYear.map((job) =>
      tile({
        segment: `e-${job._id}`,
        label: jobLabel(job, null),
        sublabel: job.code,
        count: jobCounts.get(String(job._id)) ?? 0,
        status: job.status,
      }),
    ),
    ...custom.map((row) =>
      tile({
        segment: `f-${row._id}`,
        label: row.name,
        system: false,
        count: folderCounts.get(String(row._id)) ?? 0,
        updatedAt: row.updatedAt,
      }),
    ),
  ];

  const rows = sortFiles(
    loose.map((d) => fileRow(d)),
    sort,
  );
  return {
    folders,
    files: rows,
    totals: { folders: folders.length, files: rows.length },
  };
}

/**
 * A job: exactly what its Files tab shows (`filesForEngagement`), plus any
 * folders somebody made inside it.
 */
async function insideJob(actor, resolved, sort) {
  const { context } = resolved;
  const anchor = anchorFor(context);

  const [custom, counts, set] = await Promise.all([
    Folder.find({ anchor, parentId: null })
      .select("name updatedAt")
      .sort({ name: 1 })
      .lean(),
    countsBy(actor, "folderId", { engagementId: oid(context.engagementId) }),
    filesForEngagement(actor, context.engagementId, {
      engagement: resolved.records?.engagement,
    }),
  ]);

  const folders = custom.map((row) =>
    tile({
      segment: `f-${row._id}`,
      label: row.name,
      system: false,
      count: counts.get(String(row._id)) ?? 0,
      updatedAt: row.updatedAt,
    }),
  );

  const files = sortFiles(
    [...set.files, ...set.linked, ...set.udin, ...set.samples],
    sort,
  );
  return {
    folders,
    files,
    letters: set.letters,
    totals: { folders: folders.length, files: files.length },
  };
}

/** A folder somebody made: its children, and its files. */
async function insideFolder(actor, context, sort) {
  const folderId = oid(context.folderId);
  const own = context.zone === "personal" ? { ownerId: actor.id } : {};

  /**
   * The children first, then one count over exactly those children — a
   * `$group` over every folder in the firm would answer the same question
   * and read the whole collection to do it.
   */
  const [custom, files] = await Promise.all([
    Folder.find({ parentId: folderId, ...own })
      .select("name updatedAt")
      .sort({ name: 1 })
      .lean(),
    Document.find({ folderId, ...own }).lean(),
  ]);
  const counts = await countsBy(actor, "folderId", {
    folderId: { $in: custom.map((row) => row._id) },
    ...own,
  });

  const folders = custom.map((row) =>
    tile({
      segment: `f-${row._id}`,
      label: row.name,
      system: false,
      count: counts.get(String(row._id)) ?? 0,
      updatedAt: row.updatedAt,
    }),
  );
  const rows = sortFiles(
    files.map((d) => fileRow(d)),
    sort,
  );
  return {
    folders,
    files: rows,
    totals: { folders: folders.length, files: rows.length },
  };
}

// --- counts ---------------------------------------------------------------

/** Every file of this client that is in the permanent file. */
function permanentFilter(context) {
  return {
    clientId: oid(context.clientId),
    isPermanent: true,
    ...CLIENT_FILES,
  };
}

async function filesOf(actor, filter, sort) {
  const files = await Document.find(filter).lean();
  const rows = sortFiles(
    files.map((d) => fileRow(d)),
    sort,
  );
  return { files: rows, totals: { folders: 0, files: rows.length } };
}

/**
 * One tile count for every tile of a level, in a single aggregation.
 *
 * The scope goes in the `$match`, before the `$group`, so the number on a
 * tile counts only files the person may open — a count is information, and
 * a count of a client they cannot see is information they should not have.
 *
 * @param {object} actor
 * @param {string} field what the tiles are grouped by
 * @param {Record<string, any>} where the level's own filter
 * @returns {Promise<Map<string, number>>}
 */
async function countsBy(actor, field, where) {
  /** @type {Record<string, any>} */
  const match = { ...CLIENT_FILES, ...where, [field]: { $ne: null } };

  // `where.zone` deliberately overrides CLIENT_FILES above: inside HQ or
  // My Docs the tiles count that zone's files and nothing else
  if (!where.clientId && !where.engagementId && !where.ownerId) {
    const visible = await visibleClientIds(actor);
    if (visible && !where.zone) match.clientId = { $in: visible.map(oid) };
  }

  const rows = await Document.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.n]));
}
