"use client";

import { useEffect, useState } from "react";

/**
 * The rubber stamp (spec section 15).
 *
 * When an engagement is marked Completed, a stamp reading COMPLETED —
 * with the UDIN where the work carries one — presses onto the page at a
 * slight angle. Ink texture comes from an SVG turbulence filter, which is
 * genuinely the right tool: it makes the edges bite unevenly the way a
 * rubber stamp does, and costs nothing to download.
 *
 * It presses only when the status has just changed. A stamp that re-presses
 * every time somebody opens a finished engagement would stop meaning
 * anything by the second visit, so one that was already there is simply
 * drawn in place.
 */

/** @param {{udin?: string, on?: string, by?: string, justNow?: boolean}} props */
export default function CompletionStamp({ udin, on, by, justNow = false }) {
  const [pressing, setPressing] = useState(justNow);

  useEffect(() => {
    if (!justNow) return;
    const timer = setTimeout(() => setPressing(false), 460);
    return () => clearTimeout(timer);
  }, [justNow]);

  return (
    <div
      className={`pointer-events-none select-none ${
        pressing ? "stamp-press" : "stamp-set"
      }`}
    >
      <svg
        viewBox="0 0 260 112"
        className="w-full max-w-[260px]"
        role="img"
        aria-label={`Completed${on ? ` on ${on}` : ""}${by ? ` by ${by}` : ""}${
          udin ? `, UDIN ${udin}` : ""
        }`}
      >
        <defs>
          {/* the uneven bite of a rubber stamp on paper */}
          <filter id="stamp-ink" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="3"
              seed="7"
              result="grain"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="grain"
              scale="2.4"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>

        <g
          filter="url(#stamp-ink)"
          fill="none"
          stroke="var(--filed)"
          opacity="0.88"
        >
          <rect x="6" y="6" width="248" height="100" rx="6" strokeWidth="3.5" />
          <rect
            x="13"
            y="13"
            width="234"
            height="86"
            rx="4"
            strokeWidth="1.25"
            opacity="0.7"
          />

          <text
            x="130"
            y="52"
            textAnchor="middle"
            fill="var(--filed)"
            stroke="none"
            fontFamily="var(--font-sans), sans-serif"
            fontSize="30"
            fontWeight="700"
            letterSpacing="5"
          >
            COMPLETED
          </text>

          <line
            x1="34"
            x2="226"
            y1="64"
            y2="64"
            strokeWidth="1"
            opacity="0.55"
          />

          <text
            x="130"
            y="80"
            textAnchor="middle"
            fill="var(--filed)"
            stroke="none"
            fontFamily="var(--font-mono), monospace"
            fontSize="11"
            letterSpacing="1.4"
          >
            {udin ? `UDIN ${udin}` : "PHMG & ASSOCIATES"}
          </text>

          {on && (
            <text
              x="130"
              y="94"
              textAnchor="middle"
              fill="var(--filed)"
              stroke="none"
              fontFamily="var(--font-mono), monospace"
              fontSize="10"
              opacity="0.75"
              letterSpacing="1"
            >
              {on}
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}
