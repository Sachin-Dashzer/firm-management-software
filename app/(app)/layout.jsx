import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Branch from "@/models/Branch";
import Notification from "@/models/Notification";
import LeftRail from "@/components/shell/LeftRail";
import TopBar from "@/components/shell/TopBar";
import CommandBar from "@/components/shell/CommandBar";
import { AREAS, can, ROLE_LABELS } from "@/lib/permissions";
import { menuFor } from "@/lib/nav/tree";
import { navCounts } from "@/lib/nav/counts";
import { firmModules, firmName, firmWords } from "@/lib/firm/settings";

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
  const [branches, unreadCount, counts, modules, name, words] =
    await Promise.all([
      Branch.find(
        user.role === "partner" ? {} : { _id: { $in: user.branchIds } },
      )
        .sort({ code: 1 })
        .lean(),
      Notification.countDocuments({ userId: user.id, readAt: null }),
      /**
       * Every badge on the menu, in one call (P3-22a). Each number comes from
       * the same helper its page uses, so a badge cannot disagree with the
       * rows the click shows — which is the only reason to have badges at all.
       */
      navCounts(user),
      firmModules(),
      firmName(),
      /* the firm’s own words for the menu (P3-29); empty unless set */
      firmWords(),
    ]);

  const menu = menuFor(user, modules, words);

  // what this person may even be offered in the command bar; the server
  // checks again when they get there
  const allowed = AREAS.filter((area) => can(user, "view", area));

  /**
   * What the `+ New` button offers (P3-34 phase 2).
   *
   * Decided here and not in the browser, and decided with `"edit"` rather
   * than `"view"`: being allowed to read the client list is not being
   * allowed to add a client. A to-do needs nothing — everybody keeps their
   * own. Each route checks again on arrival; this only keeps the menu from
   * offering a form somebody will be turned away from.
   */
  const canCreate = [
    { label: "New client", href: "/clients/new", area: "clients" },
    { label: "New job", href: "/engagements/new", area: "engagementsCreate" },
    { label: "New invoice", href: "/invoices/new", area: "invoices" },
    { label: "Log a notice", href: "/practice/notices/new", area: "practice" },
    { label: "Record a payment", href: "/billing/desk", area: "invoices" },
    { label: "New to-do", href: "/todos", area: null },
  ]
    .filter((item) => !item.area || can(user, "edit", item.area))
    .map(({ label, href }) => ({ label, href }));

  /** The one branch a person is in, for the line under their name. */
  const branchLabel =
    branches.length === 1 ? branches[0].name : `${branches.length} branches`;

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
        <LeftRail
          menu={menu}
          counts={counts}
          userName={user.name}
          roleLabel={ROLE_LABELS[user.role] ?? user.role}
          branchLabel={branchLabel}
          firmName={name}
        />
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
            canCreate={canCreate}
          />
          {/**
           * One canvas, set once (D80).
           *
           * Sixty pages each named their own width — 760, 860, 900, 1000,
           * 1100, 1200, 1400 and 1600 — so the application changed shape
           * from screen to screen, and on a 1920px monitor the widest of
           * them stretched a row of filters to 1550px with a name at one
           * end and its figure at the other. That was the worst-looking
           * view in the product.
           *
           * Capping here rather than editing sixty files means a page can
           * still be *narrower* than the canvas — a settings form at 760
           * is right — but none can be wider.
           *
           * **1440 since D104** (the owner's call, 30-10-2026), up from
           * 1280. The measured range for a data screen is 1100-1250 and
           * 1280 sat inside it; what changed is that the registers the
           * firm works in are now two columns — the notice list beside
           * its diary, the issues table with four columns and an action —
           * and at 1280 the rail was taking width from the table rather
           * than from the window. The reference the owner gave is 1440.
           */}
          <main
            id="content"
            className="relative z-10 min-h-0 w-full max-w-[1440px] flex-1 self-center overflow-auto"
          >
            {children}
          </main>
        </div>
      </div>
      {/* the rail is the phone menu now, opened as a drawer (P3-22a) */}
      <CommandBar allowed={allowed} menu={menu} />
    </div>
  );
}
