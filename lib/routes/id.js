// @ts-check

import mongoose from "mongoose";

/**
 * Is this string shaped like a MongoDB id at all? (QA 09-11-2026, #7)
 *
 * `/engagements/abc` used to answer 500. Mongoose throws a `CastError` when
 * asked to turn "abc" into an ObjectId, the throw reached the error
 * boundary, and the page that came back said "Only plain objects can be
 * passed to Client Components" — a developer's sentence, on a screen a
 * client could reach by mistyping a URL.
 *
 * A URL is untrusted input, so every route that takes an id from one asks
 * this before it queries, and answers the app's own not-found page instead.
 * Deliberately *not* done by loosening Mongoose's caster globally: that
 * would turn a bad id in a **write** from a loud error into a quietly
 * wrong document.
 *
 * It asks Mongoose rather than matching a regular expression here, so this
 * can never grow stricter or looser than the caster it is standing in
 * front of. In the version this app uses that means twenty-four hex
 * characters and nothing else. An id of the right shape that belongs to
 * nothing still lands on the not-found page, one step later, from the
 * `if (!doc) notFound()` each route already has.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isId(value) {
  return mongoose.Types.ObjectId.isValid(String(value ?? ""));
}

/** The 404 a route handler answers with, so every one of them matches. */
export function notFoundResponse() {
  return new Response("Not found", { status: 404 });
}
