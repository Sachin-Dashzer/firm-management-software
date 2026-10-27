import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, ROLES, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Announcement from "@/models/Announcement";
import Branch from "@/models/Branch";
import User from "@/models/User";
import { formatISTDate } from "@/lib/dates";
import {
  AUDIENCES,
  AUDIENCE_LABELS,
  isLive,
  pending,
} from "@/lib/firm/announcements";
import AnnouncementDesk from "./AnnouncementDesk";

export const metadata = { title: "Announcements · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Posting an announcement, and seeing who has read it (P3-17b).
 *
 * A partner's screen. Everybody else meets announcements in their inbox,
 * which is where they already look — a second place to check is a place
 * nobody checks.
 */
export default async function AnnouncementsPage() {
  const actor = await requireUser();
  if (!can(actor, "approve", "feeWriteOff")) redirect("/inbox");

  await connectDB();
  const [rows, branches, people] = await Promise.all([
    Announcement.find({}).sort({ from: -1 }).limit(100).lean(),
    Branch.find({}).select("code name").sort({ code: 1 }).lean(),
    User.find({ active: true }).select("name role branchIds").lean(),
  ]);

  const branchName = new Map(
    branches.map((row) => [String(row._id), `${row.name} (${row.code})`]),
  );

  const view = rows.map((row) => {
    const owed = pending(row, people);
    return {
      id: String(row._id),
      title: row.title,
      body: row.body,
      audience: row.audience,
      audienceLabel:
        row.audience === "branch"
          ? (branchName.get(String(row.branchId)) ?? "An office")
          : row.audience === "role"
            ? (ROLE_LABELS[row.role] ?? row.role)
            : AUDIENCE_LABELS.everyone,
      from: formatISTDate(row.from),
      until: row.until ? formatISTDate(row.until) : "",
      live: isLive(row),
      needsAck: Boolean(row.needsAck),
      acked: (row.acknowledgements ?? []).map((ack) => ({
        name: ack.name,
        at: formatISTDate(ack.at),
      })),
      /** Names, not a number: a partner asks a person, not a percentage. */
      pending: owed.map((person) => person.name),
      postedByName: row.postedByName,
    };
  });

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link href="/inbox" className="text-13 underline underline-offset-4">
          Inbox
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Announcements
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          One thing said once, to everybody, one office or one role. Asking
          people to say they have read it never stops them working — it only
          tells you who has not.
        </p>
      </div>

      <AnnouncementDesk
        rows={view}
        audiences={AUDIENCES.map((key) => ({
          key,
          label: AUDIENCE_LABELS[key],
        }))}
        branches={branches.map((row) => ({
          id: String(row._id),
          label: `${row.name} (${row.code})`,
        }))}
        roles={ROLES.map((role) => ({ role, label: ROLE_LABELS[role] }))}
      />
    </div>
  );
}
