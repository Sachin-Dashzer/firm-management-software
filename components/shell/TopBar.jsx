"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { MagnifyingGlass, Plus, Bell, UserCircle } from "@phosphor-icons/react";
import { ThemeToggle, DensityToggle } from "./Preferences";
import { ROLE_LABELS } from "@/lib/permissions";

/**
 * @param {object} props
 * @param {{ name: string, email: string, role: string }} props.user
 * @param {{ id: string, code: string, name: string }[]} props.branches the
 *   branches this user is assigned to, already filtered on the server
 */
export default function TopBar({ user, branches, unreadCount = 0 }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-rule bg-surface relative z-20 shrink-0 border-b">
      <div className="flex h-12 items-center gap-2 px-3">
        {branches.length > 1 && (
          <>
            <label className="sr-only" htmlFor="branch">
              Branch
            </label>
            <select
              id="branch"
              defaultValue="all"
              className="rounded-ledger border-rule bg-paper text-13 text-ink h-8 border px-2"
            >
              <option value="all">All my branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
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
          className="rounded-ledger border-rule bg-paper text-13 text-ink-muted hover:border-brass hover:text-ink flex h-8 min-w-0 flex-1 items-center gap-2 border px-2 md:max-w-md"
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
            href="/notifications"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            className="rounded-ledger text-ink-muted hover:bg-carbon-wash hover:text-ink relative grid size-8 place-items-center"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="bg-redpen absolute top-1 right-1 size-2 rounded-full" />
            )}
          </Link>
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
                  className="rounded-ledger border-rule hover:bg-carbon-wash w-full border px-2 py-1 text-left"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* the one gradient the design allows: a brass hairline under the top bar */}
      <div
        aria-hidden
        className="h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, var(--brass), transparent)",
        }}
      />
    </header>
  );
}
