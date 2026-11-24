// @ts-check

/**
 * The three places a file can live (P3-48).
 *
 *  - **client** — a client's paper. Everything the vault held before this
 *    step, and everything under Clients or Services in the drive.
 *  - **firm** — the firm's own, about no client: office policies, ICAI
 *    circulars. `clientId` is null.
 *  - **personal** — one person's own working copies, private to them
 *    (decision D-F2). `ownerId` is the user, `clientId` is null.
 *
 * A zone is not a folder. It decides *who* may see a file at all, which is
 * why the filters below exist as one shared pair rather than as a word
 * copied into a dozen queries: the one query that forgets it is the one that
 * shows a client their accountant's private notes.
 */

/** @type {const} */
export const ZONES = ["client", "firm", "personal"];

/**
 * Files that belong to a client, for every query a client's own name is on:
 * their profile, their counts, their export, their portal.
 *
 * **It names the two zones to exclude rather than the one to include**, on
 * purpose. Every file uploaded before this step has no `zone` field at all —
 * a Mongoose default is written on save, not applied to rows already in
 * Atlas — and `{ zone: "client" }` does not match a missing field, so it
 * would empty every client's Documents tab and every portal until a
 * migration had run over the whole vault. `$nin` matches a missing field, so
 * there is nothing to migrate and nothing to get wrong: a row is a client's
 * unless it says otherwise.
 */
export const CLIENT_FILES = { zone: { $nin: ["firm", "personal"] } };

/**
 * What one person may see in a list that crosses the zones — the recycle
 * bin, where a partner reads everything the firm deleted.
 *
 * Their own personal files, and nobody else's: a partner restoring a deleted
 * invoice draft has no business reading the private notes of the person who
 * deleted them (D-F2). `$ne` matches a missing field, so the old rows are
 * client files, as they are.
 *
 * @param {string} userId
 */
export function visibleZones(userId) {
  return {
    $or: [{ zone: { $ne: "personal" } }, { ownerId: String(userId) }],
  };
}
