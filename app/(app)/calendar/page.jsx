import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * `/calendar` moved to `/compliance` (D-E, P3-34 phase 4).
 *
 * The screen was always called Compliance on itself and Calendar in the
 * URL, which is the kind of split that survives because nobody owns both
 * halves. It is one word now, and the sub-routes that phases 5 and 6 fill
 * in hang off it.
 *
 * **The redirect keeps the query**, because the links that exist in the
 * wild carry it: the rail's three frequency links, every "see the grid"
 * link from a client page, and whatever a partner has bookmarked. A
 * redirect that drops `?service=…` sends somebody who asked about TDS to
 * a page about everything, which is worse than a 404 — they would not
 * notice.
 *
 * It stays as a permanent part of the app rather than as a migration to
 * be removed: a URL the firm has used for a month is a URL somebody has
 * emailed to somebody.
 */
export default async function CalendarRedirect({ searchParams }) {
  const params = (await searchParams) ?? {};

  const get = (key) =>
    typeof params[key] === "string" ? params[key] : undefined;

  const freq = get("freq");
  const view = get("view");

  /** Everything except the two keys the route itself now expresses. */
  const rest = new URLSearchParams(
    Object.entries(params).filter(
      ([key, value]) =>
        typeof value === "string" && key !== "freq" && key !== "view",
    ),
  );
  const tail = rest.toString() ? `?${rest}` : "";

  // the grid, at the frequency it was asked for
  if (view === "grid" || freq) {
    const known = ["monthly", "quarterly", "annual"].includes(freq)
      ? freq
      : "monthly";
    redirect(`/compliance/${known}${tail}`);
  }

  // the list of what falls due, which is the overview's third view
  if (view === "calendar") {
    rest.set("view", "next30");
    redirect(`/compliance?${rest}`);
  }

  redirect(`/compliance${tail}`);
}
