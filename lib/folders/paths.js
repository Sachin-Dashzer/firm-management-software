// @ts-check

/**
 * The work drive's addresses (P3-48b).
 *
 * A node in the drive is a URL: `/documents/folders/clients/c-<id>/svc/
 * s-<id>/fy-2025-26/e-<id>`. Nothing here touches the database. Everything
 * here is about the *shape* of that path — which is the first line of
 * defence, because a path that cannot be parsed is refused before a single
 * record is read, and a path that parses tells the resolver exactly which
 * records to check against each other.
 *
 * The same node has two routes to it: by client, and by service. They are
 * two ways to walk to one place, not two places, so both reduce to the same
 * **anchor** — the canonical `clients/…` spelling. A folder made through one
 * route is therefore found through the other, with no second copy and no
 * reconciliation.
 */

/** A Mongo id as it appears in a URL. */
const OID = /^[0-9a-f]{24}$/i;

/** `fy-2025-26` as it appears in a URL. */
const FY_SEGMENT = /^fy-(\d{4})-(\d{2})$/;

/** The words that stand for themselves. */
const WORDS = ["my", "hq", "clients", "services", "svc", "permanent"];

/**
 * How deep a person's own folders may nest.
 *
 * Eight, which is deeper than anybody files and shallow enough that a
 * delete can walk the subtree without thinking about it.
 */
export const MAX_FOLDER_DEPTH = 8;

/** The levels that are records, not folders somebody made. */
const SYSTEM_TYPES = [
  "root",
  "my",
  "hq",
  "clients",
  "services",
  "client",
  "svc",
  "service",
  "fy",
  "engagement",
  "permanent",
];

/**
 * One segment of a path, read on its own.
 *
 * @param {string} segment
 * @returns {{ type: string, id?: string, fy?: string }|null} null if it is
 *   not a segment this app writes — which a caller turns into a 404 rather
 *   than guessing at.
 */
export function parseSegment(segment) {
  const value = String(segment ?? "");
  if (WORDS.includes(value)) return { type: value };

  // before the `f-` rule, or `fy-2025-26` would parse as folder "y-2025-26"
  const fy = FY_SEGMENT.exec(value);
  if (fy) return { type: "fy", fy: `FY${fy[1]}-${fy[2]}` };

  const prefixed = /^([csef])-(.+)$/.exec(value);
  if (!prefixed) return null;
  const [, prefix, id] = prefixed;
  if (!OID.test(id)) return null;

  const type = { c: "client", s: "service", e: "engagement", f: "folder" }[
    prefix
  ];
  return type ? { type, id: id.toLowerCase() } : null;
}

/** `FY2025-26` → `fy-2025-26`, the segment for it. */
export function fySegment(fy) {
  const match = /^FY(\d{4})-(\d{2})$/.exec(String(fy ?? ""));
  return match ? `fy-${match[1]}-${match[2]}` : "";
}

/** `FY2025-26` → `FY 2025-26`, how a person reads it. */
export function fyLabel(fy) {
  const match = /^FY(\d{4})-(\d{2})$/.exec(String(fy ?? ""));
  return match ? `FY ${match[1]}-${match[2]}` : String(fy ?? "");
}

/** Is this level a record rather than a folder somebody made? */
export function isSystem(type) {
  return SYSTEM_TYPES.includes(String(type));
}

/**
 * May folders be made at this level?
 *
 * No at the levels that *are* the records — Clients, Services, a client's
 * Services node, one service, and the permanent file. A folder there would
 * be a hand-made thing sitting among records that come from the database,
 * and the first question anybody asked of it would be why the firm has two
 * kinds of "GST Notice". Add a client or a job instead.
 */
export function canHoldFolders(type) {
  return ["root", "my", "hq", "client", "fy", "engagement", "folder"].includes(
    String(type),
  );
}

/**
 * The whole path, read as a walk down the tree.
 *
 * Written out as a walk rather than as a table of allowed children, because
 * the two routes spell the middle differently — `clients/c-/svc/s-/fy-` and
 * `services/s-/c-/fy-` — and a table that has to know which route it is in
 * is a walk with the steps hidden.
 *
 * @param {string[]} [segments]
 * @returns {{
 *   route: string,
 *   nodes: Array<{ type: string, id?: string, fy?: string }>,
 *   node: { type: string, id?: string, fy?: string },
 *   context: {
 *     zone: "client"|"firm"|"personal",
 *     clientId: string|null,
 *     serviceTemplateId: string|null,
 *     fy: string,
 *     engagementId: string|null,
 *     folderId: string|null,
 *     permanent: boolean,
 *   },
 *   folderIds: string[],
 * }|null} null when the path is not one this app writes.
 */
export function parsePath(segments) {
  const raw = (segments ?? []).map(String).filter((s) => s.length > 0);
  const parsed = raw.map(parseSegment);
  if (parsed.some((segment) => segment === null)) return null;

  /** @type {Array<{type: string, id?: string, fy?: string}>} */
  const nodes = [{ type: "root" }];
  const context = {
    /**
     * Which of the drive's own roots this path started at. Home and HQ are
     * both the firm's, and are different levels, so the zone alone cannot
     * tell them apart.
     */
    route: "root",
    /** @type {"client"|"firm"|"personal"} */
    zone: "firm",
    /** @type {string|null} */
    clientId: null,
    /** @type {string|null} */
    serviceTemplateId: null,
    fy: "",
    /** @type {string|null} */
    engagementId: null,
    /** @type {string|null} */
    folderId: null,
    permanent: false,
  };
  /** @type {string[]} */
  const folderIds = [];

  let route = "root";
  let index = 0;

  const first = parsed[0];
  if (first) {
    if (first.type === "my") {
      route = "my";
      context.zone = "personal";
      nodes.push(first);
      index = 1;
    } else if (first.type === "hq") {
      route = "hq";
      nodes.push(first);
      index = 1;
    } else if (first.type === "clients" || first.type === "services") {
      route = first.type;
      context.zone = "client";
      nodes.push(first);
      index = 1;
    } else if (first.type !== "folder") {
      // a client, a service or a year straight off Home: not an address
      return null;
    }
  }

  /** Read one expected segment, or fail the whole path. */
  const take = (type) => {
    const segment = parsed[index];
    if (!segment || segment.type !== type) return null;
    nodes.push(segment);
    index += 1;
    return segment;
  };

  if (route === "clients" && index < parsed.length) {
    const client = take("client");
    if (!client) return null;
    context.clientId = client.id ?? null;

    if (parsed[index]?.type === "permanent") {
      take("permanent");
      context.permanent = true;
    } else if (parsed[index]?.type === "svc") {
      take("svc");
      if (index < parsed.length) {
        const service = take("service");
        if (!service) return null;
        context.serviceTemplateId = service.id ?? null;
        if (index < parsed.length) {
          const year = take("fy");
          if (!year) return null;
          context.fy = year.fy ?? "";
          if (parsed[index]?.type === "engagement") {
            const job = take("engagement");
            context.engagementId = job?.id ?? null;
          }
        }
      }
    }
  }

  if (route === "services" && index < parsed.length) {
    const service = take("service");
    if (!service) return null;
    context.serviceTemplateId = service.id ?? null;

    if (index < parsed.length) {
      const client = take("client");
      if (!client) return null;
      context.clientId = client.id ?? null;

      if (index < parsed.length) {
        const year = take("fy");
        if (!year) return null;
        context.fy = year.fy ?? "";
        if (parsed[index]?.type === "engagement") {
          const job = take("engagement");
          context.engagementId = job?.id ?? null;
        }
      }
    }
  }

  // whatever is left must be a chain of folders, and nothing else
  while (index < parsed.length) {
    const folder = take("folder");
    if (!folder) return null;
    folderIds.push(String(folder.id));
  }
  context.folderId = folderIds.length ? folderIds[folderIds.length - 1] : null;

  if (folderIds.length > MAX_FOLDER_DEPTH) return null;
  context.route = route === "services" ? "clients" : route;

  const node = nodes[nodes.length - 1];
  // folders may not hang off a level that holds only records
  if (folderIds.length) {
    const parentType = nodes[nodes.length - folderIds.length - 1]?.type;
    if (!canHoldFolders(parentType)) return null;
  }

  return { route, nodes, node, context, folderIds };
}

/**
 * The canonical system path a folder hangs under, stored on the folder row.
 *
 * It is always the `clients/…` spelling, never the `services/…` alias, so a
 * folder made while browsing by service is found while browsing by client.
 * The folder chain itself is **not** part of the anchor: a child folder's
 * position is its `parentId`.
 *
 * @param {{ zone?: string, clientId?: any, serviceTemplateId?: any, fy?: string, engagementId?: any, permanent?: boolean }} context
 * @returns {string}
 */
export function anchorFor(context = {}) {
  if (context.zone === "personal") return "my";
  if (!context.clientId) {
    if (context.route === "root") return "home";
    if (context.route === "hq") return "hq";
    return context.zone === "firm" ? "hq" : "home";
  }

  const parts = ["clients", `c-${String(context.clientId)}`];
  if (context.permanent) return [...parts, "permanent"].join("/");
  if (!context.serviceTemplateId) return parts.join("/");

  parts.push("svc", `s-${String(context.serviceTemplateId)}`);
  if (!context.fy) return parts.join("/");

  parts.push(fySegment(context.fy));
  if (context.engagementId) parts.push(`e-${String(context.engagementId)}`);
  return parts.join("/");
}

/**
 * Where a node lives in the browser, by its canonical route.
 *
 * `Home` is the drive's own root, so the URL of the root is the route with
 * nothing after it.
 *
 * @param {{ zone?: string, clientId?: any, serviceTemplateId?: any, fy?: string, engagementId?: any, permanent?: boolean, folderIds?: string[] }} context
 * @returns {string}
 */
export function urlFor(context = {}) {
  const anchor = anchorFor(context);
  const folders = (context.folderIds ?? []).map((id) => `f-${String(id)}`);
  const parts = [
    ...(anchor === "home" ? [] : anchor.split("/")),
    ...folders,
  ].filter(Boolean);
  return ["/documents/folders", ...parts].join("/");
}

/** The anchor as its segments, for walking back up a path. */
export function anchorSegments(anchor) {
  return String(anchor ?? "")
    .split("/")
    .filter((part) => part && part !== "home");
}
