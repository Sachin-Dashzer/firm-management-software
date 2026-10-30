"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X, SidebarSimple, MagnifyingGlass } from "@phosphor-icons/react";

import NavIcon from "./navIcons";
import CountBadge from "@/components/ui/CountBadge";
import { activeIn } from "@/lib/nav/active";
import { SECTIONS } from "@/lib/nav/sections";

/**
 * The rail (P3-34 phase 2), redrawn from the owner's design reference.
 *
 * What changed, and why each one is not a matter of taste:
 *
 *  - **Three bands.** Ten equal rows make somebody read all ten to find
 *    one. TODAY, WORK and FIRM cut that to a glance at the right third.
 *    The bands come from `group.section` in `lib/nav/tree.js`, so the
 *    rail does not hold a second copy of the menu's shape.
 *  - **A group row is a link.** It was a button that only expanded, so
 *    reaching "All open jobs" took two clicks and the first one went
 *    nowhere. It now goes to the group's first item and opens the group
 *    on the way, which is what the row looks like it will do.
 *  - **`today` renders flat.** Firm dashboard, My tasks, Inbox and Issues
 *    are four destinations, not four children of a fifth thing.
 *  - **Children appear under the open row only**, indented against a
 *    hairline, and the opening is `collapse-rows` (D103).
 *
 * **A bug fixed on the way through.** This component asked `activeIn()`
 * for `current._group_` and `current._href_`. The helper returns `group`
 * and `href` — it always has — so both were `undefined`, which means
 * **nothing in this rail had ever highlighted and no group had ever
 * opened itself on the page it belongs to**. Every active state below is
 * new behaviour rather than restyled behaviour.
 *
 * The landmark still wraps the find box and the list together, and the
 * find box is still called "Find in menu": the browser suite tells the
 * desktop rail and the phone drawer apart by which one holds it.
 */

export default function LeftRail({
  menu = [],
  counts = {},
  userName = "",
  roleLabel = "",
  branchLabel = "",
  firmName = "",
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  const current = useMemo(
    () => activeIn(menu, pathname, query ? `?${query}` : ""),
    [menu, pathname, query],
  );

  const [open, setOpen] = useState(current.group);
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

  // The group holding the current page opens itself.
  useEffect(() => {
    if (current.group) setOpen(current.group);
    setDrawer(false);
  }, [pathname, query, current.group]);

  // Support the existing mobile menu event.
  useEffect(() => {
    const showDrawer = () => setDrawer(true);
    window.addEventListener("phmg:nav-drawer", showDrawer);
    return () => window.removeEventListener("phmg:nav-drawer", showDrawer);
  }, []);

  // Close the mobile drawer using Escape.
  useEffect(() => {
    if (!drawer) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDrawer(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    drawerRef.current?.querySelector("a, button, input")?.focus();

    return () => window.removeEventListener("keydown", handleKeyDown);
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

  const countOf = (key) => (key ? counts[key] || 0 : 0);

  /** Every group of a band, in the menu's own order. */
  const bandOf = (key) => shown.filter((group) => group.section === key);

  /** A group row leads to its first real link. */
  const firstHref = (group) =>
    group.items.find((item) => typeof item !== "string")?.href ?? "/";

  const renderSidebar = (isCompact) => (
    <div className="text-ink-muted flex h-full min-h-0 flex-col">
      {/* Brand */}
      <div
        className={`border-rule flex h-[62px] shrink-0 items-center border-b px-3 ${
          isCompact ? "justify-center" : "gap-3"
        }`}
      >
        <div className="bg-carbon text-on-carbon rounded-ledger grid size-10 shrink-0 place-items-center text-lg font-extrabold">
          P
        </div>

        {!isCompact && (
          <div className="min-w-0 flex-1">
            <p className="text-ink text-14 truncate font-bold tracking-tight">
              {firmName || "PHMG & Associates"}
            </p>
            <p className="text-faint text-11 mt-0.5 font-semibold tracking-[0.16em] uppercase">
              Practice OS
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setCompact(!isCompact)}
          title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-control text-ink-muted hover:bg-carbon-wash hover:text-ink hidden size-8 shrink-0 items-center justify-center md:flex"
        >
          <SidebarSimple size={19} />
        </button>
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
        {/* Search */}
        {!isCompact && (
          <div className="shrink-0 px-3 pt-4 pb-1">
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
                className="border-rule bg-sunk text-ink placeholder:text-faint focus:border-carbon focus:bg-surface rounded-control text-13 h-9 w-full border pr-9 pl-9 outline-none"
              />

              {find && (
                <button
                  type="button"
                  onClick={() => {
                    setFind("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="text-faint hover:text-ink rounded-control absolute top-1/2 right-2 -translate-y-1/2 p-1"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        )}

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
            SECTIONS.map(({ key, label }) => {
              const groups = bandOf(key);
              if (groups.length === 0) return null;

              return (
                <div key={key}>
                  {/* the band heading; in compact mode a hairline stands
                      in for it, because there is no room for the word */}
                  {isCompact ? (
                    <div
                      aria-hidden="true"
                      className="border-rule mx-2 mt-3 border-t pt-3"
                    />
                  ) : (
                    <p className="text-faint text-11 px-3 pt-4 pb-1 font-semibold tracking-[0.14em] uppercase">
                      {label}
                    </p>
                  )}

                  <ul className="space-y-0.5">
                    {groups.flatMap((group) =>
                      group.flat
                        ? group.items
                            .filter((item) => typeof item !== "string")
                            .map((item) => (
                              <li key={item.href}>
                                <RailLink
                                  item={item}
                                  icon={item.icon ?? group.icon}
                                  active={current.href === item.href}
                                  count={countOf(item.count)}
                                  compact={isCompact}
                                  onClick={navigate}
                                />
                              </li>
                            ))
                        : [
                            <li key={group.id}>
                              <Group
                                group={group}
                                href={firstHref(group)}
                                isOpen={Boolean(find) || open === group.id}
                                isCurrent={current.group === group.id}
                                currentHref={current.href}
                                count={countOf(group.count)}
                                countOf={countOf}
                                compact={isCompact}
                                onOpen={() => {
                                  if (isCompact) {
                                    setCompact(false);
                                    setOpen(group.id);
                                    return;
                                  }
                                  setOpen(group.id);
                                }}
                                onNavigate={navigate}
                              />
                            </li>,
                          ],
                    )}
                  </ul>
                </div>
              );
            })
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
          className={`flex items-center gap-3 ${isCompact ? "justify-center" : ""}`}
        >
          <div
            title={isCompact ? `${userName} — ${roleLabel}` : undefined}
            className="bg-carbon-soft text-carbon rounded-ledger text-12 grid size-10 shrink-0 place-items-center font-bold"
          >
            {initials(userName)}
          </div>

          {!isCompact && (
            <div className="min-w-0 flex-1">
              <p className="text-ink text-13 truncate font-bold">
                {userName || "User"}
              </p>
              <p className="text-ink-muted text-11 mt-0.5 truncate">
                {[roleLabel || "Team member", branchLabel]
                  .filter(Boolean)
                  .join(" · ")}
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
              className="bg-surface text-ink-muted hover:bg-carbon-wash rounded-control absolute top-4 right-3 grid size-8 place-items-center"
            >
              <X size={18} />
            </button>
          </aside>
        </>
      )}
    </>
  );
}

/**
 * A group: one row that goes somewhere, and its children under it.
 *
 * `aria-expanded` sits on the link rather than on a separate chevron
 * button. A second control to open what the first one already opens is a
 * second tab stop for nothing, and the row's own click does both.
 */
function Group({
  group,
  href,
  isOpen,
  isCurrent,
  currentHref,
  count,
  countOf,
  compact,
  onOpen,
  onNavigate,
}) {
  const row = (
    <Link
      href={href}
      title={compact ? group.label : undefined}
      aria-expanded={isOpen}
      aria-current={isCurrent && !isOpen ? "true" : undefined}
      onClick={() => {
        onOpen();
        onNavigate();
      }}
      className={`rounded-control group flex min-h-10 w-full items-center px-3 py-2 text-left ${
        compact ? "justify-center px-0" : "gap-3"
      } ${
        isCurrent
          ? "bg-carbon-wash text-carbon font-semibold"
          : "text-ink-muted hover:bg-carbon-wash hover:text-ink"
      }`}
    >
      <span className="relative grid size-5 shrink-0 place-items-center">
        <NavIcon
          name={group.icon}
          className={isCurrent ? "text-carbon" : "text-ink-muted"}
        />

        {compact && count > 0 && (
          <span
            className={`ring-surface absolute -top-1 -right-1 size-2 rounded-full ring-2 ${
              group.tone === "bad" ? "bg-redpen" : "bg-waiting"
            }`}
          />
        )}
      </span>

      {!compact && (
        <>
          <span className="text-13 min-w-0 flex-1 truncate font-semibold">
            {group.label}
          </span>
          {count > 0 && (
            <CountBadge
              value={count}
              tone={group.tone === "bad" ? "late" : "soon"}
            />
          )}
        </>
      )}
    </Link>
  );

  if (compact) return row;

  return (
    <>
      {row}
      <div className="collapse-rows" data-open={isOpen ? "true" : "false"}>
        <div>
          <ul className="border-rule mt-0.5 ml-[21px] space-y-0.5 border-l pb-1 pl-3">
            {group.items.map((item, index) => {
              if (typeof item === "string") {
                return (
                  <li
                    key={`${group.id}-label-${index}`}
                    className="text-faint text-11 px-2 pt-3 pb-1 font-bold tracking-[0.12em] uppercase"
                  >
                    {item}
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Child
                    item={item}
                    active={currentHref === item.href}
                    count={countOf(item.count)}
                    onClick={onNavigate}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}

/** A child link, under an open group. */
function Child({ item, active, count, onClick }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded-control flex min-h-9 items-center gap-2 px-3 py-2 text-[12.5px] ${
        active
          ? "bg-carbon-soft text-carbon font-semibold"
          : "text-ink-muted hover:bg-carbon-wash hover:text-ink"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count > 0 && (
        <CountBadge
          value={count}
          tone={item.tone === "bad" ? "late" : "soon"}
        />
      )}
    </Link>
  );
}

/** A top-level link with an icon — the TODAY band's rows. */
function RailLink({ item, icon, active, count, compact, onClick }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={compact ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`rounded-control flex min-h-10 w-full items-center px-3 py-2 ${
        compact ? "justify-center px-0" : "gap-3"
      } ${
        active
          ? "bg-carbon-wash text-carbon font-semibold"
          : "text-ink-muted hover:bg-carbon-wash hover:text-ink"
      }`}
    >
      <span className="relative grid size-5 shrink-0 place-items-center">
        <NavIcon
          name={icon}
          className={active ? "text-carbon" : "text-ink-muted"}
        />
        {compact && count > 0 && (
          <span className="bg-waiting ring-surface absolute -top-1 -right-1 size-2 rounded-full ring-2" />
        )}
      </span>
      {!compact && (
        <>
          <span className="text-13 min-w-0 flex-1 truncate font-semibold">
            {item.label}
          </span>
          {count > 0 && (
            <CountBadge
              value={count}
              tone={item.tone === "bad" ? "late" : "soon"}
            />
          )}
        </>
      )}
    </Link>
  );
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";

  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ""))
    .toUpperCase()
    .slice(0, 2);
}
