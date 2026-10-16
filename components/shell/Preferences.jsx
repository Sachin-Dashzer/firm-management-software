"use client";

import { useEffect, useState } from "react";
import { Sun, MoonStars, Rows, List } from "@phosphor-icons/react";

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
      className="rounded-ledger text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
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
      className="rounded-ledger text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-8 place-items-center"
    >
      {density === "compact" ? <Rows size={18} /> : <List size={18} />}
    </button>
  );
}
