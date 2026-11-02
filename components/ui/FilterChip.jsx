"use client";

import Link from "next/link";
import CountBadge from "./CountBadge";

/**
 * A group of rows, on or off, with how many are in it (D104).
 *
 * **A button, deliberately not `Chip`.** That one is a mark a row wears —
 * a status, a tone, a fact about the record. This one is a control
 * somebody presses, and giving the two the same shape would mean a pill
 * that is sometimes pressable and sometimes not, which is the single
 * commonest reason people stop trying to click things.
 *
 * Three screens drew their own copy of this before the file existed (the
 * inbox, Issues and the notice register), each with its own padding and
 * its own idea of where the count went. The count rides as a
 * `CountBadge`, which swaps its two colours when the chip is filled, so
 * there is no third value to keep in step with the theme.
 *
 * A group whose filter lives in the URL passes `href` instead of
 * `onClick` and gets the same chip as a link — the registers and the
 * notice board filter by navigation, and drawing their own chips next to
 * these was how three screens ended up with three paddings again.
 *
 * @param {object} props
 * @param {boolean} props.on
 * @param {() => void} [props.onClick] for a filter held in component state
 * @param {string} [props.href] for a filter held in the URL
 * @param {number} [props.count] omitted draws no badge, 0 still draws one
 */
export default function FilterChip({ on, onClick, href, count, children }) {
  const look = `rounded-chip text-13 flex shrink-0 items-center gap-1.5 border px-2.5 py-1 whitespace-nowrap ${
    on
      ? "border-carbon bg-carbon text-on-carbon font-medium"
      : "border-rule bg-surface text-ink-muted hover:text-ink hover:border-carbon"
  }`;

  const inner = (
    <>
      {children}
      {count != null && <CountBadge value={count} onAccent={on} />}
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-current={on ? "page" : undefined} className={look}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={look}>
      {inner}
    </button>
  );
}
