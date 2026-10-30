"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react";

/**
 * The one button that starts something (P3-34 phase 2).
 *
 * Before this there was a bare `+` in the bar that opened the command
 * palette — which is a search box, and a search box is a poor answer to
 * "I want to add a client". This lists the few things a person actually
 * starts, by name.
 *
 * **What it offers is decided on the server.** `items` arrives already
 * filtered by `can(actor, "edit", …)` in the app layout, so the menu
 * cannot offer a form the person will be refused at. That is manners, not
 * protection: every one of those routes checks again when it is opened.
 *
 * Keyboard: Down opens it and lands on the first item, Up on the last,
 * arrows move, Escape closes and gives the button its focus back.
 *
 * @param {object} props
 * @param {Array<{label: string, href: string}>} props.items
 */
export default function NewMenu({ items }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const button = useRef(null);
  const list = useRef(null);

  const close = (toButton = true) => {
    setOpen(false);
    if (toButton) button.current?.focus();
  };

  const focusItem = (index) => {
    const links = list.current?.querySelectorAll("a") ?? [];
    if (!links.length) return;
    const wrapped = (index + links.length) % links.length;
    links[wrapped].focus();
  };

  useEffect(() => {
    if (!open) return;

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const links = [...(list.current?.querySelectorAll("a") ?? [])];
      const at = links.indexOf(document.activeElement);
      if (at < 0) return;
      event.preventDefault();
      focusItem(at + (event.key === "ArrowDown" ? 1 : -1));
    };

    const onDown = (event) => {
      if (!wrap.current?.contains(event.target)) close(false);
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={wrap}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
          // the list is not in the document until the state lands
          requestAnimationFrame(() =>
            focusItem(event.key === "ArrowDown" ? 0 : -1),
          );
        }}
        className="rounded-control bg-carbon text-on-carbon text-13 ml-2 flex h-9 shrink-0 items-center gap-1.5 px-3 font-medium"
      >
        <Plus size={16} weight="bold" />
        <span className="hidden sm:inline">New</span>
      </button>

      {open && (
        <div
          ref={list}
          role="menu"
          aria-label="Start something new"
          className="anim-pop rounded-ledger border-rule bg-surface absolute right-0 z-30 mt-1.5 w-56 border p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              role="menuitem"
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-control text-14 hover:bg-carbon-wash block px-2 py-1.5"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
