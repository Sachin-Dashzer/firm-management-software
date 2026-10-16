"use client";

import { MagnifyingGlass, Plus, Bell, UserCircle } from "@phosphor-icons/react";
import { ThemeToggle, DensityToggle } from "./Preferences";

/* Branches come from the `branches` collection in Step 1; until users and
   branches exist they are listed here so the switcher can be laid out.
   ponytail: hardcoded branch list, replaced by the Atlas query in Step 1. */
const BRANCHES = [
  { code: "NOI", name: "Noida (head office)" },
  { code: "DEL", name: "Delhi — Rohini" },
  { code: "LDH", name: "Ludhiana" },
  { code: "MRT", name: "Meerut" },
];

export default function TopBar() {
  return (
    <header className="border-rule bg-surface relative z-10 shrink-0 border-b">
      <div className="flex h-12 items-center gap-2 px-3">
        <label className="sr-only" htmlFor="branch">
          Branch
        </label>
        <select
          id="branch"
          defaultValue="all"
          className="rounded-ledger border-rule bg-paper text-13 text-ink h-8 border px-2"
        >
          <option value="all">All branches</option>
          {BRANCHES.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>

        {/* Command bar lands in Step 11 (cmdk); the entry point sits here now. */}
        <button
          type="button"
          disabled
          className="rounded-ledger border-rule bg-paper text-13 text-ink-muted flex h-8 min-w-0 flex-1 items-center gap-2 border px-2 md:max-w-md"
        >
          <MagnifyingGlass size={16} />
          <span className="truncate">Search clients, PAN, GSTIN…</span>
          <kbd className="text-12 ml-auto hidden font-mono sm:inline">
            Ctrl K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Quick add"
            className="rounded-ledger text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="rounded-ledger text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
          >
            <Bell size={18} />
          </button>
          <DensityToggle />
          <ThemeToggle />
          <button
            type="button"
            aria-label="Your profile"
            className="rounded-ledger text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
          >
            <UserCircle size={20} />
          </button>
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
