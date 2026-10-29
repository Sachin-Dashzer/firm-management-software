"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CaretDown, X, SidebarSimple } from "@phosphor-icons/react";
import NavIcon from "./navIcons";
import { activeIn } from "@/lib/nav/active";

/**
 * The left menu (P3-22a), rendered from `lib/nav/tree.js`.
 *
 * Everything it knows arrives as props: the already-filtered menu, the
 * badge numbers, and who is signed in. It holds no list of its own — there
 * were three before this (the rail, the command bar, a bottom bar for
 * phones) and they had already drifted apart.
 *
 * Four behaviours come from the prototype and each has a reason:
 *
 *  - **accordion**: opening a group closes the others, so the rail never
 *    becomes a wall of 58 links
 *  - **the group that holds the current page opens itself** on every
 *    navigation, so the menu always shows where you are
 *  - **a group's own badge shows only while it is closed** — open, the
 *    item badges say the same thing more precisely
 *  - **a badge of zero is not drawn**: "0 overdue" is noise with a colour
 *
 * The rail is three zones rather than one scrolling column: a fixed head, a
 * scrolling list, a fixed foot. With a group open the list is taller than a
 * laptop screen, and the firm's name, the find box and the signed-in line
 * used to scroll away with it — so the two lines that say *where you are*
 * and *who you are* were the first things to leave.
 */

/**
 * The groups that run the firm rather than the work in it. A hairline above
 * the first of them is the only division the menu has: ten identical rows
 * is a list, eight and two is a shape you can aim at.
 */
const ADMIN_GROUPS = new Set(["team", "firm", "tools"]);

export default function LeftRail({
  menu = [],
  counts = {},
  userName = "",
  roleLabel = "",
  firmName = "",
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();

  const current = useMemo(
    () => activeIn(menu, pathname, query ? `?${query}` : ""),
    [menu, pathname, query],
  );

  const [open, setOpen] = useState(current.group);
  const [find, setFind] = useState("");
  const [compact, setCompact] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef(null);

  /** Compact mode is a reading preference, and the old key still holds it. */
  useEffect(() => {
    try {
      setCompact(localStorage.getItem("phmg-rail") === "compact");
    } catch {
      // a private window: the rail just opens wide every time
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("phmg-rail", compact ? "compact" : "wide");
    } catch {
      /* nothing to do */
    }
  }, [compact]);

  /** On every navigation, the group holding the page opens and the rest close. */
  useEffect(() => {
    if (current.group) setOpen(current.group);
    setDrawer(false);
  }, [pathname, query, current.group]);

  /** The top bar's Menu button, on a phone. */
  useEffect(() => {
    const show = () => setDrawer(true);
    window.addEventListener("phmg:nav-drawer", show);
    return () => window.removeEventListener("phmg:nav-drawer", show);
  }, []);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (event) => event.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    drawerRef.current?.querySelector("a,button,input")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const shown = useMemo(() => filterMenu(menu, find), [menu, find]);

  /**
   * The drawer is never narrow, whatever the desktop rail is set to. They
   * share one preference because they are one menu, but a 288px drawer
   * showing ten unlabelled icons is that preference applied where it means
   * nothing: on a phone there is no wide rail to narrow.
   */
  const body = (isCompact) => (
    <Body
      menu={shown}
      counts={counts}
      current={current}
      open={find ? null : open}
      setOpen={setOpen}
      find={find}
      setFind={setFind}
      compact={isCompact}
      setCompact={setCompact}
      userName={userName}
      roleLabel={roleLabel}
      firmName={firmName}
      onNavigate={() => {
        setFind("");
        setDrawer(false);
      }}
    />
  );

  return (
    <>
      {/* --- desktop --- */}
      <nav
        aria-label="Main"
        data-compact={compact ? "yes" : "no"}
        className={`border-rule bg-sunk hidden shrink-0 flex-col overflow-hidden border-r px-2.5 pt-3 pb-3 md:sticky md:top-0 md:flex md:h-dvh ${
          compact ? "w-[68px]" : "w-[252px]"
        }`}
      >
        {body(compact)}
      </nav>

      {/* --- phone: the same rail, as a drawer --- */}
      {drawer && (
        <>
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setDrawer(false)}
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
          />
          <nav
            ref={drawerRef}
            aria-label="Main"
            className="border-rule bg-sunk fixed top-0 bottom-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col overflow-hidden border-r px-2.5 pt-3 pb-3 shadow-xl md:hidden"
          >
            {body(false)}
          </nav>
        </>
      )}
    </>
  );
}

function Body({
  menu,
  counts,
  current,
  open,
  setOpen,
  find,
  setFind,
  compact,
  setCompact,
  userName,
  roleLabel,
  firmName,
  onNavigate,
}) {
  /**
   * The first group that administers the firm, so the hairline is drawn once
   * and only when such a group is on screen at all — an employee's menu has
   * none of them, and nor does a search that matches nothing in them.
   */
  const firstAdmin = menu.find((group) => ADMIN_GROUPS.has(group.id))?.id;

  return (
    <>
      {/*
        The mark and the firm's name, once. It read "PHMG" and then "PHMG &
        Associates" underneath it, which is the same words twice with the
        second set truncated.
      */}
      <div
        className={`mb-2.5 flex shrink-0 items-center gap-2.5 px-1 ${compact ? "flex-col gap-2" : ""}`}
      >
        <span className="bg-carbon text-on-carbon text-14 grid size-[34px] shrink-0 place-items-center rounded-[10px] font-bold">
          P
        </span>
        {!compact && (
          <span className="text-14 text-ink min-w-0 flex-1 truncate font-semibold">
            {firmName || "PHMG & Associates"}
          </span>
        )}
        {/*
          One button, present in both states. It used to sit in the find row
          and disappear once the rail was narrow, so the only way back was to
          click a group and hope: the control that closes a thing has to be
          there to open it again.
        */}
        <button
          type="button"
          aria-label={compact ? "Widen the menu" : "Narrow the menu"}
          title={compact ? "Widen the menu" : "Narrow the menu"}
          onClick={() => setCompact(!compact)}
          className="rounded-control text-ink-muted hover:bg-carbon-wash hover:text-ink hidden size-8 shrink-0 place-items-center transition-colors duration-150 md:grid"
        >
          <SidebarSimple size={16} />
        </button>
      </div>

      {!compact && (
        <div className="mb-2 shrink-0 px-1">
          <span className="relative block">
            <input
              value={find}
              onChange={(event) => setFind(event.target.value)}
              placeholder="Find in menu"
              aria-label="Find in menu"
              className="rounded-control border-rule bg-paper text-13 placeholder:text-faint focus:border-carbon w-full border px-2.5 py-[7px] pr-7 transition-colors duration-150"
            />
            {find && (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => setFind("")}
                className="text-ink-muted hover:text-ink absolute top-1/2 right-1.5 -translate-y-1/2"
              >
                <X size={13} />
              </button>
            )}
          </span>
        </div>
      )}

      {/*
        The only part that scrolls. `-mr-1 pr-1` keeps the scrollbar clear of
        the rows without the rows giving up any of their hit area.
      */}
      <ul className="-mr-1 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pr-1">
        {menu.map((group) => {
          const isOpen = open === group.id || Boolean(find);
          const here = current.group === group.id;
          const badge = group.count ? counts[group.count] : 0;

          return (
            <li
              key={group.id}
              className={
                group.id === firstAdmin
                  ? "border-rule mt-2 border-t pt-2"
                  : undefined
              }
            >
              <button
                type="button"
                aria-expanded={isOpen}
                title={compact ? group.label : undefined}
                onClick={() => {
                  if (compact) {
                    setCompact(false);
                    setOpen(group.id);
                    return;
                  }
                  // accordion: one open group at a time
                  setOpen(isOpen ? null : group.id);
                }}
                className={`rounded-control flex w-full items-center gap-2.5 py-[7px] text-left transition-colors duration-150 max-md:py-2.5 ${
                  compact ? "justify-center px-0" : "px-2"
                } ${
                  here
                    ? "bg-carbon-wash text-ink"
                    : "text-ink-muted hover:bg-carbon-wash hover:text-ink"
                }`}
              >
                <span className="relative grid shrink-0 place-items-center">
                  <NavIcon
                    name={group.icon}
                    className={here ? "text-carbon" : ""}
                  />
                  {compact && badge > 0 && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 size-[7px] rounded-full ${
                        group.tone === "bad" ? "bg-redpen" : "bg-waiting"
                      }`}
                    />
                  )}
                </span>
                {!compact && (
                  <>
                    <span className="flex-1 truncate text-[13.5px] font-semibold">
                      {group.label}
                    </span>
                    {!isOpen && (
                      <Badge
                        value={badge}
                        tone={group.tone}
                        label={group.label}
                      />
                    )}
                    <CaretDown
                      size={13}
                      aria-hidden
                      className={`text-faint shrink-0 transition-transform duration-150 ease-out ${isOpen ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </button>

              {!compact && isOpen && (
                <ul className="border-rule mt-px mb-1 ml-[18px] flex flex-col gap-px border-l pl-2.5">
                  {group.items.map((item, index) =>
                    typeof item === "string" ? (
                      <li
                        key={`${group.id}-label-${index}`}
                        /* Sentence case at 12px, not tracked capitals at
                           10.5 — a nav group label is read, not shouted,
                           and 10.5px is under the floor for a label. */
                        className="text-faint px-2 pt-2.5 pb-1 text-12 font-medium"
                      >
                        {item}
                      </li>
                    ) : (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={
                            current.href === item.href ? "page" : undefined
                          }
                          className={`rounded-control text-13 flex items-center gap-2 px-2 py-1.5 transition-colors duration-150 max-md:py-2.5 ${
                            current.href === item.href
                              ? "bg-carbon-soft text-carbon-ink font-semibold"
                              : "text-ink-muted hover:bg-carbon-wash hover:text-ink"
                          }`}
                        >
                          <span className="flex-1 truncate">{item.label}</span>
                          <Badge
                            value={item.count ? counts[item.count] : 0}
                            tone={item.tone}
                            label={item.label}
                          />
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </li>
          );
        })}

        {menu.length === 0 && (
          <li className="text-13 text-ink-muted px-2 py-3">
            No menu item matches.
          </li>
        )}
      </ul>

      {/*
        Who you are signed in as, pinned to the floor of the rail. "Signed in
        as" was two words doing a face's job: the initials say it, and the
        role underneath is what somebody actually checks before they wonder
        why a button is missing.
      */}
      <div
        className={`border-rule mt-2 flex shrink-0 items-center gap-2 border-t px-1 pt-2.5 ${compact ? "justify-center" : ""}`}
      >
        <span
          title={compact ? `${userName} — ${roleLabel}` : undefined}
          className="bg-carbon-soft text-carbon-ink grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold"
        >
          {initials(userName)}
        </span>
        {!compact && (
          <span className="min-w-0">
            <span className="text-12 text-ink block truncate leading-tight font-semibold">
              {userName}
            </span>
            <span className="text-12 text-ink-muted block truncate leading-tight">
              {roleLabel}
            </span>
          </span>
        )}
      </div>
    </>
  );
}

/** Two letters for the footer chip; one for a one-word name. */
function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ""))
    .toUpperCase()
    .slice(0, 2);
}

/** A count of zero is not news. */
function Badge({ value, tone = "", label = "" }) {
  if (!value) return null;
  const skin =
    tone === "bad"
      ? "bg-redpen-wash text-redpen"
      : tone === "warn"
        ? "bg-waiting-wash text-waiting"
        : "bg-paper text-ink-muted";

  return (
    <span
      aria-label={`${value} ${label.toLowerCase()}`}
      className={`grid h-[18px] min-w-[20px] shrink-0 place-items-center rounded-full px-1 text-[11px] font-bold tabular-nums ${skin}`}
    >
      {value}
    </span>
  );
}

/**
 * Find in menu: an item matches on its own label or its group's, and a
 * group with no match disappears rather than sitting there empty.
 */
function filterMenu(menu, find) {
  const text = find.trim().toLowerCase();
  if (!text) return menu;

  return menu
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          typeof item !== "string" &&
          `${item.label} ${group.label}`.toLowerCase().includes(text),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
