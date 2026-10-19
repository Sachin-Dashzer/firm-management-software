import { timingSafeEqual } from "node:crypto";
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

function authorised(request) {
  const expected = process.env.JOBS_SECRET;
  if (!expected || expected.length < 24) return false;

  const header = request.headers.get("x-jobs-secret") ?? "";
  const given = Buffer.from(header);
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function handle(request) {
  if (!authorised(request)) {
    // the same answer whether the secret is wrong or not configured
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
