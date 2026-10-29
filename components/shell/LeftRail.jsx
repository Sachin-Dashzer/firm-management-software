
"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
    [menu, pathname, query]
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
      localStorage.setItem(
        "phmg-rail",
        compact ? "compact" : "wide"
      );
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
            `${item.label} ${group.label}`
              .toLowerCase()
              .includes(term)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [menu, find]);

  const navigate = useCallback(() => {
    setFind("");
    setDrawer(false);
  }, []);

  const renderSidebar = (isCompact) => (
    <div className="flex h-full min-h-0 flex-col text-slate-700">
      {/* Brand */}
      <div
        className={`flex h-[62px] shrink-0 items-center border-b border-slate-200 px-3 ${
          isCompact ? "justify-center" : "gap-3"
        }`}
      >
        <div
          className="grid size-10 shrink-0 place-items-center rounded-xl
            bg-slate-950 text-lg font-extrabold text-white shadow-sm"
        >
          P
        </div>

        {!isCompact && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight text-slate-950">
              {firmName || "PHMG & Associates"}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Firm management
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setCompact(!isCompact)}
          title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden size-8 shrink-0 items-center justify-center
            rounded-lg text-slate-500 transition hover:bg-slate-100
            hover:text-slate-900 md:flex"
        >
          <SidebarSimple size={19} />
        </button>
      </div>

      {/* Search */}
      {!isCompact && (
        <div className="shrink-0 px-3 pb-3 pt-4">
          <div className="relative">
            <MagnifyingGlass
              size={17}
              className="pointer-events-none absolute left-3 top-1/2
                -translate-y-1/2 text-slate-400"
            />

            <input
              ref={searchRef}
              value={find}
              onChange={(event) => setFind(event.target.value)}
              placeholder="Search navigation..."
              aria-label="Search navigation"
              className="h-10 w-full rounded-xl border border-slate-200
                bg-slate-50 pl-9 pr-9 text-sm text-slate-800 outline-none
                transition placeholder:text-slate-400
                focus:border-slate-400 focus:bg-white
                focus:ring-4 focus:ring-slate-100"
            />

            {find && (
              <button
                type="button"
                onClick={() => {
                  setFind("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2
                  rounded-md p-1 text-slate-400 hover:text-slate-800"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav
        aria-label="Main navigation"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3
          [scrollbar-color:#cbd5e1_transparent]
          [scrollbar-width:thin]"
      >
        {shown.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MagnifyingGlass
              size={25}
              className="mx-auto mb-2 text-slate-300"
            />
            <p className="text-sm font-medium text-slate-600">
              No results found
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Try another search.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {shown.map((group) => {
              const isOpen =
                Boolean(find) || open === group.id;

              const isCurrentGroup =
                current?._group_ === group.id;

              const groupCount = group.count
                ? counts[group.count] || 0
                : 0;

              const isAdminGroup = ADMIN_GROUPS.has(group.id);

              return (
                <li
                  key={group.id}
                  className={
                    isAdminGroup
                      ? "mt-3 border-t border-slate-200 pt-3"
                      : ""
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
                    className={`group flex min-h-10 w-full items-center
                      rounded-xl px-3 py-2 text-left transition-all
                      duration-150 ${
                        isCompact ? "justify-center px-0" : "gap-3"
                      } ${
                        isCurrentGroup
                          ? "bg-slate-100 text-slate-950"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                      }`}
                  >
                    <span className="relative grid size-5 shrink-0 place-items-center">
                      <NavIcon
                        name={group.icon}
                        className={
                          isCurrentGroup
                            ? "text-slate-950"
                            : "text-slate-500 group-hover:text-slate-800"
                        }
                      />

                      {isCompact && groupCount > 0 && (
                        <span
                          className={`absolute -right-1 -top-1 size-2
                            rounded-full ring-2 ring-white ${
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
                          <Badge
                            value={groupCount}
                            tone={group.tone}
                          />
                        )}

                        <CaretDown
                          size={14}
                          className={`shrink-0 text-slate-400
                            transition-transform duration-200 ${
                              isOpen ? "rotate-180" : ""
                            }`}
                        />
                      </>
                    )}
                  </button>

                  {/* Group links */}
                  {!isCompact && isOpen && (
                    <ul className="ml-[21px] mt-1 space-y-0.5
                      border-l border-slate-200 pb-1 pl-3">
                      {group.items.map((item, index) => {
                        if (typeof item === "string") {
                          return (
                            <li
                              key={`${group.id}-label-${index}`}
                              className="px-2 pb-1 pt-3 text-[10px]
                                font-bold uppercase tracking-[0.12em]
                                text-slate-400"
                            >
                              {item}
                            </li>
                          );
                        }

                        const active =
                          current?._href_ === item.href;

                        const itemCount = item.count
                          ? counts[item.count] || 0
                          : 0;

                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              onClick={navigate}
                              aria-current={
                                active ? "page" : undefined
                              }
                              className={`relative flex min-h-9
                                items-center gap-2 rounded-lg px-3 py-2
                                text-[12.5px] transition-all duration-150 ${
                                  active
                                    ? "bg-slate-950 font-semibold text-white shadow-sm"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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
      </nav>

      {/* Signed-in user */}
      <div
        className={`shrink-0 border-t border-slate-200 bg-white p-3 ${
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
            className="grid size-10 shrink-0 place-items-center
              rounded-xl bg-indigo-50 text-xs font-bold
              text-indigo-700 ring-1 ring-indigo-100"
          >
            {initials(userName)}
          </div>

          {!isCompact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-slate-900">
                {userName || "User"}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
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
        className={`hidden h-dvh shrink-0 flex-col overflow-hidden
          border-r border-slate-200 bg-white transition-[width]
          duration-200 md:sticky md:top-0 md:flex ${
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
            className="fixed inset-0 z-40 bg-slate-950/40
              backdrop-blur-[2px] md:hidden"
          />

          <aside
            ref={drawerRef}
            className="fixed inset-y-0 left-0 z-50 flex
              w-[288px] max-w-[85vw] flex-col overflow-hidden
              border-r border-slate-200 bg-white shadow-2xl md:hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              {renderSidebar(false)}
            </div>

            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 grid size-8
                place-items-center rounded-lg bg-white
                text-slate-500 hover:bg-slate-100"
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
    ? "bg-white/15 text-white"
    : tone === "bad"
      ? "bg-rose-50 text-rose-600"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex min-w-5 shrink-0 items-center
        justify-center rounded-md px-1.5 py-0.5 text-[10px]
        font-bold tabular-nums ${styles}`}
    >
      {value}
    </span>
  );
}

function initials(name) {
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";

  return (
    parts[0][0] +
    (parts.length > 1 ? parts[parts.length - 1][0] : "")
  )
    .toUpperCase()
    .slice(0, 2);
}
