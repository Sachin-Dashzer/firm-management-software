// @ts-check

/**
 * One answer to "is this the firm's real deployment?"
 *
 * **It imports nothing, on purpose.** `instrumentation.js` reads it, and
 * Next bundles that file into the edge runtime as well as Node; the edge
 * bundler cannot resolve `node:` schemes and cannot split code, so anything
 * this module reached would have to be edge-safe too. Three lines of
 * `process.env` do not need that.
 *
 * **Only `VERCEL_ENV=production` counts, and `NODE_ENV` deliberately does
 * not.** This lived in two places and said two different things, which is
 * how the storage guard and the two-factor guard came to disagree about
 * whether `npm start` on a laptop was the firm's deployment. The storage
 * one said yes and refused to boot: both the browser suite's own server and
 * `npm start` set `NODE_ENV=production`, because that is what a production
 * *build* is, and neither is a production *deployment*.
 *
 * App hosting is Vercel, fixed in CLAUDE.md, so `VERCEL_ENV` is the honest
 * signal and the only one that cannot be true on a developer's machine. If
 * the firm ever self-hosts, this needs a deployment marker of its own —
 * `scripts/doctor.js` warns about that case rather than leaving it unsaid.
 *
 * Takes the environment as an argument so a test can judge a hypothetical
 * one instead of mutating `process.env`.
 *
 * @param {Record<string, string|undefined>} [env]
 */
export function inProduction(env = process.env) {
  return env.VERCEL_ENV === "production";
}
