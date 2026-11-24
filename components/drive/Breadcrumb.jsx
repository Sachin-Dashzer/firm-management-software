"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretRight, DotsThree } from "@phosphor-icons/react";

/**
 * Where you are, and the way back (P3-48d).
 *
 * Every crumb is a link, and the trail is the route actually walked — a
 * person who came in by service walks back out by service, because the path
 * they remember is the one they took.
 *
 * A long trail collapses in the **middle**, never at the ends: the drive you
 * are in and the folder you are looking at are the two a person navigates
 * by. The hidden middle opens as a list rather than being gone.
 */
export default function Breadcrumb({ crumbs = [] }) {
  const [open, setOpen] = useState(false);

  /**
   * Five kept at the tail, not three.
   *
   * A job's trail is seven deep — Home, Clients, the client, Services, the
   * service, the year, the job — and collapsing to three dropped the
   * **client's name**, which is the one crumb that says whose papers these
   * are. Keeping five hides only "Clients", and Home is already there.
   */
  const long = crumbs.length > 6;
  const shown = long ? [crumbs[0], ...crumbs.slice(-5)] : crumbs;
  const hidden = long ? crumbs.slice(1, -5) : [];

  return (
    <nav
      aria-label="Where you are"
      className="text-13 -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-0.5"
    >
      {shown.map((crumb, i) => {
        const last = i === shown.length - 1;
        const gap = long && i === 1;

        return (
          <span key={`${crumb.href}-${i}`} className="flex items-center gap-1">
            {i > 0 && (
              <CaretRight
                size={11}
                weight="bold"
                aria-hidden="true"
                className="text-faint shrink-0"
              />
            )}

            {gap && (
              <span className="relative flex items-center">
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  aria-expanded={open}
                  aria-label="The folders in between"
                  className="rounded-control hover:bg-sunk text-faint flex h-6 items-center px-1"
                >
                  <DotsThree size={16} weight="bold" aria-hidden="true" />
                </button>

                {open && (
                  <ul className="rounded-ledger border-rule bg-surface absolute top-7 left-0 z-20 min-w-[12rem] border py-1">
                    {hidden.map((skipped) => (
                      <li key={skipped.href}>
                        <Link
                          href={skipped.href}
                          onClick={() => setOpen(false)}
                          className="hover:bg-sunk block truncate px-3 py-1.5"
                        >
                          {skipped.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                <CaretRight
                  size={11}
                  weight="bold"
                  aria-hidden="true"
                  className="text-faint shrink-0"
                />
              </span>
            )}

            {last ? (
              <span
                aria-current="page"
                className="font-medium whitespace-nowrap"
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-ink-muted hover:text-ink rounded-control whitespace-nowrap underline-offset-4 transition-colors duration-150 ease-out hover:underline"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
