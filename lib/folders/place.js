// @ts-check

/**
 * What a file uploaded into a folder belongs to (P3-48c, brief §9.2).
 *
 * The table in the brief, in code, and in one place: the upload's two steps
 * both call it, so step two cannot record a file as something step one did
 * not authorise. Pure, so the whole table is a unit test rather than a
 * comment claiming it is right.
 *
 * **Everything comes from the node, nothing from the browser.** A folder
 * knows its own client, service, year and job — that is the point of a
 * folder carrying its context — so an upload does not have to be told, and
 * cannot be told wrongly.
 *
 * @param {object} input
 * @param {any} input.context the resolved node's context
 * @param {{ client?: any, engagement?: any }} [input.records]
 * @param {string} input.actorId
 */
export function fieldsFromContext({ context, records = {}, actorId }) {
  const zone =
    context.zone === "firm" || context.zone === "personal"
      ? context.zone
      : "client";

  return {
    zone,
    clientId: zone === "client" ? (context.clientId ?? null) : null,
    /** Only My Docs has an owner, and only its owner may read it (D-F2). */
    ownerId: zone === "personal" ? String(actorId) : null,
    folderId: context.folderId ?? null,
    serviceTemplateId:
      zone === "client" ? (context.serviceTemplateId ?? null) : null,
    engagementId: zone === "client" ? (context.engagementId ?? null) : null,
    fy: zone === "client" ? (context.fy ?? "") : "",
    isPermanent: Boolean(context.permanent),
    /**
     * The job's branch first, then the client's: a job can be run out of a
     * branch the client is not filed under, and the file belongs with the
     * work.
     */
    branchId: records.engagement?.branchId ?? records.client?.branchId ?? null,
  };
}

/**
 * Whose paper it is.
 *
 * In HQ and My Docs there is no client whose paper it could be, so it is the
 * firm's by definition. Under a client the uploader says, and anything
 * unrecognised is the client's — the same default the vault has always had.
 *
 * @param {string} zone
 * @param {string} [given] what the uploader said
 */
export function originFor(zone, given) {
  if (zone !== "client") return "firm";
  return given === "firm" ? "firm" : "client";
}
