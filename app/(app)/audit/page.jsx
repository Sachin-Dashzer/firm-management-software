import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * `/audit` is now `/portal-log` (owner decision D8).
 *
 * Kept as a redirect rather than deleted: the Security settings page linked
 * here for weeks, and anybody who has used the log has it bookmarked. The
 * filters travel with it, so a saved link to "failed sign-ins last month"
 * still lands on that view.
 *
 * It is a page rather than a middleware rule because middleware runs on the
 * edge and that bundle is already at 107 KB of Vercel's 1 MB.
 */
export default async function AuditRedirect({ searchParams }) {
  const params = new URLSearchParams(
    Object.entries((await searchParams) ?? {}).filter(([, v]) => v),
  ).toString();
  redirect(params ? `/portal-log?${params}` : "/portal-log");
}
