"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The auditor's tick (spec section 15).
 *
 * Ticking an item draws a tick in ink — green when the item is verified,
 * red when it is the reviewer's own mark; un-ticking scratches it out.
 * The ink is laid down along the stroke rather than faded in, because
 * that is what a pen does, and it is the one place in the product where a
 * flourish belongs: somebody has just checked something.
 *
 * The animation only runs on a *change*, never on page load. A checklist
 * of forty verified items drawing itself every time the page opens would
 * be a cartoon, not a ledger.
 */

/** @param {{checked: boolean, tone?: "filed"|"redpen", size?: number, label?: string}} props */
export default function AuditTick({
  checked,
  tone = "filed",
  size = 20,
  label,
}) {
  const first = useRef(true);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (first.current) {
      // mounted with its answer already: no animation
      first.current = false;
      return;
    }
    setAnimate(true);
    const timer = setTimeout(() => setAnimate(false), 420);
    return () => clearTimeout(timer);
  }, [checked]);

  const colour = tone === "redpen" ? "var(--redpen)" : "var(--filed)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      className="shrink-0 overflow-visible"
    >
      {/* the box it is ticked in: always there, so the row never jumps */}
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="2"
        stroke="var(--rule)"
        strokeWidth="1.25"
      />

      {checked && (
        <path
          // a real pen's tick: short up-stroke, long down-stroke, past the box
          d="M6.5 12.8 L10.4 17.2 L19.6 5.6"
          stroke={colour}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={animate ? "ink-draw" : undefined}
          style={{ "--tick-length": 30 }}
        />
      )}

      {!checked && animate && (
        // scratched out: the two strokes a pen makes to cancel something
        <g
          stroke="var(--redpen)"
          strokeWidth="1.75"
          strokeLinecap="round"
          opacity="0.8"
        >
          <path
            d="M5.5 6 L18.5 18"
            className="ink-scratch"
            style={{ "--tick-length": 19 }}
          />
          <path
            d="M18.5 6 L5.5 18"
            className="ink-scratch"
            style={{ "--tick-length": 19, animationDelay: "90ms" }}
          />
        </g>
      )}
    </svg>
  );
}
