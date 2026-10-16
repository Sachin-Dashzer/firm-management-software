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
  Gear,
  CaretLeft,
} from "@phosphor-icons/react";

/* Phase 1 destinations. Pages arrive in their own steps; the rail links to
   them from the start so the shape of the app is visible. */
const LINKS = [
  { href: "/today", label: "Today", icon: House },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/engagements", label: "Engagements", icon: Briefcase },
  { href: "/calendar", label: "Compliance", icon: CalendarCheck },
  { href: "/invoices", label: "Billing", icon: Receipt },
  { href: "/reports", label: "Reports", icon: ChartBar },
  { href: "/settings", label: "Settings", icon: Gear },
];

export default function LeftRail() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("phmg-rail") === "collapsed");
    } catch {
      // ignore: rail just starts expanded
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

      {LINKS.map(({ href, label, icon: Icon }) => {
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
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="border-rule bg-surface relative z-10 flex shrink-0 justify-between gap-1 border-t px-2 py-1 md:hidden"
    >
      {LINKS.map(({ href, label, icon: Icon }) => {
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
