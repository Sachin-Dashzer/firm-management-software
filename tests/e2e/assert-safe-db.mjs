/**
 * The guard that stands between the browser suite and the firm's data.
 *
 * Every spec in `tests/e2e` writes directly through the models — and a third
 * of them clear up after themselves with `User.deleteOne` and
 * `Client.deleteMany`. That is correct for a throwaway database and
 * catastrophic against Atlas: `npm run test:e2e` pointed at production would
 * delete real people and real clients, and the audit log would faithfully
 * record it happening.
 *
 * For twenty-odd steps nothing stopped that. `local-db.mjs` was written to
 * start a throwaway replica set and was then imported by nothing, so the
 * suite quietly used whatever `MONGODB_URI` happened to be in `.env` — the
 * live cluster. This module is the check that makes the mistake impossible
 * rather than unlikely.
 *
 * It fails closed: an unreadable or missing URI is refused, not waved
 * through, because "I could not tell" and "it is safe" are not the same
 * answer when the cost of being wrong is the client list.
 */

/**
 * Hosts a throwaway database is allowed to live on. `mongodb-memory-server`
 * binds to a loopback address, and so does a `mongod` somebody runs by hand.
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0"]);

/**
 * The one way to run the suite against a remote database, for the acceptance
 * pass where the point is the real cluster. Spelled out in full so it cannot
 * be set by accident, and so grepping for it finds every place it is used.
 */
export const REMOTE_ESCAPE_HATCH = "i-understand-this-deletes-data";

/**
 * Pull the hostnames out of a MongoDB connection string.
 *
 * `new URL()` is not used: a `mongodb://` URI may carry several comma-separated
 * hosts, which is not a shape `URL` parses. The host list is everything
 * between the credentials and the first `/`, `?` or end of string.
 *
 * @param {string} uri
 * @returns {string[]} lower-cased hostnames, without ports
 */
export function hostsOf(uri) {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, "");
  const afterCredentials = withoutScheme.includes("@")
    ? withoutScheme.slice(withoutScheme.lastIndexOf("@") + 1)
    : withoutScheme;
  const hostPart = afterCredentials.split(/[/?]/)[0];

  return hostPart
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)
    .map((host) => {
      // [::1]:27017 -> ::1
      if (host.startsWith("[")) {
        const close = host.indexOf("]");
        return close === -1 ? host.slice(1) : host.slice(1, close);
      }
      // 127.0.0.1:27017 -> 127.0.0.1
      const colon = host.lastIndexOf(":");
      return (colon === -1 ? host : host.slice(0, colon)).toLowerCase();
    });
}

/**
 * Decide whether a URI is safe for a suite that deletes data, and say why
 * when it is not.
 *
 * Kept separate from the throwing wrapper so it can be unit-tested without
 * catching, and so the reason can be reported by `doctor`.
 *
 * @param {string|undefined|null} uri
 * @returns {{ safe: boolean, reason?: string, hosts?: string[] }}
 */
export function describeDbSafety(uri) {
  if (typeof uri !== "string" || uri.trim() === "") {
    return { safe: false, reason: "MONGODB_URI is not set" };
  }

  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
    return { safe: false, reason: "MONGODB_URI is not a MongoDB connection string" };
  }

  /*
   * `+srv` is refused on its own, before the host check. An SRV record
   * resolves to hosts this process cannot see from the string alone, so a
   * loopback-looking SRV name would pass a host test and still reach a
   * cluster. Atlas is always `+srv` in practice.
   */
  if (/^mongodb\+srv:\/\//i.test(uri)) {
    return {
      safe: false,
      reason: "MONGODB_URI uses mongodb+srv://, which resolves to a remote cluster",
    };
  }

  const hosts = hostsOf(uri);
  if (hosts.length === 0) {
    return { safe: false, reason: "no host could be read from MONGODB_URI" };
  }

  const remote = hosts.filter((host) => !LOCAL_HOSTS.has(host));
  if (remote.length > 0) {
    return {
      safe: false,
      hosts,
      reason: `MONGODB_URI points at ${remote.join(", ")}, which is not a local database`,
    };
  }

  return { safe: true, hosts };
}

/**
 * Refuse to go on unless the database is a throwaway one.
 *
 * Called from the suite's global setup and again at the top of every spec
 * helper that deletes — once centrally is enough to catch the normal case,
 * and per-spec catches a spec run directly through `npx playwright test
 * one.spec.js` with a stale environment.
 *
 * @param {string} [context] what is about to happen, for the error message
 * @returns {string} the URI, so a caller can log the host it settled on
 */
export function assertSafeDb(context = "the end-to-end suite") {
  const uri = process.env.MONGODB_URI;
  const verdict = describeDbSafety(uri);

  if (verdict.safe) return /** @type {string} */ (uri);

  if (process.env.E2E_ALLOW_REMOTE_DB === REMOTE_ESCAPE_HATCH) {
    console.warn(
      [
        "",
        "  ！ E2E_ALLOW_REMOTE_DB is set, so the safety guard has been waived.",
        `    ${verdict.reason}.`,
        "    These specs delete users and clients. If this is the firm's",
        "    database, stop now.",
        "",
      ].join("\n"),
    );
    return /** @type {string} */ (uri);
  }

  throw new Error(
    [
      "",
      "  ✖ Refusing to run " + context + " against this database.",
      "",
      `    ${verdict.reason}.`,
      "",
      "    These specs write and delete directly through the models —",
      "    users, clients, invoices. Against the firm's cluster that is",
      "    data loss, not a test run.",
      "",
      "    Run them the intended way, which starts a throwaway replica set:",
      "",
      "      npm run test:e2e",
      "",
      "    To aim at a remote database anyway, knowing it deletes data:",
      "",
      `      E2E_ALLOW_REMOTE_DB=${REMOTE_ESCAPE_HATCH}`,
      "",
    ].join("\n"),
  );
}
