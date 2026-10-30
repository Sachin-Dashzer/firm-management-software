"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * What is behind the box, without leaving the grid (P3-34).
 *
 * The compliance grid is eight hundred boxes, and the question a partner
 * asks of one of them — who has it, when is it due, what has been filed —
 * is small enough that navigating away from the grid to answer it loses
 * more than it gives. So the answer opens over the box.
 *
 * Two things it does not do, deliberately:
 *
 *  - **It does not fetch.** Everything it shows came down with the cell.
 *    A popover that loads is a spinner over a grid, and the data for one
 *    cell is eight fields.
 *  - **It does not trap focus.** It is a popover, not a dialog that owns
 *    the screen. Focus goes into it on open and back to the box on close,
 *    which is what makes it reachable from the keyboard; Tab out of it
 *    closes nothing, and Escape closes it.
 *
 * ponytail: the panel hangs below the box with a nudge if it would run
 * off the right edge. If the grid ever needs it to flip above as well —
 * on a short phone, say — that is the point to reach for a real
 * positioning library and not before.
 *
 * @param {object} props
 * @param {string} props.title the heading, which also names the dialog
 * @param {string} [props.triggerLabel] the box's own `aria-label`
 * @param {string} [props.triggerClassName]
 * @param {object} [props.triggerProps] anything the grid needs on the box
 *   itself — `tabIndex` and `onKeyDown` for roving focus, `style`
 * @param {React.ReactNode} props.trigger what is drawn in the box
 * @param {React.ReactNode|((close: () => void) => React.ReactNode)} props.children
 */
export default function CellPopover({
  title,
  trigger,
  triggerLabel,
  triggerClassName = "",
  triggerProps = {},
  children,
}) {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(0);
  const wrap = useRef(null);
  const panel = useRef(null);
  const button = useRef(null);
  const titleId = useId();

  // closing from the keyboard puts focus back on the box, so the arrow
  // keys carry on from where they were; closing by clicking elsewhere
  // does not, because the pointer has already said where it wants to be
  const close = (toBox = true) => {
    setOpen(false);
    setNudge(0);
    if (toBox) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    panel.current?.focus();

    // keep it on screen: the rightmost column of a wide grid would
    // otherwise open past the edge of the window
    const rect = panel.current?.getBoundingClientRect();
    if (rect && rect.right > window.innerWidth - 8) {
      setNudge(Math.round(window.innerWidth - 8 - rect.right));
    }

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
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

  return (
    <span ref={wrap} className="relative inline-block">
      <button
        ref={button}
        type="button"
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
        className={triggerClassName}
        {...triggerProps}
      >
        {trigger}
      </button>

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={{ marginLeft: nudge }}
          className="anim-pop rounded-ledger border-rule bg-surface absolute top-full left-0 z-30 mt-1 flex w-72 flex-col gap-2 border p-3 text-left shadow-lg"
        >
          <p id={titleId} className="text-13 font-semibold">
            {title}
          </p>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </span>
  );
}
