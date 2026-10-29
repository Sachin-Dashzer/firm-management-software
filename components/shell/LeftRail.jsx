"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CaretDown,
  X,
  SidebarSimple,
  MagnifyingGlass,
  SignOut,
} from "@phosphor-icons/react";

import NavIcon from "./navIcons";
import { activeIn } from "@/lib/nav/active";

const ADMIN_GROUPS = new Set(["team", "firm", "tools"]);

export default function LeftRail({
  menu = [],
  counts = {},
  userName = "",
  roleLabel = "",
  firmName = "",
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  const current = useMemo(
    () => activeIn(menu, pathname, query ? `?${query}` : ""),
    [menu, pathname, query],
  );

  const [open, setOpen] = useState(current?._group_ ?? null);
  const [find, setFind] = useState("");
  const [compact, setCompact] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const drawerRef = useRef(null);
  const searchRef = useRef(null);

  // Restore the user's sidebar preference.
  useEffect(() => {
    try {
      setCompact(localStorage.getItem("phmg-rail") === "compact");
    } catch {
      // Continue with the expanded sidebar.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("phmg-rail", compact ? "compact" : "wide");
    } catch {
      // Storage may be unavailable.
    }
  }, [compact]);

  // Keep the current page's group expanded.
  useEffect(() => {
    if (current?._group_) {
      setOpen(current._group_);
    }

    setDrawer(false);
  }, [pathname, query, current?._group_]);

  // Support the existing mobile menu event.
  useEffect(() => {
    const showDrawer = () => setDrawer(true);

    window.addEventListener("phmg:nav-drawer", showDrawer);

    return () => {
      window.removeEventListener("phmg:nav-drawer", showDrawer);
    };
  }, []);

  // Close the mobile drawer using Escape.
  useEffect(() => {
    if (!drawer) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setDrawer(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    drawerRef.current?.querySelector("a, button, input")?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawer]);

  const shown = useMemo(() => {
    const term = find.trim().toLowerCase();

    if (!term) return menu;

    return menu
      .map((group) => ({
        ...group,
        items: (group.items || []).filter(
          (item) =>
            typeof item !== "string" &&
            `${item.label} ${group.label}`.toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [menu, find]);

  const navigate = useCallback(() => {
    setFind("");
    setDrawer(false);
  }, []);

  const renderSidebar = (isCompact) => (
    <div className="text-ink-muted flex h-full min-h-0 flex-col">
      {/* Brand */}
      <div
        className={`border-rule flex h-[62px] shrink-0 items-center border-b px-3 ${
          isCompact ? "justify-center" : "gap-3"
        }`}
      >
        <div className="bg-plate text-plate-ink grid size-10 shrink-0 place-items-center rounded-xl text-lg font-extrabold shadow-sm">
          P
        </div>

        {!isCompact && (
          <div className="min-w-0 flex-1">
            <p className="text-ink truncate text-sm font-bold tracking-tight">
              {firmName || "PHMG & Associates"}
            </p>
            <p className="text-faint mt-0.5 text-[10px] font-semibold tracking-[0.16em] uppercase">
              Firm management
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setCompact(!isCompact)}
          title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          className="text-ink-muted hover:bg-carbon-wash hover:text-ink hidden size-8 shrink-0 items-center justify-center rounded-lg transition md:flex"
        >
          <SidebarSimple size={19} />
        </button>
      </div>

      {/*
        One landmark over the search and the list together (P3-29 repair).

        The box that filters the menu belongs inside the menu: a screen
        reader jumping to the navigation lands on the search, and the
        suite's drawer test tells the two rails apart by which one holds
        it. The redesign had the input outside the `nav`, so the drawer had
        no way to be identified and the filter had no landmark at all.
      */}
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
        {/* Search */}
        {!isCompact && (
          <div className="shrink-0 px-3 pt-4 pb-3">
            <div className="relative">
              <MagnifyingGlass
                size={17}
                className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
              />

              <input
                ref={searchRef}
                value={find}
                onChange={(event) => setFind(event.target.value)}
                placeholder="Find in menu…"
                aria-label="Find in menu"
                className="border-rule bg-sunk text-ink placeholder:text-faint focus:border-carbon focus:bg-surface focus:ring-carbon-soft h-10 w-full rounded-xl border pr-9 pl-9 text-sm transition outline-none focus:ring-4"
              />

              {find && (
                <button
                  type="button"
                  onClick={() => {
                    setFind("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="text-faint hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* The groups themselves */}
        <div className="min-h-0 flex-1 [scrollbar-width:thin] [scrollbar-color:var(--rule)_transparent] overflow-y-auto px-2 pb-3">
          {shown.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MagnifyingGlass size={25} className="text-faint mx-auto mb-2" />
              <p className="text-14 text-ink-muted font-medium">
                No menu item matches.
              </p>
              <p className="text-12 text-faint mt-1">
                Try a shorter word, or clear the box.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {shown.map((group) => {
                const isOpen = Boolean(find) || open === group.id;

                const isCurrentGroup = current?._group_ === group.id;

                const groupCount = group.count ? counts[group.count] || 0 : 0;

                const isAdminGroup = ADMIN_GROUPS.has(group.id);

                return (
                  <li
                    key={group.id}
                    className={
                      isAdminGroup ? "border-rule mt-3 border-t pt-3" : ""
                    }
                  >
                    <button
                      type="button"
                      title={isCompact ? group.label : undefined}
                      aria-expanded={isOpen}
                      onClick={() => {
                        if (isCompact) {
                          setCompact(false);
                          setOpen(group.id);
                          return;
                        }

                        setOpen(isOpen && !find ? null : group.id);
                      }}
                      className={`group flex min-h-10 w-full items-center rounded-xl px-3 py-2 text-left transition-all duration-150 ${
                        isCompact ? "justify-center px-0" : "gap-3"
                      } ${
                        isCurrentGroup
                          ? "bg-carbon-wash text-ink"
                          : "text-ink-muted hover:bg-carbon-wash hover:text-ink"
                      }`}
                    >
                      <span className="relative grid size-5 shrink-0 place-items-center">
                        <NavIcon
                          name={group.icon}
                          className={
                            isCurrentGroup
                              ? "text-ink"
                              : "text-ink-muted group-hover:text-ink"
                          }
                        />

                        {isCompact && groupCount > 0 && (
                          <span
                            className={`absolute -top-1 -right-1 size-2 rounded-full ring-2 ring-white ${
                              group.tone === "bad"
                                ? "bg-rose-500"
                                : "bg-amber-500"
                            }`}
                          />
                        )}
                      </span>

                      {!isCompact && (
                        <>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                            {group.label}
                          </span>

                          {!isOpen && groupCount > 0 && (
                            <Badge value={groupCount} tone={group.tone} />
                          )}

                          <CaretDown
                            size={14}
                            className={`text-faint shrink-0 transition-transform duration-200 ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </>
                      )}
                    </button>

                    {/* Group links */}
                    {!isCompact && isOpen && (
                      <ul className="border-rule mt-1 ml-[21px] space-y-0.5 border-l pb-1 pl-3">
                        {group.items.map((item, index) => {
                          if (typeof item === "string") {
                            return (
                              <li
                                key={`${group.id}-label-${index}`}
                                className="text-faint px-2 pt-3 pb-1 text-[10px] font-bold tracking-[0.12em] uppercase"
                              >
                                {item}
                              </li>
                            );
                          }

                          const active = current?._href_ === item.href;

                          const itemCount = item.count
                            ? counts[item.count] || 0
                            : 0;

                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={navigate}
                                aria-current={active ? "page" : undefined}
                                className={`relative flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] transition-all duration-150 ${
                                  active
                                    ? "bg-carbon text-on-carbon font-semibold shadow-sm"
                                    : "text-ink-muted hover:bg-carbon-wash hover:text-ink"
                                }`}
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {item.label}
                                </span>

                                {itemCount > 0 && (
                                  <Badge
                                    value={itemCount}
                                    tone={item.tone}
                                    active={active}
                                  />
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </nav>

      {/* Signed-in user */}
      <div
        className={`border-rule bg-surface shrink-0 border-t p-3 ${
          isCompact ? "flex justify-center" : ""
        }`}
      >
        <div
          className={`flex items-center gap-3 ${
            isCompact ? "justify-center" : ""
          }`}
        >
          <div
            title={isCompact ? `${userName} — ${roleLabel}` : undefined}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100"
          >
            {initials(userName)}
          </div>

          {!isCompact && (
            <div className="min-w-0 flex-1">
              <p className="text-ink truncate text-[13px] font-bold">
                {userName || "User"}
              </p>
              <p className="text-ink-muted mt-0.5 truncate text-[11px]">
                {roleLabel || "Team member"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        data-compact={compact ? "yes" : "no"}
        className={`border-rule bg-surface hidden h-dvh shrink-0 flex-col overflow-hidden border-r transition-[width] duration-200 md:sticky md:top-0 md:flex ${
          compact ? "w-[76px]" : "w-[272px]"
        }`}
      >
        {renderSidebar(compact)}
      </aside>

      {/* Mobile menu drawer */}
      {drawer && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawer(false)}
            className="bg-ink/40 fixed inset-0 z-40 backdrop-blur-[2px] md:hidden"
          />

          <aside
            ref={drawerRef}
            className="border-rule bg-surface fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col overflow-hidden border-r shadow-2xl md:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              {renderSidebar(false)}
            </div>

            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
              className="bg-surface text-ink-muted hover:bg-carbon-wash absolute top-4 right-3 grid size-8 place-items-center rounded-lg"
            >
              <X size={18} />
            </button>
          </aside>
        </>
      )}
    </>
  );
}

function Badge({ value, tone = "", active = false }) {
  if (!value) return null;

  const styles = active
    ? "bg-on-carbon/20 text-on-carbon"
    : tone === "bad"
      ? "bg-rose-50 text-rose-600"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-sunk text-ink-muted";

  return (
    <span
      className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${styles}`}
    >
      {value}
    </span>
  );
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";

  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ""))
    .toUpperCase()
    .slice(0, 2);
}
