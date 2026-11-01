import { createHash, timingSafeEqual } from "node:crypto";
import { runOnce } from "@/lib/jobs/run";

/**
 * The job runner, started over HTTP (spec section 14).
 *
 * This is the fallback for a BigRock plan with no Node.js support: cron
 * calls this with a secret header every five minutes and the same runner
 * does the same work. It is also how the owner can force a run from a
 * terminal while setting things up.
 *
 * The secret is the only guard, so it is compared in constant time and the
 * route says nothing useful when it is wrong. Without `JOBS_SECRET` set,
 * the route refuses outright rather than running unguarded.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The shortest secret worth calling one. */
const MIN_SECRET = 24;

/**
 * Constant-time string compare that does not leak length through timing
 * either side of the digest.
 *
 * `timingSafeEqual` throws on a length mismatch, so comparing the raw
 * strings would answer "wrong length" instantly and "wrong value" slowly.
 * Hashing both to a fixed 32 bytes first removes that difference.
 *
 * @param {string} given
 * @param {string} expected
 */
function secretMatches(given, expected) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Is this request allowed to start a run?
 *
 * Two ways in, because the firm's hosting is not decided yet (DEPLOY.md §2):
 *
 *  - `x-jobs-secret: <JOBS_SECRET>` — what cPanel cron sends via `curl`.
 *  - `Authorization: Bearer <JOBS_SECRET>` — what Vercel Cron sends. Vercel
 *    signs its own scheduled calls with `CRON_SECRET`, so that is accepted
 *    too when it is set, and the firm can use either name.
 *
 * @param {Request} request
 * @returns {{ ok: true } | { ok: false, misconfigured: boolean }}
 */
function authorised(request) {
  const expected = process.env.JOBS_SECRET;

  /*
   * No usable secret is a deployment fault, not a bad caller, and the two
   * are reported differently below: a silent 404 here is how a cron job
   * can "work" for weeks while never running anything.
   */
  if (!expected || expected.length < MIN_SECRET) {
    return { ok: false, misconfigured: true };
  }

  const accepted = [expected];
  if (process.env.CRON_SECRET) accepted.push(process.env.CRON_SECRET);

  const header = request.headers.get("x-jobs-secret") ?? "";
  const bearer = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );

  for (const candidate of [header, bearer]) {
    if (!candidate) continue;
    if (accepted.some((secret) => secretMatches(candidate, secret))) {
      return { ok: true };
    }
  }

  return { ok: false, misconfigured: false };
}

async function handle(request) {
  const allowed = authorised(request);

  if (!allowed.ok) {
    if (allowed.misconfigured) {
      /*
       * Fails closed and says so. Nothing runs unauthenticated — but a 404
       * would make a missing secret look like a missing route, which is
       * exactly the confusion that left 88 jobs queued and never run.
       */
      console.error(
        "job runner refused: JOBS_SECRET is unset or shorter than " +
          `${MIN_SECRET} characters, so no scheduled work can start. Set it in the deployment's environment.`,
      );
      return Response.json(
        { error: "The job runner is not configured on this deployment." },
        { status: 500 },
      );
    }
    // a wrong secret learns nothing about whether the route exists
    return new Response("Not found", { status: 404 });
  }

  try {
    const summary = await runOnce();
    return Response.json(summary);
  } catch (err) {
    console.error("job runner failed:", err);
    return Response.json({ error: String(err.message) }, { status: 500 });
  }
}

export async function POST(request) {
  return handle(request);
}

/**
 * cPanel's cron usually calls a URL with `curl`, which is a GET unless told
 * otherwise, so both verbs are accepted.
 */
export async function GET(request) {
  return handle(request);
}
