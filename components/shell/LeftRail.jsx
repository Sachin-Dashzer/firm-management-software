"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Users,
  UsersThree,
  UserCircle,
  Briefcase,
  CalendarCheck,
  FolderOpen,
  Receipt,
  ChartBar,
  ClipboardText,
  Gear,
  CaretLeft,
  DotsThree,
} from "@phosphor-icons/react";
import { can, scopeOf, seesOnlyOwnRecords } from "@/lib/permissions";

/**
 * Phase 1 destinations. `area` is the permission area from spec section 2, so
 * a link only appears for a role that may open it — the page itself checks
 * again, because hiding a link is not security.
 */
const LINKS = [
  { href: "/today", label: "Today", icon: House, area: "dashboards" },
  {
    href: "/clients",
    label: "Clients",
    // An employee or an intern reaches clients one at a time, through work on
    // their desk or a grant (owner decision D3), so "Clients" would promise a
    // list of the firm's clients that they will never see.
    narrowLabel: "My clients",
    icon: Users,
    area: "clients",
  },
  {
    href: "/engagements",
    label: "Engagements",
    icon: Briefcase,
    area: "engagementsWork",
  },
  {
    href: "/calendar",
    label: "Compliance",
    icon: CalendarCheck,
    area: "engagementsWork",
  },
  {
    href: "/documents",
    label: "Documents",
    icon: FolderOpen,
    area: "documents",
  },
  { href: "/invoices", label: "Billing", icon: Receipt, area: "invoices" },
  { href: "/team", label: "Team", icon: UsersThree, area: "team" },
  { href: "/reports", label: "Reports", icon: ChartBar, area: "dashboards" },
  {
    href: "/portal-log",
    label: "Portal log",
    icon: ClipboardText,
    area: "auditLog",
  },
  // everyone can read the service catalog, which lives under Settings;
  // the sections inside are filtered by role
  { href: "/settings", label: "Settings", icon: Gear, area: "serviceCatalog" },
  // everybody has one of these, which is the point of it
  { href: "/me", label: "Me", icon: UserCircle, area: null },
];

/**
 * What this role may open, with the labels that tell the truth for it.
 *
 * `/team` appears for everybody — a Partner and a CA get the list, and an
 * employee or an intern has `team: view/own`, which the page turns into a
 * redirect to `/me`. So the rail drops it for them and shows "Me" instead.
 *
 * @param {string} role
 */
function linksFor(role) {
  const actor = { id: "", role, branchIds: [] };
  return LINKS.filter((link) => {
    if (link.area === null) return true;
    if (link.href === "/team" && scopeOf(actor, "team") === "own") return false;
    return can(actor, "view", link.area);
  }).map((link) => ({
    ...link,
    label:
      link.narrowLabel && seesOnlyOwnRecords(actor, link.area)
        ? link.narrowLabel
        : link.label,
  }));
}

export default function LeftRail({ role = "partner" }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const links = linksFor(role);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("phmg-rail") === "collapsed");
    } catch {
      // ignore: the rail just starts expanded
    }
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("phmg-rail", next ? "collapsed" : "open");
    } catch {
      // ignore
    }
  }

  return (
    <nav
      aria-label="Main"
      data-collapsed={collapsed}
      className="border-rule bg-surface relative z-10 flex shrink-0 flex-col gap-1 border-r p-2 transition-[width] duration-150 max-md:hidden"
      style={{ width: collapsed ? 56 : 208 }}
    >
      <div className="flex h-12 items-center gap-2 px-2">
        <span
          aria-hidden
          className="rounded-ledger bg-ink font-display text-13 text-surface grid size-7 shrink-0 place-items-center font-semibold"
        >
          P
        </span>
        {!collapsed && (
          <span className="font-display text-16 truncate font-semibold">
            PHMG
          </span>
        )}
      </div>

      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-current={active ? "page" : undefined}
            className={`rounded-ledger text-14 flex h-9 items-center gap-3 px-2 ${
              active
                ? "bg-carbon-wash text-carbon font-medium"
                : "text-ink-muted hover:bg-carbon-wash hover:text-ink"
            }`}
          >
            <Icon size={20} weight={active ? "duotone" : "regular"} />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className="rounded-ledger text-14 text-ink-muted hover:bg-carbon-wash hover:text-ink mt-auto flex h-9 items-center gap-3 px-2"
      >
        <CaretLeft
          size={20}
          className={
            collapsed
              ? "rotate-180 transition-transform"
              : "transition-transform"
          }
        />
        {!collapsed && <span>Collapse</span>}
      </button>
    </nav>
  );
}

/**
 * Phone layout (spec section 15: works at 390 px).
 *
 * Four links and a More sheet. Every link used to be rendered as a bottom
 * bar, which already filled the width for a Partner at nine of them — and
 * the rail is still growing. The current page is always one of the four, so
 * wherever somebody is, the bar shows where they are.
 */
const MOBILE_SHOWN = 4;

export function MobileNav({ role = "partner" }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const links = linksFor(role);

  const isActive = (href) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // whichever page they are on comes to the front, so it is never hidden
  const current = links.findIndex((link) => isActive(link.href));
  const shown =
    current >= MOBILE_SHOWN
      ? [...links.slice(0, MOBILE_SHOWN - 1), links[current]]
      : links.slice(0, MOBILE_SHOWN);
  const rest = links.filter((link) => !shown.includes(link));

  return (
    <>
      {moreOpen && rest.length > 0 && (
        <>
          {/* tapping anywhere else closes it */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
            className="bg-ink/20 fixed inset-0 z-20 md:hidden"
          />
          <div
            role="dialog"
            aria-label="More places"
            className="border-rule bg-surface fixed inset-x-0 bottom-12 z-30 border-t p-2 md:hidden"
          >
            <ul className="flex flex-col">
              {rest.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={`rounded-ledger text-14 flex h-11 items-center gap-3 px-3 ${
                      isActive(href)
                        ? "bg-carbon-wash text-carbon font-medium"
                        : "text-ink"
                    }`}
                  >
                    <Icon size={22} />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <nav
        aria-label="Main"
        className="border-rule bg-surface relative z-10 flex h-12 shrink-0 items-center justify-between gap-1 border-t px-2 md:hidden"
      >
        {shown.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`rounded-ledger grid size-10 place-items-center ${
                active ? "bg-carbon-wash text-carbon" : "text-ink-muted"
              }`}
            >
              <Icon size={22} weight={active ? "duotone" : "regular"} />
            </Link>
          );
        })}

        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-label={`More — ${rest.length} more places`}
            className={`rounded-ledger grid size-10 place-items-center ${
              moreOpen ? "bg-carbon-wash text-carbon" : "text-ink-muted"
            }`}
          >
            <DotsThree size={22} weight="bold" />
          </button>
        )}
      </nav>
    </>
  );
}
