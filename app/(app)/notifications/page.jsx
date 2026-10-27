import { redirect } from "next/navigation";

/**
 * The inbox was `/notifications` until P3-17a. The URL is in sixty days of
 * notification emails and in people's history, so it stays and points at
 * the new screen.
 */
export default function NotificationsPage() {
  redirect("/inbox");
}
