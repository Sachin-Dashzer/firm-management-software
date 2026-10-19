"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * The case file's folder dividers (spec section 15: "switching tabs slides
 * the divider, not the whole page").
 *
 * The tabs are still ordinary links with the section in the URL, so a tab
 * can be bookmarked and the back button works. What moves is a brass
 * divider along the bottom edge: the component stays mounted while only
 * the query changes, which is what lets it glide from one tab to the next
 * instead of jumping.
 *
 * It measures rather than guesses, because the tab labels are words of
 * different lengths in a font that may still be loading.
 */
export default function FolderTabs({ tabs, active, hrefFor, label }) {
  const nav = useRef(null);
  const [bar, setBar] = useState(null);

  useEffect(() => {
    function measure() {
      const container = nav.current;
      if (!container) return;
      const current = container.querySelector('[aria-current="page"]');
      if (!current) return setBar(null);

      const box = current.getBoundingClientRect();
      const frame = container.getBoundingClientRect();
      setBar({ left: box.left - frame.left, width: box.width });
    }

    measure();
    // the labels move when the font arrives or the window changes shape
    const observer = new ResizeObserver(measure);
    if (nav.current) observer.observe(nav.current);
    document.fonts?.ready?.then(measure);
    return () => observer.disconnect();
  }, [active]);

  return (
    <nav
      ref={nav}
      className="border-rule relative flex flex-wrap gap-1 border-b"
      aria-label={label}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-t-ledger text-14 -mb-px border border-b-0 px-3 py-2 ${
              isActive
                ? "border-rule bg-surface text-ink font-medium"
                : "text-ink-muted hover:text-ink border-transparent"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}

      {bar && (
        <span
          aria-hidden="true"
          className="bg-brass pointer-events-none absolute -bottom-px h-0.5 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ left: bar.left, width: bar.width }}
        />
      )}
    </nav>
  );
}
