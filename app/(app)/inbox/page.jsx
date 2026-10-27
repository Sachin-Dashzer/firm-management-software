import Link from "next/link";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import Announcement from "@/models/Announcement";
import { can } from "@/lib/permissions";
import { formatISTDate, formatISTDateTime, startOfISTDay } from "@/lib/dates";
import { INBOX_KINDS, kindOf } from "@/lib/inbox";
import { isLive, reaches } from "@/lib/firm/announcements";
import InboxList from "./InboxList";
import AnnouncementStrip from "./AnnouncementStrip";

export const metadata = { title: "Inbox · PHMG" };
export const dynamic = "force-dynamic";

/**
 * One list of everything the system has told this person (P3-17a, spec
 * section 12).
 *
 * It was `/notifications`, a flat list of the last two hundred nudges with
 * nothing to do about any of them but read it. What this adds is the two
 * things that make a list of nudges usable: **a group to filter by**, so
 * "where was I mentioned" is one click, and **snooze**, so *not now* is
 * something you can say to a row without losing it.
 *
 * There is still nothing to delete. The nudge is about something real, and
 * a list people clear is a list people clear without reading.
 */
export default async function InboxPage({ searchParams }) {
  const actor = await requireUser();
  const params = (await searchParams) ?? {};

  const kind = INBOX_KINDS.includes(params.kind) ? params.kind : "";
  const show =
    params.show === "all" || params.show === "snoozed" ? params.show : "open";

  await connectDB();
  const now = new Date();

  const [rows, announcements] = await Promise.all([
    Notification.find({ userId: actor.id })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean(),
    /**
     * What the firm has said, above the list (P3-17b). The dates narrow it
     * at the database and `isLive` decides the edges in IST, so one day's
     * difference in a timezone cannot leave something up or take it down
     * early.
     */
    Announcement.find({
      from: { $lte: new Date() },
      $or: [{ until: null }, { until: { $gte: startOfISTDay(new Date()) } }],
    })
      .sort({ from: -1 })
      .limit(20)
      .lean(),
  ]);

  const mine = announcements
    .filter((row) => isLive(row, now))
    .filter((row) =>
      reaches(row, {
        id: actor.id,
        role: actor.role,
        branchIds: actor.branchIds,
      }),
    )
    .map((row) => {
      const ack = (row.acknowledgements ?? []).find(
        (entry) => String(entry.userId) === actor.id,
      );
      return {
        id: String(row._id),
        title: row.title,
        body: row.body,
        from: formatISTDate(row.from),
        until: row.until ? formatISTDate(row.until) : "",
        needsAck: Boolean(row.needsAck),
        acked: Boolean(ack),
        ackedAt: ack ? formatISTDate(ack.at) : "",
        postedByName: row.postedByName || "a partner",
      };
    });

  const withKind = rows.map((row) => ({
    id: String(row._id),
    kind: kindOf(row.type),
    title: row.title,
    body: row.body,
    href: row.href,
    read: Boolean(row.readAt),
    at: formatISTDateTime(row.createdAt),
    snoozedUntil: row.snoozedUntil ?? null,
    snoozedLabel: row.snoozedUntil
      ? formatISTDateTime(row.snoozedUntil)
      : "",
    asleep: Boolean(
      row.snoozedUntil && new Date(row.snoozedUntil).getTime() > now.getTime(),
    ),
  }));

  /** Counts are over everything, so a filter says what it is hiding. */
  const counts = {};
  for (const row of withKind) {
    if (row.asleep && show === "open") continue;
    counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  }

  const visible = withKind
    .filter((row) =>
      show === "snoozed" ? row.asleep : show === "all" ? true : !row.asleep,
    )
    .filter((row) => (kind ? row.kind === kind : true));

  const asleep = withKind.filter((row) => row.asleep).length;

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">Inbox</h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          Mentions, work coming to you, reviews, clients and money — kept for
          sixty days, then cleared automatically. Nothing here can be deleted:
          snooze it and it comes back.
        </p>
      </div>

      <AnnouncementStrip rows={mine} />

      <InboxList
        rows={visible}
        kinds={INBOX_KINDS}
        kind={kind}
        show={show}
        counts={counts}
        asleep={asleep}
      />

      {can(actor, "approve", "feeWriteOff") && (
        <p className="text-13 text-ink-muted">
          <Link
            href="/inbox/announcements"
            className="underline underline-offset-4"
          >
            Post an announcement
          </Link>{" "}
          — and see who has read the last one.
        </p>
      )}

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
