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
import PageHead from "@/components/ui/PageHead";
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

  /**
   * One line about the notices, not about the feature. What a partner
   * opens this screen to find out is how many are up and who still owes an
   * answer, so that is what the line says; the explanation of what an
   * acknowledgement does belongs on the control that asks for one.
   */
  const live = view.filter((row) => row.live);
  const owed = live.reduce((sum, row) => sum + row.pending.length, 0);
  const sub = [
    live.length === 1 ? "1 notice up" : `${live.length} notices up`,
    owed > 0
      ? `waiting on ${owed} ${owed === 1 ? "person" : "people"}`
      : "nobody is owed an answer",
  ].join(" · ");

  return (
    /*
     * Deliberately not `Screen`. That one makes the page exactly the
     * height of the canvas so a long list scrolls inside its own region,
     * which is right for the inbox and wrong here: the boards are flex
     * children with nothing to scroll, so a fixed height squashes them
     * rather than scrolling them. This is the same band and the same
     * rhythm — `PageHead`, one gutter, one gap — on a page that scrolls
     * as one.
     */
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 p-4 md:p-6">
      <PageHead title="Announcements" sub={sub}>
        <Link
          href="/inbox"
          className="text-13 text-ink-muted hover:text-carbon px-1"
        >
          Back to the inbox
        </Link>
      </PageHead>

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
