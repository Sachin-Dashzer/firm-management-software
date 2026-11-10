import Link from "next/link";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import Announcement from "@/models/Announcement";
import { can } from "@/lib/permissions";
import { formatISTDate, formatISTDateTime, startOfISTDay } from "@/lib/dates";
import { INBOX_KINDS, kindOf } from "@/lib/inbox";
import { isLive, reaches } from "@/lib/firm/announcements";
import PageHead from "@/components/ui/PageHead";
import Screen from "@/components/ui/Screen";
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
  /**
   * `unread` joined the three in D104, because it is the one cut of this
   * list anybody asks for by name and it was only ever available as a
   * count in the corner that could not be clicked.
   */
  const show = ["all", "snoozed", "unread"].includes(params.show)
    ? params.show
    : "open";

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
    snoozedLabel: row.snoozedUntil ? formatISTDateTime(row.snoozedUntil) : "",
    asleep: Boolean(
      row.snoozedUntil && new Date(row.snoozedUntil).getTime() > now.getTime(),
    ),
  }));

  /**
   * What this `show` admits, before the group filter. The chips and the
   * tiles are both counted off it, so a chip says how many it would show
   * rather than how many exist somewhere behind another filter.
   */
  const shown = withKind.filter((row) =>
    show === "snoozed"
      ? row.asleep
      : show === "all"
        ? true
        : show === "unread"
          ? !row.asleep && !row.read
          : !row.asleep,
  );

  const counts = {};
  for (const row of shown) counts[row.kind] = (counts[row.kind] ?? 0) + 1;

  const visible = shown.filter((row) => (kind ? row.kind === kind : true));

  const asleep = withKind.filter((row) => row.asleep).length;
  const unread = withKind.filter((row) => !row.asleep && !row.read).length;

  /**
   * One line about what is in the list, not about how to use it. An app
   * screen's second line says the finding — how much is waiting and how
   * long it keeps — and never explains the filters underneath it.
   */
  const sub = [
    unread > 0 ? `${unread} unread of ${shown.length}` : `${shown.length} open`,
    asleep > 0 ? `${asleep} snoozed` : "",
    "kept for sixty days",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Screen>
      <PageHead title="Inbox" sub={sub}>
        {can(actor, "approve", "feeWriteOff") && (
          <Link
            href="/inbox/announcements"
            className="rounded-control border-rule bg-paper text-13 hover:border-carbon h-8 border px-3 leading-8 font-medium"
          >
            Post an announcement
          </Link>
        )}
        <Link
          href="/settings/messages"
          className="text-13 text-ink-muted hover:text-carbon px-1"
        >
          What was emailed
        </Link>
      </PageHead>

      {/*
        The four stat tiles that stood here until 10-11-2026 are gone, and
        with them the screen's worst habit: they were a second filter row
        over the first. Unread, Mentions, Review and Snoozed each named a
        chip sitting directly underneath, so the same cut of the same list
        had two controls, two counts to keep in step and 110px of the
        canvas on a laptop — 175 on a phone, which pushed the first message
        below the fold. Unread and Snoozed are chips now, beside the groups
        they belong with; Mentions and Review always were.
      */}
      <AnnouncementStrip rows={mine} />

      <InboxList
        rows={visible}
        kinds={INBOX_KINDS}
        kind={kind}
        show={show}
        counts={counts}
        asleep={asleep}
        unread={unread}
      />
    </Screen>
  );
}
