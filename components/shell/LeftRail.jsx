"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Users,
  Briefcase,
  CalendarCheck,
  Receipt,
  ChartBar,
  ClipboardText,
  Gear,
  CaretLeft,
} from "@phosphor-icons/react";
import { can } from "@/lib/permissions";

/**
 * Phase 1 destinations. `area` is the permission area from spec section 2, so
 * a link only appears for a role that may open it — the page itself checks
 * again, because hiding a link is not security.
 */
const LINKS = [
  { href: "/today", label: "Today", icon: House, area: "dashboards" },
  { href: "/clients", label: "Clients", icon: Users, area: "clients" },
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
  { href: "/invoices", label: "Billing", icon: Receipt, area: "invoices" },
  { href: "/reports", label: "Reports", icon: ChartBar, area: "dashboards" },
  { href: "/audit", label: "Audit log", icon: ClipboardText, area: "auditLog" },
  { href: "/settings", label: "Settings", icon: Gear, area: "usersSettings" },
];

/** @param {string} role */
function linksFor(role) {
  const actor = { id: "", role, branchIds: [] };
  return LINKS.filter((link) => can(actor, "view", link.area));
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

/** Phone layout: the same destinations as a bottom bar (spec: works at 390 px). */
export function MobileNav({ role = "partner" }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="border-rule bg-surface relative z-10 flex shrink-0 justify-between gap-1 border-t px-2 py-1 md:hidden"
    >
      {linksFor(role).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
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
    </nav>
  );
}
