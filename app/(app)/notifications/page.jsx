import Link from "next/link";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import { formatISTDateTime } from "@/lib/dates";
import NotificationList from "./NotificationList";

export const metadata = { title: "Notifications · PHMG" };
export const dynamic = "force-dynamic";

/** Everything the system has told this person (spec section 12). */
export default async function NotificationsPage() {
  const actor = await requireUser();

  await connectDB();
  const rows = await Notification.find({ userId: actor.id })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-28 font-semibold">Notifications</h1>
        <p className="text-13 text-ink-muted">
          Kept for sixty days, then cleared automatically.
        </p>
      </div>

      <NotificationList
        rows={rows.map((row) => ({
          id: String(row._id),
          title: row.title,
          body: row.body,
          href: row.href,
          read: Boolean(row.readAt),
          at: formatISTDateTime(row.createdAt),
        }))}
      />

      <p className="text-13 text-ink-muted">
        Emails for these go out through the mail queue. What was sent, and what
        was held back, is on{" "}
        <Link
          href="/settings/messages"
          className="underline underline-offset-4"
        >
          Settings → Messages
        </Link>
        .
      </p>
    </div>
  );
}
