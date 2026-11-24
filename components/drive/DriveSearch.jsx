"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { searchDrive } from "@/app/(app)/documents/folders/actions";

/**
 * Finding something in the drive (P3-48d, brief §9.3).
 *
 * Two modes, because they answer different questions: **in this folder** is
 * "where did I put it", and **everywhere** is "does the firm have one".
 * Inside a folder the first is the default, since somebody who has walked
 * four levels down is almost always asking the narrower question.
 *
 * The answers are grouped by what they are — a folder, a client, a service,
 * a job, a file — and each one opens where it lives. A single ranked list
 * would bury the client under forty files with the client's name in them.
 */
export default function DriveSearch({ here = [], label = "this folder" }) {
  const box = useRef(null);
  const [q, setQ] = useState("");
  const [everywhere, setEverywhere] = useState(here.length === 0);
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();

  /** `/` puts the cursor here, Escape clears and lets go. */
  useEffect(() => {
    function onKey(event) {
      const target = event.target;
      const typing =
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable]");

      if (event.key === "/" && !typing) {
        event.preventDefault();
        box.current?.focus();
      }
      if (event.key === "Escape" && box.current === document.activeElement) {
        setQ("");
        setResult(null);
        box.current.blur();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setResult(null);
      return;
    }
    // a pause, so a four-letter name is one search and not four
    const timer = setTimeout(() => {
      start(async () => {
        const found = await searchDrive({
          q: needle,
          under: everywhere ? undefined : here,
        });
        setResult(found);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, everywhere, here]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="relative">
          <MagnifyingGlass
            size={14}
            aria-hidden="true"
            className="text-faint pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
          />
          <input
            ref={box}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Find a folder, a client, a file"
            aria-label="Find in the drive"
            className="rounded-control border-rule bg-paper text-13 h-8 w-56 border pr-7 pl-7"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setResult(null);
              }}
              aria-label="Clear the search"
              className="text-faint hover:text-ink absolute top-1/2 right-1.5 -translate-y-1/2"
            >
              <X size={13} weight="bold" aria-hidden="true" />
            </button>
          )}
        </span>

        {here.length > 0 && (
          <button
            type="button"
            onClick={() => setEverywhere((was) => !was)}
            className="text-12 text-ink-muted hover:text-ink underline underline-offset-4"
          >
            {everywhere ? "everywhere" : `in ${label}`}
          </button>
        )}
      </div>

      {q.trim().length >= 2 && (
        <div
          role="region"
          aria-label="What was found"
          className="rounded-ledger border-rule bg-surface absolute top-10 right-0 z-30 max-h-[26rem] w-[22rem] overflow-y-auto border p-2"
        >
          {pending && !result && (
            <p className="text-13 text-ink-muted px-2 py-1">Looking…</p>
          )}

          {result?.error && (
            <p role="alert" className="text-13 text-redpen px-2 py-1">
              {result.error}
            </p>
          )}

          {result?.groups?.length === 0 && (
            <p className="text-13 text-ink-muted px-2 py-1">
              Nothing matches {q.trim()}
              {everywhere ? "" : ` in ${label}`}.
            </p>
          )}

          {result?.groups?.map((group) => (
            <section key={group.key} className="mb-1 last:mb-0">
              <h3 className="text-11 text-faint px-2 py-1 font-medium tracking-wide uppercase">
                {group.label}
                {group.capped && " · first 50"}
              </h3>
              <ul>
                {group.rows.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.href}
                      onClick={() => setQ("")}
                      className="hover:bg-sunk rounded-control flex items-baseline justify-between gap-2 px-2 py-1.5 transition-colors duration-150 ease-out"
                    >
                      <span className="text-13 min-w-0 break-words">
                        {row.label}
                      </span>
                      {row.note && (
                        <span className="num text-11 text-faint shrink-0">
                          {row.note}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
