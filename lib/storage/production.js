// @ts-check

/**
 * Whether this deployment is allowed to store a document where it is
 * pointing.
 *
 * **Kept in its own file, and it imports nothing.** `instrumentation.js` is
 * the only place that can refuse a server at boot, and Next bundles that
 * file into the edge runtime as well as Node. The edge bundler cannot read
 * `node:` schemes and cannot split code, so importing this from
 * `lib/storage/index.js` — which reaches `node:crypto` through the ticket
 * signer — failed the build outright, guard or no guard. Three lines of
 * `process.env` do not need any of that.
 *
 * Read by `instrumentation.js` at boot and by `scripts/doctor.js`, so the
 * running app and the go-live check cannot disagree about what is safe.
 */

/**
 * Is this the real deployment, rather than a preview, a laptop or a test?
 *
 * **`NODE_ENV=production` is not enough on its own, and finding that out
 * cost a red test run.** The browser suite serves the app with
 * `next start`, which sets `NODE_ENV=production` on a developer's machine —
 * so the storage guard below refused to boot the server under test, which
 * legitimately uses the local driver. The guard was right about the
 * variable and wrong about what it means.
 *
 * The fallback is kept, because a self-hosted deployment has nothing else
 * to offer: there `NODE_ENV=production` genuinely is the signal. So the
 * test environment says so explicitly instead, with `PHMG_ENV=test` in
 * `.env.test`. That cannot be set by accident, and `scripts/doctor.js`
 * fails if it is ever set on a real deployment, so the escape hatch cannot
 * hide in production the way `AUTH_SKIP_2FA` did.
 *
 * Takes the environment as an argument so `scripts/doctor.js` can judge a
 * hypothetical one in a unit test rather than mutating `process.env`.
 *
 * @param {Record<string, string|undefined>} [env]
 */
export function inProduction(env = process.env) {
  if (env.PHMG_ENV === "test") return false;

  return (
    env.VERCEL_ENV === "production" ||
    (!env.VERCEL_ENV && env.NODE_ENV === "production")
  );
}

/**
 * Why the local driver must never be the production one.
 *
 * It writes to the server's own disk. On Vercel that disk belongs to the
 * deployment: it is not shared between the lambdas serving different
 * requests, and it is discarded on the next deploy. So uploads would appear
 * to work, downloads would fail for anybody served by another instance, and
 * every document would vanish at the next push — silently, because nothing
 * in the app treats a missing file as an error worth shouting about.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkProductionStorage(env = process.env) {
  if (!inProduction(env)) return { ok: true };

  const driver =
    env.STORAGE_DRIVER || (env.STORAGE_GATEWAY_URL ? "bigrock" : "local");

  if (driver === "local") {
    return {
      ok: false,
      reason:
        "STORAGE_DRIVER is 'local' in production. The local driver writes to the server's own disk, which Vercel discards on every deploy — every uploaded document would be lost without an error. Set STORAGE_DRIVER=bigrock and STORAGE_GATEWAY_URL, then redeploy (docs/GATEWAY_DEPLOY.md §6).",
    };
  }

  if (!env.STORAGE_GATEWAY_URL) {
    return {
      ok: false,
      reason:
        "STORAGE_GATEWAY_URL is not set, so there is nowhere to store a document (docs/GATEWAY_DEPLOY.md §6).",
    };
  }

  return { ok: true };
}
