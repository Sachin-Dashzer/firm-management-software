"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { MagnifyingGlass } from "@phosphor-icons/react";

/**
 * The command bar (spec section 15, Ctrl/Cmd + K).
 *
 * Type a client name, a PAN, a GSTIN, an engagement code, an invoice
 * number or the name of a thing you want to do, and go straight there.
 *
 * Built on cmdk rather than by hand for one reason: the keyboard
 * behaviour *is* the feature, and a listbox that announces the
 * highlighted option correctly to a screen reader is more work to get
 * right than it looks. cmdk gives the combobox roles and
 * `aria-activedescendant` for free.
 *
 * What it searches is decided on the server, with the same scoping as the
 * lists, so this cannot find anything the signed-in person's own screens
 * would not show them.
 */

/** The things you can do, as opposed to find. Filtered by what you may do. */
const ACTIONS = [
  {
    title: "New engagement",
    href: "/engagements/new",
    area: "engagementsCreate",
  },
  { title: "New client", href: "/clients/new", area: "clients" },
  { title: "New invoice", href: "/invoices/new", area: "invoices" },
  { title: "Issues", href: "/issues", area: null },
  { title: "How we do things", href: "/learning", area: null },
  { title: "Data lab", href: "/lab", area: "engagementsWork" },
  { title: "Today", href: "/today", area: null },
  { title: "Notices", href: "/practice/notices", area: "practice" },
  {
    title: "Open a notice matter",
    href: "/practice/notices/new",
    area: "practice",
  },
  {
    title: "Overdue work",
    href: "/engagements?due=overdue",
    area: "engagementsWork",
  },
  {
    title: "Due this week",
    href: "/engagements?due=week",
    area: "engagementsWork",
  },
  {
    title: "Documents awaited from clients",
    href: "/reports/pending-documents",
    area: "documents",
  },
  {
    title: "Compliance grid",
    href: "/calendar?view=grid",
    area: "engagementsWork",
  },
  { title: "Receivables", href: "/invoices/receivables", area: "invoices" },
  {
    title: "Unbilled work",
    href: "/invoices/receivables?tab=unbilled",
    area: "invoices",
  },
  { title: "Reports", href: "/reports", area: null },
  { title: "Recycle bin", href: "/documents/bin", area: "documents" },
  { title: "Portal log", href: "/portal-log", area: "auditLog" },
  {
    title: "Messages and reminders",
    href: "/settings/messages",
    area: "usersSettings",
  },
  { title: "Team", href: "/team", area: "team" },
  { title: "My page", href: "/me", area: null },
  { title: "Change my password", href: "/change-password?from=me", area: null },
  { title: "Due dates", href: "/settings/due-dates", area: "serviceCatalog" },
];

export default function CommandBar({ allowed = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [groups, setGroups] = useState([]);
  const [searching, setSearching] = useState(false);
  const latest = useRef(0);

  const actions = ACTIONS.filter(
    (action) => !action.area || allowed.includes(action.area),
  );

  // Ctrl/Cmd + K from anywhere, and Escape out of it. Bound on the window
  // because the point of a command bar is that it works without first
  // finding something to click.
  useEffect(() => {
    function onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((was) => !was);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("phmg:command-bar", onOpen);
    return () => window.removeEventListener("phmg:command-bar", onOpen);
  }, []);

  // one search in flight at a time, and a late reply for an old term is
  // thrown away rather than flashing stale results over newer ones
  useEffect(() => {
    if (!open) return;
    const text = term.trim();
    if (text.length < 2) {
      setGroups([]);
      setSearching(false);
      return;
    }

    const ticket = ++latest.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(text)}`,
        );
        const data = await response.json();
        if (ticket === latest.current) setGroups(data.groups ?? []);
      } catch {
        if (ticket === latest.current) setGroups([]);
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    }, 160);

    return () => clearTimeout(timer);
  }, [term, open]);

  function go(href) {
    setOpen(false);
    setTerm("");
    router.push(href);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Search and commands"
      // cmdk does its own filtering; ours is the server's
      shouldFilter={false}
      className="fixed inset-0 z-50"
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => setOpen(false)}
      />

      <div className="rounded-ledger border-rule bg-surface absolute top-[12vh] left-1/2 w-[min(92vw,38rem)] -translate-x-1/2 border shadow-lg">
        <div className="border-rule flex items-center gap-2 border-b px-3">
          <MagnifyingGlass size={16} className="text-ink-muted shrink-0" />
          <Command.Input
            value={term}
            onValueChange={setTerm}
            placeholder="Client, PAN, GSTIN, invoice number, or what you want to do…"
            className="text-16 text-ink placeholder:text-ink-muted h-11 w-full bg-transparent outline-none"
          />
          <kbd className="text-12 text-ink-muted hidden font-mono sm:inline">
            Esc
          </kbd>
        </div>

        <Command.List className="max-h-[52vh] overflow-y-auto p-2">
          <Command.Empty className="text-13 text-ink-muted px-2 py-6 text-center">
            {term.trim().length < 2
              ? "Start typing a name, a number or a command."
              : searching
                ? "Looking…"
                : "Nothing matched."}
          </Command.Empty>

          {groups.map((group) => (
            <Command.Group
              key={group.heading}
              heading={group.heading}
              className="text-12 text-ink-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase"
            >
              {group.items.map((item) => (
                <Item key={item.id} onSelect={() => go(item.href)}>
                  <span className="text-14 text-ink truncate">
                    {item.title}
                  </span>
                  {item.hint && (
                    <span className="text-12 text-ink-muted truncate">
                      {item.hint}
                    </span>
                  )}
                </Item>
              ))}
            </Command.Group>
          ))}

          {/* actions are matched here rather than on the server: they are a
              short fixed list and need no database */}
          {actions.filter((action) => matches(action.title, term)).length >
            0 && (
            <Command.Group
              heading="Go to"
              className="text-12 text-ink-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase"
            >
              {actions
                .filter((action) => matches(action.title, term))
                .slice(0, 8)
                .map((action) => (
                  <Item key={action.href} onSelect={() => go(action.href)}>
                    <span className="text-14 text-ink">{action.title}</span>
                  </Item>
                ))}
            </Command.Group>
          )}
        </Command.List>

        <p className="border-rule text-12 text-ink-muted border-t px-3 py-2">
          <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd>{" "}
          to move, <kbd className="font-mono">↵</kbd> to open
        </p>
      </div>
    </Command.Dialog>
  );
}

/** Every letter typed, in order, somewhere in the title. */
function matches(title, term) {
  const text = term.trim().toLowerCase();
  if (!text) return true;
  const target = title.toLowerCase();
  let at = 0;
  for (const letter of text) {
    at = target.indexOf(letter, at);
    if (at === -1) return false;
    at += 1;
  }
  return true;
}

function Item({ onSelect, children }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="rounded-ledger data-[selected=true]:bg-carbon-wash flex cursor-pointer flex-col gap-0.5 px-2 py-2"
    >
      {children}
    </Command.Item>
  );
}
