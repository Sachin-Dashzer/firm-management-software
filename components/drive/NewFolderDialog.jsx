"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createFolder,
  renameFolder,
} from "@/app/(app)/documents/folders/actions";
import { checkName } from "@/lib/folders/rules";

/**
 * Naming a folder (P3-48d).
 *
 * An inline panel rather than a modal, which is the idiom this app already
 * uses for "are you sure" and for a reason before a write-off: no focus
 * trap, no portal, no scroll lock, and it reads in the place it acts on.
 *
 * **The rules are checked here with the same function the server uses**, so
 * the message about a name is the message the server would give, and it
 * arrives while the cursor is still in the box. The server checks again
 * inside its transaction, which is where two people typing the same name at
 * the same moment is actually decided.
 */
export default function NewFolderDialog({
  parentPath,
  parentType = "folder",
  siblings = [],
  /** Renaming instead of making: the folder, and its current name. */
  renaming = null,
  onClose,
}) {
  const router = useRouter();
  const box = useRef(null);
  const [name, setName] = useState(renaming?.label ?? "");
  const [message, setMessage] = useState(null);
  const [pending, start] = useTransition();

  /**
   * On the next frame, not this one.
   *
   * The menu item that opened this panel is removed in the same commit,
   * and the browser then moves focus to the body of its own accord —
   * after our effect has run, undoing it. The browser test caught it: the
   * box was there and the cursor was not in it.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const others = renaming
    ? siblings.filter((s) => s !== renaming.label)
    : siblings;
  const checked = checkName(name, { parentType, siblings: others });
  const tooSoon = name.trim().length === 0;

  function save(event) {
    event.preventDefault();
    if (!checked.ok) {
      setMessage({ error: checked.error, suggest: checked.suggest });
      return;
    }

    start(async () => {
      const result = renaming
        ? await renameFolder(renaming.id, checked.name)
        : await createFolder({ parentPath, name: checked.name });

      if (result?.error) {
        setMessage({ error: result.error, suggest: result.suggest });
        return;
      }
      router.refresh();
      onClose?.(result);
    });
  }

  return (
    <form
      onSubmit={save}
      aria-label={renaming ? "Rename this folder" : "Name the new folder"}
      className="rounded-ledger border-rule bg-surface flex flex-wrap items-end gap-2 border p-3"
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-12 text-ink-muted">
          {renaming ? "New name" : "Folder name"}
        </span>
        <input
          ref={box}
          autoFocus
          value={name}
          maxLength={80}
          onChange={(event) => {
            setName(event.target.value);
            setMessage(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose?.();
          }}
          placeholder="Bank statements"
          className="rounded-control border-rule bg-paper text-14 h-9 w-full border px-2"
        />
      </label>

      <button
        type="submit"
        disabled={pending || tooSoon}
        className="rounded-control bg-carbon text-on-carbon text-13 h-9 px-3 font-medium transition-opacity duration-150 ease-out disabled:opacity-50"
      >
        {pending ? "Saving…" : renaming ? "Rename" : "Make the folder"}
      </button>
      <button
        type="button"
        onClick={() => onClose?.()}
        className="rounded-control border-rule hover:bg-sunk text-13 h-9 border px-3 transition-colors duration-150 ease-out"
      >
        Cancel
      </button>

      {(message?.error || (!checked.ok && !tooSoon)) && (
        <p role="alert" className="text-13 text-redpen basis-full">
          {message?.error ?? checked.error}{" "}
          {(message?.suggest ?? checked.suggest) && (
            <button
              type="button"
              onClick={() => {
                setName(message?.suggest ?? checked.suggest);
                setMessage(null);
              }}
              className="underline underline-offset-4"
            >
              Use &ldquo;{message?.suggest ?? checked.suggest}&rdquo;
            </button>
          )}
        </p>
      )}
    </form>
  );
}
