"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DotsThreeVertical,
  PencilSimple,
  ArrowsOutCardinal,
  TrashSimple,
} from "@phosphor-icons/react";
import {
  deleteFolder,
  folderContents,
} from "@/app/(app)/documents/folders/actions";

/**
 * What can be done to one folder (P3-48d).
 *
 * Only on folders somebody made. A folder that comes from a record has no
 * menu at all rather than a menu of greyed-out words: there is nothing to
 * do to it here, and a disabled control that only explains itself on hover
 * is the thing this app keeps removing.
 *
 * **Delete asks with the count the server gives**, not with a guess: "and
 * the 14 files in it" is the difference between tidying up and losing a
 * year of bank statements, and the number comes from the same subtree the
 * delete will walk.
 */
export default function TileMenu({ folder, onRename, onMove }) {
  const router = useRouter();
  const wrap = useRef(null);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    function away(event) {
      if (!wrap.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function ask() {
    setOpen(false);
    start(async () => {
      const held = await folderContents(folder.id);
      if (held?.error) return setError(held.error);
      setAsking(held);
    });
  }

  function remove() {
    start(async () => {
      const result = await deleteFolder(folder.id);
      setAsking(null);
      if (result?.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <div ref={wrap} className="absolute top-1 right-1">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={`What to do with ${folder.label}`}
        className="rounded-control text-ink-muted hover:bg-sunk flex h-7 w-7 items-center justify-center opacity-0 transition-opacity duration-150 ease-out group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 focus-visible:opacity-100"
      >
        <DotsThreeVertical size={15} weight="bold" aria-hidden="true" />
      </button>

      {open && (
        <ul className="rounded-ledger border-rule bg-surface absolute top-8 right-0 z-30 min-w-[10rem] border py-1 text-left">
          <li>
            <Item
              icon={PencilSimple}
              onClick={() => {
                setOpen(false);
                onRename?.(folder);
              }}
            >
              Rename
            </Item>
          </li>
          <li>
            <Item
              icon={ArrowsOutCardinal}
              onClick={() => {
                setOpen(false);
                onMove?.(folder);
              }}
            >
              Move
            </Item>
          </li>
          <li>
            <Item icon={TrashSimple} onClick={ask} tone="text-redpen">
              Delete
            </Item>
          </li>
        </ul>
      )}

      {(asking || error) && (
        <div className="rounded-ledger border-rule bg-surface absolute top-8 right-0 z-30 w-64 border p-3 text-left">
          {error ? (
            <p role="alert" className="text-13 text-redpen">
              {error}
            </p>
          ) : (
            <p className="text-13">
              Delete <span className="font-medium">{asking.name}</span>
              {asking.files || asking.folders
                ? ` and the ${[
                    asking.files
                      ? `${asking.files} file${asking.files === 1 ? "" : "s"}`
                      : "",
                    asking.folders
                      ? `${asking.folders} folder${asking.folders === 1 ? "" : "s"}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" and ")} in it`
                : ""}
              ? It all goes to the recycle bin together.
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            {!error && (
              <button
                type="button"
                disabled={pending}
                onClick={remove}
                className="rounded-control border-redpen text-redpen text-13 h-8 border px-3 font-medium disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAsking(null);
                setError("");
              }}
              className="text-13 underline underline-offset-4"
            >
              {error ? "Close" : "Keep it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ icon: Glyph, onClick, tone = "", children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hover:bg-sunk text-13 flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150 ease-out ${tone}`}
    >
      <Glyph size={14} aria-hidden="true" />
      {children}
    </button>
  );
}
