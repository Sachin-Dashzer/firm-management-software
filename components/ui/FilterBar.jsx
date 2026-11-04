"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  MagnifyingGlass,
  CaretDown,
  SlidersHorizontal,
  Check,
  X,
} from "@phosphor-icons/react";
import CountBadge from "./CountBadge";

/**
 * The filter strip above a server-rendered list (D107).
 *
 * **One toolbar of labelled controls.** What this replaces was a form:
 * eleven cells on a six-column grid, each with its label on a line of its
 * own above a stretched select. A person filtering a list is not filling
 * anything in, so the controls here size to their own content and each one
 * carries its label inside itself — "Status | Any" — which is one line of
 * text instead of two and still names what the dropdown is for.
 *
 * **Colour stays off it.** A set filter is drawn with the accent as a 1px
 * border and its value in full-strength ink; nothing is filled. A toolbar
 * where three controls are tinted teal is a toolbar nobody can scan, and
 * in this product colour means status (D35), not "you touched this".
 *
 * **The long tail goes in a panel.** The engagement list has ten filters
 * and four of them answer almost every question. The rest sit in a
 * slide-over, which is *always in the DOM* — off-canvas, `inert`, still
 * part of this form — so a filter set from a URL or a saved view survives
 * pressing Apply on the toolbar. Unmounting it would silently drop it.
 *
 * @param {object} props
 * @param {string} props.action the list's own path: where Clear goes, and where this submits
 * @param {string} [props.label] the accessible name for the search box
 * @param {boolean} [props.search] draw the search box; off for a list
 *   whose query builder has no free-text condition
 * @param {string} [props.placeholder] an example of what can be typed
 * @param {string} [props.value] the current search text
 * @param {boolean} [props.active] anything filtered at all, so Clear is worth drawing
 * @param {number} [props.extraCount] how many of the panel's filters are set
 * @param {React.ReactNode} [props.hidden] state that must survive a submit
 * @param {React.ReactNode} [props.primary] the filters that stay on the strip
 * @param {React.ReactNode} [props.toggles] yes/no filters, after the dropdowns
 * @param {React.ReactNode} [props.children] the filters inside the panel
 */
export default function FilterBar({
  action,
  label,
  placeholder,
  value = "",
  active = false,
  extraCount = 0,
  hidden,
  primary,
  toggles,
  children,
  search = true,
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const router = useRouter();

  /**
   * The browser's own GET submit would do, but it posts every field it
   * owns — so one click on "Only mine" produced
   * `?due=&service=&period=&tier=&priority=&branch=&group=`, eight empty
   * keys riding along in the address bar and into any view saved from it.
   * This keeps the ones with something in them, and navigates rather than
   * reloading, so filtering a list you are reading does not throw the whole
   * page away and start again.
   */
  const apply = (event) => {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key, field] of new FormData(event.currentTarget).entries()) {
      if (typeof field === "string" && field.trim())
        next.set(key, field.trim());
    }
    const query = next.toString();
    setOpen(false);
    router.push(query ? `${action}?${query}` : action);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <form
      method="get"
      action={action}
      onSubmit={apply}
      className="rounded-ledger border-rule bg-surface flex flex-wrap items-center gap-2 border p-2"
    >
      {hidden}

      {/*
        `search={false}` is for a list whose query builder has no free-text
        condition — the compliance screens, which filter by service,
        partner, year and branch and nothing else. Drawing the box there
        would put a control on the toolbar that silently does nothing,
        which is worse than not offering it.
      */}
      {search && (
        <>
          <label className="rounded-control border-rule bg-paper focus-within:border-carbon flex h-8 w-full min-w-0 items-center gap-2 border px-2.5 sm:w-72">
            <MagnifyingGlass
              size={14}
              weight="bold"
              aria-hidden="true"
              className="text-faint shrink-0"
            />
            <span className="sr-only">{label}</span>
            <input
              type="search"
              name="q"
              defaultValue={value}
              placeholder={placeholder ?? label}
              className="text-13 placeholder:text-faint w-full min-w-0 bg-transparent outline-none"
            />
          </label>

          {/* the hairline between what you type and what you choose */}
          <span
            aria-hidden="true"
            className="bg-rule hidden h-5 w-px sm:block"
          />
        </>
      )}

      {primary}
      {toggles}

      <div className="ms-auto flex items-center gap-2">
        {children && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls={panelId}
            className="rounded-control border-rule bg-paper text-13 text-ink-muted hover:text-ink hover:border-faint flex h-8 shrink-0 items-center gap-1.5 border px-2.5"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            More filters
            {extraCount > 0 && <CountBadge value={extraCount} />}
          </button>
        )}
        <button
          type="submit"
          className="rounded-control border-rule bg-sunk text-13 text-ink hover:border-faint h-8 border px-3 font-medium"
        >
          Apply
        </button>
        {active && (
          <Link
            href={action}
            className="text-13 text-ink-muted hover:text-ink px-1 hover:underline"
          >
            Clear
          </Link>
        )}
      </div>

      {children && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
            /* black, not `bg-ink/30`: ink inverts with the theme, so a scrim
               made from it lightens the dark theme instead of dimming it */
            className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${
              open ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          />
          <aside
            id={panelId}
            inert={!open}
            aria-label="More filters"
            className={`border-rule bg-surface fixed inset-y-0 right-0 z-50 flex w-[22rem] max-w-[90vw] flex-col border-l transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
              open ? "translate-x-0 shadow-2xl" : "translate-x-full"
            }`}
          >
            <div className="border-rule flex h-14 shrink-0 items-center justify-between border-b px-4">
              <h2 className="text-14 font-medium">More filters</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
                className="text-ink-muted hover:bg-sunk hover:text-ink rounded-control grid size-8 place-items-center"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              {children}
            </div>

            <div className="border-rule flex shrink-0 items-center justify-between gap-2 border-t p-4">
              <Link
                href={action}
                className="text-13 text-ink-muted hover:text-ink hover:underline"
              >
                Clear all
              </Link>
              <button
                type="submit"
                className="rounded-control bg-carbon text-13 text-on-carbon h-9 px-4 font-medium"
              >
                Apply filters
              </button>
            </div>
          </aside>
        </>
      )}
    </form>
  );
}

/**
 * One dropdown, wearing its own label.
 *
 * On the strip it is a pill: the label in the quiet grey, the value in ink.
 * Inside the panel (`block`) there is room for the label to sit above a
 * full-width control, which is the right shape there and the wrong one on
 * a toolbar.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.name the query parameter
 * @param {string} [props.value] what is chosen now
 * @param {string} [props.empty] the wording for "not filtered"
 * @param {Array<string|[string, string]>} props.options
 * @param {boolean} [props.block] the panel's shape, not the strip's
 */
export function FilterSelect({
  label,
  name,
  value = "",
  empty = "Any",
  options,
  block = false,
}) {
  /**
   * The choice is held here, not read back from the URL, so the pill says
   * what you just picked instead of what the page was loaded with.
   *
   * On the strip, picking also submits: a filter that needs a second click
   * on a button somewhere else before anything happens reads as broken.
   * Inside the panel it does not, because the panel's whole point is to set
   * several at once and apply them together.
   */
  const [current, setCurrent] = useState(value);
  const set = Boolean(current);
  const pairs = options.map((option) =>
    Array.isArray(option) ? option : [option, option],
  );
  const chosen = pairs.find(([key]) => key === current);

  const choose = (event) => {
    setCurrent(event.target.value);
    if (!block) event.target.form?.requestSubmit();
  };
  const items = (
    <>
      <option value="">{empty}</option>
      {pairs.map(([key, text]) => (
        <option key={key} value={key}>
          {text}
        </option>
      ))}
    </>
  );

  if (block) {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-12 text-ink-muted font-medium">{label}</span>
        <span className="relative flex">
          <select
            name={name}
            value={current}
            onChange={choose}
            className="rounded-control border-rule bg-paper text-14 text-ink h-9 w-full appearance-none border pr-8 pl-2.5"
          >
            {items}
          </select>
          <CaretDown
            size={12}
            weight="bold"
            aria-hidden="true"
            className="text-faint pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
          />
        </span>
      </label>
    );
  }

  /**
   * The chosen value is drawn as text and the real `<select>` lies over the
   * whole pill at zero opacity. A native select is as wide as its widest
   * option — "Income tax return — company" sets the width of a pill reading
   * "Any" — which is what left a hand's width of blank between every label
   * and its caret. Drawing the value means the pill is as wide as what it
   * says, and the dropdown still opens from it, still has a name, and still
   * works on a phone, because it is still a select.
   */
  return (
    <span
      className={`rounded-control bg-paper has-[:focus-visible]:outline-brass relative inline-flex h-8 shrink-0 items-center gap-1.5 border pr-2 pl-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
        set ? "border-carbon" : "border-rule hover:border-faint"
      }`}
    >
      <span className="text-12 text-faint shrink-0">{label}</span>
      <span
        className={`text-13 max-w-36 truncate ${
          set ? "text-ink font-medium" : "text-ink-muted"
        }`}
      >
        {chosen ? chosen[1] : empty}
      </span>
      <CaretDown
        size={11}
        weight="bold"
        aria-hidden="true"
        className="text-faint shrink-0"
      />
      {/* `bg-paper text-ink` is invisible under `opacity-0` and is there for
          the option list, which the browser paints from these two. */}
      <select
        name={name}
        aria-label={label}
        value={current}
        onChange={choose}
        className="bg-paper text-ink absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:outline-none"
      >
        {items}
      </select>
    </span>
  );
}

/**
 * A yes/no filter. Still a checkbox — it posts with the form and the
 * keyboard reaches it — wearing the strip's pill so it sits level with the
 * dropdowns, and marked with a tick rather than a fill when it is on.
 *
 * @param {object} props
 * @param {string} props.name
 * @param {boolean} [props.on]
 */
export function FilterToggle({ name, on = false, children }) {
  /* Held here for the same reason as the dropdown above: the tick has to
     appear on the click, not after a round trip to the server. */
  const [checked, setChecked] = useState(on);

  return (
    <label
      className={`rounded-control bg-paper text-13 has-[:focus-visible]:outline-brass flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border px-2.5 whitespace-nowrap has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
        checked
          ? "border-carbon text-ink font-medium"
          : "border-rule text-ink-muted hover:text-ink hover:border-faint"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        value="1"
        checked={checked}
        onChange={(event) => {
          setChecked(event.target.checked);
          event.target.form?.requestSubmit();
        }}
        className="sr-only"
      />
      {checked ? (
        <Check
          size={12}
          weight="bold"
          aria-hidden="true"
          className="text-carbon"
        />
      ) : (
        <span
          aria-hidden="true"
          className="border-faint size-3 rounded-[3px] border"
        />
      )}
      {children}
    </label>
  );
}
