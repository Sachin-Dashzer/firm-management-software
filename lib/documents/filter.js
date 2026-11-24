// @ts-check

import { startOfISTDay } from "../dates.js";
import { CLIENT_FILES } from "./zones.js";

/**
 * The filters on the file register, as one Mongo query (P3-48e).
 *
 * The screen, the Excel export and the bulk actions all call this, so what
 * you see is what you download and what you act on — scope included. The
 * scope is applied **here** and never left to the caller: a filter somebody
 * types into the address bar must not be able to widen what their role may
 * see, and three callers each remembering to narrow it is two chances to
 * forget.
 *
 * `CLIENT_FILES` is part of the base for the same reason. This register is
 * the firm's view of its **clients'** papers; HQ and My Docs have their own
 * places in the drive, and a filter here can never reach them.
 */

/** The file families a person actually asks for, by what the mime says. */
export const FILE_KINDS = {
  pdf: { label: "PDF", test: /^application\/pdf$/ },
  image: { label: "Image", test: /^image\// },
  excel: { label: "Excel", test: /sheet|excel|csv/i },
  word: { label: "Word", test: /word|officedocument\.word/i },
  text: { label: "Text", test: /^text\// },
  zip: { label: "Zip", test: /zip|compressed/i },
};

/** Where a file sits, as the register's one-word answer for it. */
export const LOCATIONS = {
  permanent: "Permanent file",
  job: "On a job",
  loose: "Loose in the client",
};

const DAY = 86_400_000;

/**
 * @param {object} actor
 * @param {Record<string, any>} params the URL's own words
 * @param {{ scope?: Record<string, any>, clientIds?: string[] }} [extra]
 *   `scope` is `scopedByClient(actor, "clientId")`, read by the caller
 *   because it needs the database; `clientIds` is a resolved group.
 * @param {Date} [now]
 */
export function documentQuery(actor, params = {}, extra = {}, now = new Date()) {
  /** @type {Record<string, any>} */
  const query = { ...(extra.scope ?? {}), ...CLIENT_FILES };
  /** @type {Array<{ key: string, label: string }>} */
  const applied = [];

  const add = (key, label) => applied.push({ key, label });

  if (params.client) {
    query.clientId = params.client;
    add("client", "One client");
  }
  /**
   * A group is resolved to its businesses before this is called, by the
   * same helper the engagement list uses, so what arrives is already a list
   * this person may see. An empty list is still a list: it must match
   * nothing, not everything.
   */
  if (extra.clientIds) {
    query.clientId = { $in: extra.clientIds };
    add("group", "One client group");
  }
  if (params.branch) {
    query.branchId = params.branch;
    add("branch", "One branch");
  }
  if (params.service) {
    query.serviceTemplateId = params.service;
    add("service", "One service");
  }
  if (params.fy) {
    query.fy = params.fy;
    add("fy", params.fy);
  }
  if (params.job) {
    query.engagementId = params.job;
    add("job", "One job");
  }

  /** Where it sits. The three are exclusive, which is why they are one word. */
  if (params.where === "permanent") {
    query.isPermanent = true;
    add("where", LOCATIONS.permanent);
  }
  if (params.where === "job") {
    query.engagementId = { $ne: null };
    add("where", LOCATIONS.job);
  }
  if (params.where === "loose") {
    query.engagementId = null;
    query.isPermanent = { $ne: true };
    add("where", LOCATIONS.loose);
  }

  if (params.origin === "client" || params.origin === "firm") {
    query.origin = params.origin;
    add("origin", params.origin === "firm" ? "Issued by us" : "From the client");
  }
  if (params.kind) {
    query.kind = params.kind;
    add("kind", params.kind);
  }

  if (params.type && FILE_KINDS[params.type]) {
    query.mime = FILE_KINDS[params.type].test;
    add("type", FILE_KINDS[params.type].label);
  }

  if (params.by) {
    query.uploadedBy = params.by;
    add("by", "One person");
  }

  /**
   * A day in IST, not in UTC. "Added on the 23rd" means the Indian day, and
   * the end of the range is the start of the next day so the last file of
   * the evening is in it.
   */
  const from = params.from ? startOfISTDay(new Date(params.from)) : null;
  const to = params.to
    ? new Date(startOfISTDay(new Date(params.to)).getTime() + DAY)
    : null;
  if (from || to) {
    query.createdAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lt: to } : {}),
    };
    add("added", "Added between");
  }

  if (params.shared === "yes" || params.shared === "no") {
    query.sharedWithClient = params.shared === "yes";
    add("shared", params.shared === "yes" ? "Shared" : "Not shared");
  }

  if (params.versions) {
    query["versions.0"] = { $exists: true };
    add("versions", "Has earlier copies");
  }

  if (params.big) {
    query.size = { $gt: 5 * 1024 * 1024 };
    add("big", "Over 5 MB");
  }

  return { query, applied, now };
}

/**
 * The name search, as the `$or` it has to be.
 *
 * It is separate from the query above because it needs the database — the
 * clients and the jobs whose names match are looked up first, and the ids
 * come back here. Escaping is the caller's, and this is the only place that
 * decides what "matching" covers: the file's own name, the client it
 * belongs to, and the job's code.
 *
 * @param {RegExp} loose
 * @param {{ clientIds?: any[], engagementIds?: any[] }} found
 */
export function searchClause(loose, { clientIds = [], engagementIds = [] }) {
  const or = [{ name: loose }];
  if (clientIds.length) or.push({ clientId: { $in: clientIds } });
  if (engagementIds.length) or.push({ engagementId: { $in: engagementIds } });
  return or;
}

/** What the register calls a file's place, for the column and the export. */
export function locationOf(document, engagement) {
  if (document.isPermanent) return LOCATIONS.permanent;
  if (engagement) {
    return `${engagement.templateSnapshot?.name ?? "Job"} · ${
      engagement.periodLabel || engagement.period || ""
    }`;
  }
  if (document.engagementId) return "On a deleted job";
  return LOCATIONS.loose;
}
