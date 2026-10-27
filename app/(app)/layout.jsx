import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Branch from "@/models/Branch";
import Notification from "@/models/Notification";
import LeftRail, { MobileNav } from "@/components/shell/LeftRail";
import TopBar from "@/components/shell/TopBar";
import CommandBar from "@/components/shell/CommandBar";
import { AREAS, can } from "@/lib/permissions";
import { issueRows, isMine } from "@/lib/issues/list";

/**
 * Every page in here depends on who is signed in, so none of them may be
 * prerendered at build time — a prerender would bake in the signed-out
 * redirect and send signed-in users to the login page.
 */
export const dynamic = "force-dynamic";

/**
 * Everything inside this layout needs a session. Middleware already turns away
 * requests without a session cookie; this second check covers a cookie that is
 * present but no longer valid, and gives the pages below a real user.
 */
export default async function AppLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  /**
   * A one-time password is not a password. Somebody whose account was created,
   * reset or imported by a partner gets no further into the app until they
   * have set one only they know (spec section 16).
   *
   * The screen for it sits outside this layout, so there is nothing here to
   * loop against: one unconditional redirect, and the flag is cleared inside
   * the same audit transaction as the new hash.
   */
  if (user.mustChangePassword) redirect("/change-password");

  await connectDB();
  // a user only ever sees their own branches in the switcher (spec section 2)
  const [branches, unreadCount, issues] = await Promise.all([
    Branch.find(user.role === "partner" ? {} : { _id: { $in: user.branchIds } })
      .sort({ code: 1 })
      .lean(),
    Notification.countDocuments({ userId: user.id, readAt: null }),
    /**
     * The count beside Issues on the rail (P3-6). It is this person's own
     * count, not the firm's: a number that does not match what the page
     * opens on is a number nobody trusts twice.
     *
     * ponytail: recomputed on every page view — seven bounded queries for a
     * five-person firm. If it ever shows up in the Atlas slow log, cache it
     * per user for a minute rather than storing a count that can go stale.
     */
    issueRows(user).then(
      (rows) => rows.filter((row) => isMine(row, user)).length,
    ),
  ]);

  // what this person may even be offered in the command bar; the server
  // checks again when they get there
  const allowed = AREAS.filter((area) => can(user, "view", area));

  return (
    <div className="flex h-dvh flex-col">
      {/* first thing in the tab order: past the rail and straight to work */}
      <a
        href="#content"
        className="focus:bg-surface focus:border-brass focus:text-ink rounded-ledger text-14 sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:border focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <div className="flex min-h-0 flex-1">
        <LeftRail role={user.role} issueCount={issues} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            user={{ name: user.name, email: user.email, role: user.role }}
            branches={branches.map((b) => ({
              id: String(b._id),
              code: b.code,
              name: b.name,
            }))}
            unreadCount={unreadCount}
            view={user.view}
          />
          <main
            id="content"
            className="relative z-10 min-h-0 flex-1 overflow-auto"
          >
            {children}
          </main>
        </div>
      </div>
      <MobileNav role={user.role} />
      <CommandBar allowed={allowed} />
    </div>
  );
}
