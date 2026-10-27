"use client";

import { useEffect, useState } from "react";
import { Sun, MoonStars, Rows, List, Stamp } from "@phosphor-icons/react";

/** Reads what the inline script in the root layout already applied. */
function current(attr, fallback) {
  if (typeof document === "undefined") return fallback;
  return document.documentElement.dataset[attr] || fallback;
}

function set(attr, key, value) {
  document.documentElement.dataset[attr] = value;
  try {
    localStorage.setItem(key, value);
  } catch {
    // private browsing or blocked storage: the choice just won't persist
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const systemDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    setTheme(current("theme", systemDark ? "dark" : "light"));
  }, []);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        set("theme", "phmg-theme", next);
        setTheme(next);
      }}
      title={next === "dark" ? "Night shift" : "Paper"}
      aria-label={`Switch to ${next === "dark" ? "Night shift" : "Paper"} theme`}
      className="rounded-control text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
    >
      {theme === "dark" ? <Sun size={18} /> : <MoonStars size={18} />}
    </button>
  );
}

export function DensityToggle() {
  const [density, setDensity] = useState("comfortable");

  useEffect(() => setDensity(current("density", "comfortable")), []);

  const next = density === "compact" ? "comfortable" : "compact";
  return (
    <button
      type="button"
      onClick={() => {
        set("density", "phmg-density", next);
        setDensity(next);
      }}
      title={`${next[0].toUpperCase()}${next.slice(1)} rows`}
      aria-label={`Switch to ${next} row density`}
      className="rounded-control text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
    >
      {density === "compact" ? <Rows size={18} /> : <List size={18} />}
    </button>
  );
}

/**
 * The eight signature moments of spec §15, on or off (P3-21b, D52).
 *
 * Off is the prototype and the default. On brings back the audit tick drawn
 * stroke by stroke, the stamp that presses onto a completed engagement, and
 * the paper grain — the ledger language Step 11 built and the owner set
 * aside on 26-10-2026.
 *
 * It is here rather than in Settings because it is a per-person reading
 * preference like the theme and the density beside it, not a firm-wide
 * decision: one partner wanting the stamp back does not change what anybody
 * else sees.
 */
export function MomentsToggle() {
  const [moments, setMoments] = useState("off");

  useEffect(() => setMoments(current("moments", "off")), []);

  const next = moments === "on" ? "off" : "on";
  return (
    <button
      type="button"
      onClick={() => {
        set("moments", "phmg-moments", next);
        setMoments(next);
      }}
      title={next === "on" ? "Ledger flourishes on" : "Ledger flourishes off"}
      aria-label={`Turn the ledger flourishes ${next}`}
      aria-pressed={moments === "on"}
      className="rounded-control text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
    >
      <Stamp size={18} weight={moments === "on" ? "fill" : "regular"} />
    </button>
  );
}
