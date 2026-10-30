"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CountBadge from "./CountBadge";

/**
 * A row of choices where one is on, and the one that is on slides (P3-34).
 *
 * Used for the compliance view switch (By head / Status grid / Next 30
 * days), the clients page's Grouped / Flat list, the sign-off filter chips
 * and the annual season's tabs.
 *
 * **Why it slides.** These are the few controls on these screens that
 * change what you are looking at without reloading it, and the slide is
 * the sentence "the same thing, shown differently". Switch two static
 * pills and the eye has to find the new one; move one pill and the eye
 * follows it. 220ms, the same curve as everything else, and it never runs
 * on first paint — see `ready` below.
 *
 * **Why it measures rather than calculates.** The pills are as wide as
 * their words, and their words are data ("Next 30 days" against "By
 * head"). Anything other than reading `offsetLeft` and `offsetWidth` off
 * the live button is a guess that goes wrong the first time a label is
 * translated or a badge appears.
 *
 * **Before JavaScript has run**, and if it never does, the active item
 * carries the fill itself. The indicator is only rendered once there is a
 * measurement to put it at, and the two swap in one commit, so there is
 * no frame where nothing looks selected.
 *
 * Links get `aria-current`; buttons get a real tablist with
 * `aria-selected`. They are not mixed in one row — a link inside a
 * `role="tablist"` tells a screen reader two different stories about what
 * pressing it does.
 *
 * @param {object} props
 * @param {Array<{key: string, label: string, href?: string,
 *   badge?: {value: number|string, tone?: string}}>} props.items
 * @param {string} props.value the active item's key
 * @param {(key: string) => void} [props.onSelect] for button items
 * @param {"pill"|"underline"} [props.variant]
 * @param {string} props.label what the row chooses between
 */
export default function Segmented({
  items,
  value,
  onSelect,
  variant = "pill",
  label,
  className = "",
}) {
  const row = useRef(null);
  const [box, setBox] = useState(null);
  const links = items.some((item) => item.href);

  useEffect(() => {
    const node = row.current;
    if (!node) return;

    const measure = () => {
      const active = node.querySelector('[data-active="true"]');
      setBox(
        active ? { left: active.offsetLeft, width: active.offsetWidth } : null,
      );
    };

    measure();

    // the labels are data, so the row can reflow without the window
    // changing size — a font landing late is the usual cause
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [items, value]);

  const pill = variant === "pill";

  const itemClass = (active) =>
    pill
      ? `rounded-chip text-13 relative z-10 flex items-center gap-1.5 px-3 py-1.5 font-medium whitespace-nowrap ${
          active
            ? box
              ? "text-on-carbon"
              : "bg-carbon text-on-carbon"
            : "text-ink-muted hover:text-ink"
        }`
      : `text-14 relative z-10 flex items-center gap-1.5 border-b-2 px-1 pb-2 font-medium whitespace-nowrap ${
          active
            ? box
              ? "text-carbon border-transparent"
              : "text-carbon border-carbon"
            : "text-ink-muted hover:text-ink border-transparent"
        }`;

  const contents = items.map((item) => {
    const active = item.key === value;
    const inner = (
      <>
        {item.label}
        {item.badge != null && (
          <CountBadge
            value={item.badge.value}
            tone={item.badge.tone}
            onAccent={pill && active}
          />
        )}
      </>
    );

    return item.href ? (
      <Link
        key={item.key}
        href={item.href}
        data-active={active ? "true" : "false"}
        aria-current={active ? "page" : undefined}
        className={itemClass(active)}
      >
        {inner}
      </Link>
    ) : (
      <button
        key={item.key}
        type="button"
        role="tab"
        data-active={active ? "true" : "false"}
        aria-selected={active}
        onClick={() => onSelect?.(item.key)}
        className={itemClass(active)}
      >
        {inner}
      </button>
    );
  });

  const indicator = box && (
    <span
      aria-hidden="true"
      style={{
        transform: `translateX(${box.left}px)`,
        width: `${box.width}px`,
      }}
      className={
        pill
          ? "rounded-chip bg-carbon absolute top-1 bottom-1 left-0 transition-[transform,width] duration-200 ease-[var(--ease-out)]"
          : "bg-carbon absolute bottom-0 left-0 h-0.5 transition-[transform,width] duration-200 ease-[var(--ease-out)]"
      }
    />
  );

  const shell = `relative flex items-center ${
    pill
      ? // the track is as wide as its choices, not as wide as whatever it
        // was dropped into — a pill group stretched across a panel reads
        // as a toolbar rather than as one control
        "bg-sunk rounded-chip w-fit max-w-full gap-1 overflow-x-auto p-1"
      : "border-rule gap-5 overflow-x-auto border-b"
  } ${className}`;

  if (links) {
    return (
      <nav ref={row} aria-label={label} className={shell}>
        {indicator}
        {contents}
      </nav>
    );
  }

  return (
    <div ref={row} role="tablist" aria-label={label} className={shell}>
      {indicator}
      {contents}
    </div>
  );
}
