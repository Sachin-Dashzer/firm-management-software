"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CaretDown, X } from "@phosphor-icons/react";

/**
 * A dropdown you can type into (D109, 02-11-2026).
 *
 * The firm has hundreds of clients and two dozen services, and both were
 * chosen from a native `<select>` — which on a laptop means a list the
 * length of the window, scrolled with a mouse, and no way to type
 * "kaur" and land on Kaur Brothers. Every list in this application is
 * searchable except the two that decide what a piece of work *is*.
 *
 * It is a real combobox, not a styled select: `role="combobox"` over a
 * `role="listbox"`, arrow keys move `aria-activedescendant`, Enter picks,
 * Escape closes and puts back what was chosen. The value the form posts is
 * a hidden input, so the surrounding `<form>` and its `FormData` do not
 * know or care that the control is not a select.
 *
 * Deliberately no library. `cmdk` is already here for the command bar, but
 * it brings its own focus and portal behaviour, and this needs to sit
 * inside a form and post a value — which is thirty lines, not a
 * dependency.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.name] the field the chosen id posts under
 * @param {string} props.value the chosen id
 * @param {(id: string) => void} props.onChange
 * @param {Array<{id: string, label: string, hint?: string, group?: string}>} props.options
 * @param {string} [props.placeholder] shown when nothing is chosen
 * @param {boolean} [props.required]
 * @param {boolean} [props.disabled]
 * @param {string} [props.footnote] a line under the control
 */
export default function Combobox({
  label,
  name,
  value,
  onChange,
  options,
  placeholder = "Type to search…",
  required = false,
  disabled = false,
  footnote,
  className = "",
}) {
  const id = useId();
  const input = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const chosen = options.find((option) => option.id === value) ?? null;

  /**
   * Every word has to match, in any order and anywhere: "kaur gst" finds
   * "GSTR-1 / GSTR-3B filing — Kaur Brothers", and typing a code works
   * because the code is in the haystack too.
   */
  const found = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return options.slice(0, 60);
    return options
      .filter((option) => {
        const hay = `${option.label} ${option.hint ?? ""} ${
          option.group ?? ""
        }`.toLowerCase();
        return words.every((word) => hay.includes(word));
      })
      .slice(0, 60);
  }, [options, query]);

  function pick(option) {
    if (!option) return;
    onChange(option.id);
    setQuery("");
    setOpen(false);
    input.current?.blur();
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setCursor(0);
        return;
      }
      setCursor((at) => {
        const next = event.key === "ArrowDown" ? at + 1 : at - 1;
        if (next < 0) return found.length - 1;
        if (next >= found.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      pick(found[cursor]);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setQuery("");
      setOpen(false);
    }
  }

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-13 text-ink-muted font-medium">
        {label}
        {required && <span className="text-redpen"> *</span>}
      </label>

      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setQuery("");
            setOpen(false);
          }
        }}
      >
        {name && <input type="hidden" name={name} value={value} />}

        <div
          className={`rounded-control border-rule bg-paper focus-within:border-carbon flex h-10 items-center gap-1.5 border px-2 ${
            disabled ? "opacity-60" : ""
          }`}
        >
          <input
            id={id}
            ref={input}
            type="text"
            role="combobox"
            autoComplete="off"
            disabled={disabled}
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={
              open && found[cursor] ? `${id}-option-${cursor}` : undefined
            }
            value={open ? query : (chosen?.label ?? "")}
            placeholder={chosen ? chosen.label : placeholder}
            onFocus={() => {
              setOpen(true);
              setCursor(0);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            className="text-14 placeholder:text-faint w-full min-w-0 bg-transparent outline-none"
          />

          {chosen && !disabled ? (
            <button
              type="button"
              aria-label={`Clear ${label.toLowerCase()}`}
              onClick={() => {
                onChange("");
                setQuery("");
                input.current?.focus();
              }}
              className="text-faint hover:text-ink shrink-0"
            >
              <X size={13} weight="bold" aria-hidden="true" />
            </button>
          ) : (
            <CaretDown
              size={12}
              weight="bold"
              aria-hidden="true"
              className="text-faint shrink-0"
            />
          )}
        </div>

        {open && (
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label={label}
            className="rounded-ledger border-rule bg-surface absolute z-30 mt-1 max-h-72 w-full overflow-auto border py-1 shadow-lg"
          >
            {found.map((option, index) => (
              <li
                key={option.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={option.id === value}
                onMouseEnter={() => setCursor(index)}
                onMouseDown={(event) => {
                  // mousedown, not click: the input's blur would close the
                  // list before a click ever landed
                  event.preventDefault();
                  pick(option);
                }}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 ${
                  index === cursor ? "bg-carbon-wash" : ""
                }`}
              >
                <span className="text-14 min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.group && (
                    <span className="text-12 text-ink-muted">
                      {option.group}
                    </span>
                  )}
                </span>
                {option.hint && (
                  <span className="num text-12 text-ink-muted shrink-0">
                    {option.hint}
                  </span>
                )}
              </li>
            ))}
            {found.length === 0 && (
              <li className="text-13 text-ink-muted px-3 py-2">
                Nothing matches “{query.trim()}”.
              </li>
            )}
          </ul>
        )}
      </div>

      {footnote && <span className="text-12 text-ink-muted">{footnote}</span>}
    </div>
  );
}
