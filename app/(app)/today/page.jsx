import { redirect } from "next/navigation";

/**
 * `/today` is now `/my-day` (P3-22b).
 *
 * The prototype's menu calls this screen My tasks and keeps the firm
 * dashboard beside it as a second item, so the page split in two. The old
 * address stays as a redirect rather than as a second copy: a bookmark, a
 * link in an email sent before today and the sign-in tests all still land
 * somewhere right, and there is only ever one of this screen to change.
 */
export default function TodayPage() {
  redirect("/my-day");
}
