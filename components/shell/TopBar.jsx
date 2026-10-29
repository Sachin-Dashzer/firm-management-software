"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  MagnifyingGlass,
  Plus,
  Bell,
  UserCircle,
  List,
} from "@phosphor-icons/react";
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
  const menuRef = useRef(null);
  const router = useRouter();

  /** A menu that only closes on mouse-leave is a menu a keyboard cannot shut. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event) => event.key === "Escape" && setMenuOpen(false);
    const onDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

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
     *
     * What it carries is three things and no more: **where you are looking**
     * (the branch), **what you are looking for** (search), and **you**. The
     * theme, the density and the ledger flourishes moved into the profile
     * menu below — they are settled once and then never touched again, and
     * as seven equal-weight icons in a row they were the loudest thing on a
     * screen whose job is to be quiet. On a 390px phone they also pushed the
     * profile button clean off the right-hand edge.
     */
    <header className="border-rule bg-paper relative z-20 shrink-0 border-b">
      <div className="flex h-12 items-center gap-2 px-4 md:px-6">
        {/* the rail is a drawer on a phone (P3-22a), and a hamburger belongs
            at the left edge where a thumb already expects it */}
        <button
          type="button"
          aria-label="Menu"
          onClick={() => window.dispatchEvent(new Event("phmg:nav-drawer"))}
          className="rounded-control text-ink-muted hover:bg-carbon-wash hover:text-ink -ml-2 grid size-9 shrink-0 place-items-center transition-colors duration-150 md:hidden"
        >
          <List size={18} />
        </button>

        {branches.length > 1 && (
          <>
            <label className="sr-only" htmlFor="branch">
              What you are looking at
            </label>
            <select
              id="branch"
              value={view}
              onChange={(event) => chooseView(event.target.value)}
              className="rounded-control border-rule bg-paper text-13 text-ink h-8 max-w-[7.5rem] min-w-0 shrink border px-2 sm:max-w-none sm:shrink-0"
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
          <span className="text-13 text-ink-muted hidden truncate sm:block">
            {branches[0].name}
          </span>
        )}

        {/*
          The command bar lives at the window level; this opens it. On a
          phone it is the magnifier alone — the placeholder, the field and
          the Ctrl-K hint together need 280px that a phone has already spent.
        */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("phmg:command-bar"))}
          /**
           * Named "Search", not "Search clients, PAN, GSTIN".
           *
           * The long version read the visible placeholder out loud, which
           * sounds thorough and is not: a screen reader announces the
           * button's name on every focus, and three field names is a
           * mouthful for a control that does one thing. It also made the
           * button answer to "Client", "PAN" and "GSTIN" — the names of the
           * commonest fields in the app — so anything looking for a field
           * by its label found this button as well. The placeholder beside
           * the icon still says what can be typed.
           */
          aria-label="Search"
          className="rounded-control text-ink-muted hover:border-carbon hover:text-ink sm:border-rule sm:bg-paper sm:text-13 grid size-9 shrink-0 place-items-center transition-colors duration-150 sm:flex sm:h-8 sm:w-auto sm:min-w-0 sm:flex-1 sm:items-center sm:gap-2 sm:border sm:px-2 md:max-w-md"
        >
          <MagnifyingGlass size={18} className="shrink-0" />
          <span className="hidden truncate sm:inline">
            Search clients, PAN, GSTIN…
          </span>
          <kbd className="text-12 ml-auto hidden font-mono sm:inline">
            Ctrl K
          </kbd>
        </button>

        <div className="-mr-2 ml-auto flex shrink-0 items-center gap-0.5">
          {/* quick-add opens the command bar rather than a second menu of
              the same links: one list of things you can do, not two. The
              phone reaches it through the magnifier beside it. */}
          <button
            type="button"
            aria-label="Quick add — opens the command bar"
            onClick={() => window.dispatchEvent(new Event("phmg:command-bar"))}
            className="rounded-control text-ink-muted hover:bg-carbon-wash hover:text-ink hidden size-9 place-items-center transition-colors duration-150 sm:grid"
          >
            <Plus size={18} />
          </button>
          <Link
            href="/inbox"
            aria-label={
              unreadCount > 0 ? `Inbox, ${unreadCount} unread` : "Inbox"
            }
            className="rounded-control text-ink-muted hover:bg-carbon-wash hover:text-ink relative grid size-9 place-items-center transition-colors duration-150"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="bg-redpen ring-paper absolute top-1.5 right-1.5 size-2 rounded-full ring-2" />
            )}
          </Link>
          {/* how the firm does whatever screen you are on (P3-19) */}
          <HelpPanel />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Your profile"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className={`rounded-control hover:bg-carbon-wash hover:text-ink grid size-9 place-items-center transition-colors duration-150 ${menuOpen ? "bg-carbon-wash text-ink" : "text-ink-muted"}`}
            >
              <UserCircle size={20} />
            </button>
            {menuOpen && (
              <div className="rounded-ledger border-rule bg-surface absolute right-0 z-30 mt-1.5 w-64 border p-1.5 shadow-lg">
                <div className="px-2 py-1.5">
                  <p className="text-14 truncate font-semibold">{user.name}</p>
                  <p className="text-12 text-ink-muted truncate">
                    {user.email}
                  </p>
                  <p className="text-12 text-ink-muted">
                    {ROLE_LABELS[user.role] ?? user.role}
                  </p>
                </div>

                {/*
                  The three reading preferences, in the one place somebody
                  goes looking for "how this looks to me" (P3-21b, D52).

                  Each is captioned. In the bar they were three bare glyphs
                  and nobody could have told you which was which; a moon, a
                  row of lines and a rubber stamp only read as theme,
                  density and flourishes once something says so.
                */}
                <div className="border-rule mt-1 border-t px-2 pt-2 pb-1">
                  <p className="text-12 text-faint mb-1.5">How this looks</p>
                  <div className="flex items-start gap-4">
                    <Setting label="Theme">
                      <ThemeToggle />
                    </Setting>
                    <Setting label="Rows">
                      <DensityToggle />
                    </Setting>
                    <Setting label="Flourishes">
                      <MomentsToggle />
                    </Setting>
                  </div>
                </div>

                <div className="border-rule mt-1 border-t pt-1.5">
                  <Link
                    href="/me"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-control text-14 hover:bg-carbon-wash block px-2 py-1.5"
                  >
                    Your account
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut({ redirectTo: "/login" })}
                    className="rounded-control text-14 hover:bg-carbon-wash block w-full px-2 py-1.5 text-left"
                  >
                    Sign out
                  </button>
                </div>
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

/** An icon toggle with its name under it, so the glyph is not the only clue. */
function Setting({ label, children }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      {children}
      {/* 11px is the floor for a label: under it, text stops being read
          and starts being a texture. */}
      <span className="text-faint text-[11px] leading-none">{label}</span>
    </span>
  );
}
