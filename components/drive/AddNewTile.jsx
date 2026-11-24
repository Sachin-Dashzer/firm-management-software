"use client";

import { useState } from "react";
import { Plus, FolderPlus, UploadSimple } from "@phosphor-icons/react";

/**
 * The one tile that is not a folder (P3-48d).
 *
 * It sits first in the grid, where the eye already is, and it offers **only
 * what this place allows**: at a level made of records there is no new
 * folder, and at Home there is no upload, because the firm's own papers
 * belong in HQ and a file at Home would be the same record read two ways.
 * A control that is offered and then refused teaches people to distrust the
 * screen, so the ones that cannot work are not drawn at all.
 */
export default function AddNewTile({
  mayAddFolder = false,
  mayUpload = false,
  onNewFolder,
  onUpload,
}) {
  const [open, setOpen] = useState(false);
  if (!mayAddFolder && !mayUpload) return null;

  const only = mayAddFolder !== mayUpload;

  /** With one thing to do, the tile does it rather than opening a menu. */
  function press() {
    if (only) return mayAddFolder ? onNewFolder?.() : onUpload?.();
    setOpen((was) => !was);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={press}
        aria-expanded={only ? undefined : open}
        className="rounded-ledger border-rule hover:border-carbon/50 hover:bg-carbon-soft text-ink-muted hover:text-carbon-ink focus-visible:border-carbon/50 focus-visible:bg-carbon-soft flex h-full w-full flex-col items-center gap-1.5 border border-dashed px-2 py-4 text-center transition-colors duration-150 ease-out outline-none"
      >
        <Plus size={30} weight="bold" aria-hidden="true" />
        <span className="text-13 leading-snug font-medium">
          {only ? (mayAddFolder ? "New folder" : "Upload") : "Add new"}
        </span>
      </button>

      {open && !only && (
        <ul className="rounded-ledger border-rule bg-surface absolute top-2 left-2 z-20 min-w-[11rem] border py-1">
          <li>
            <Item
              icon={FolderPlus}
              onClick={() => {
                setOpen(false);
                onNewFolder?.();
              }}
            >
              New folder
            </Item>
          </li>
          <li>
            <Item
              icon={UploadSimple}
              onClick={() => {
                setOpen(false);
                onUpload?.();
              }}
            >
              Upload files
            </Item>
          </li>
        </ul>
      )}
    </div>
  );
}

function Item({ icon: Glyph, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-sunk text-13 flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150 ease-out"
    >
      <Glyph size={15} aria-hidden="true" className="text-ink-muted" />
      {children}
    </button>
  );
}
