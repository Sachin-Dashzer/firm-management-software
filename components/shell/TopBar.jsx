"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { MagnifyingGlass, Plus, Bell, UserCircle } from "@phosphor-icons/react";
import { ThemeToggle, DensityToggle, MomentsToggle } from "./Preferences";
import HelpPanel from "./HelpPanel";
import { ROLE_LABELS } from "@/lib/permissions";

/**
 * @param {object} props
 * @param {{ name: string, email: string, role: string }} props.user
 * @param {{ id: string, code: string, name: string }[]} props.branches the
 *   branches this user is assigned to, already filtered on the server
 * @param {string} props.view what they are currently looking at inside that
 *   access: "all", one branch id, or "mine" (P3-7)
 */
export default function TopBar({
  user,
  branches,
  unreadCount = 0,
  view = "all",
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  /**
   * Remember what this person is looking at, and re-read the page (P3-7).
   *
   * A cookie rather than a field on the user: it is a reading preference,
   * not a fact about the account, and it must not be something a stale
   * session can get wrong. The server validates it against the account on
   * every request anyway (`readView`), so the worst a hand-edited cookie
   * can do is show you less than you are allowed.
   */
  function chooseView(next) {
    const year = 60 * 60 * 24 * 365;
    document.cookie = `phmg-view=${encodeURIComponent(next)};path=/;max-age=${year};samesite=lax`;
    router.refresh();
  }

  return (
    /**
     * The bar takes the page's own ground, not the surface (P3-21b).
     *
     * In the prototype the rail is white, the canvas is grey and the bar is
     * the canvas colour with a rule under it — so the bar reads as the top
     * of the work rather than as a third surface floating above it.
     */
    <header className="border-rule bg-paper relative z-20 shrink-0 border-b">
      <div className="flex h-12 items-center gap-2 px-3">
        {branches.length > 1 && (
          <>
            <label className="sr-only" htmlFor="branch">
              What you are looking at
            </label>
            <select
              id="branch"
              value={view}
              onChange={(event) => chooseView(event.target.value)}
              className="rounded-control border-rule bg-paper text-13 text-ink h-8 border px-2"
            >
              <option value="all">All my branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              {/*
                The view that is not a branch at all (P3-7): the jobs you
                prepare or review, wherever the client sits. A manager
                covering a review in another branch has no other way to see
                it next to their own work.
              */}
              <option value="mine">My work across branches</option>
            </select>
          </>
        )}
        {branches.length === 1 && (
          <span className="text-13 text-ink-muted">{branches[0].name}</span>
        )}

        {/* the command bar lives at the window level; this opens it */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("phmg:command-bar"))}
          className="rounded-control border-rule bg-paper text-13 text-ink-muted hover:border-brass hover:text-ink flex h-8 min-w-0 flex-1 items-center gap-2 border px-2 md:max-w-md"
        >
          <MagnifyingGlass size={16} />
          <span className="truncate">Search clients, PAN, GSTIN…</span>
          <kbd className="text-12 ml-auto hidden font-mono sm:inline">
            Ctrl K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          {/* quick-add opens the command bar rather than a second menu of
              the same links: one list of things you can do, not two */}
          <button
            type="button"
            aria-label="Quick add — opens the command bar"
            onClick={() => window.dispatchEvent(new Event("phmg:command-bar"))}
            className="rounded-ledger text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
          >
            <Plus size={18} />
          </button>
          <Link
            href="/inbox"
            aria-label={
              unreadCount > 0 ? `Inbox, ${unreadCount} unread` : "Inbox"
            }
            className="rounded-ledger text-ink-muted hover:bg-carbon-wash hover:text-ink relative grid size-8 place-items-center"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="bg-redpen absolute top-1 right-1 size-2 rounded-full" />
            )}
          </Link>
          {/* how the firm does whatever screen you are on (P3-19) */}
          <HelpPanel />
          <MomentsToggle />
          <DensityToggle />
          <ThemeToggle />

          <div className="relative">
            <button
              type="button"
              aria-label="Your profile"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-ledger text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
            >
              <UserCircle size={20} />
            </button>
            {menuOpen && (
              <div
                className="rounded-ledger border-rule bg-surface text-14 absolute right-0 mt-1 w-56 border p-2"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <p className="px-2 pt-1 font-medium">{user.name}</p>
                <p className="text-13 text-ink-muted px-2">{user.email}</p>
                <p className="text-13 text-ink-muted px-2 pb-2">
                  {ROLE_LABELS[user.role] ?? user.role}
                </p>
                <button
                  type="button"
                  onClick={() => signOut({ redirectTo: "/login" })}
                  className="rounded-control border-rule hover:bg-carbon-wash w-full border px-2 py-1 text-left"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/*
        The ledger language's brass hairline, which is one of the eight
        signature moments and not chrome (P3-21b). The prototype's bar has a
        plain rule and nothing else, so this is off unless somebody turns
        the flourishes back on; the class is in globals.css beside the tick
        and the stamp.
      */}
      <div aria-hidden className="brass-hairline h-px" />
    </header>
  );
}
