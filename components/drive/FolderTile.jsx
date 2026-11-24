"use client";

import Link from "next/link";
import { Folder, Lock } from "@phosphor-icons/react";

/**
 * One folder in the drive (P3-48d).
 *
 * The owner's reference is a grid of folder tiles, and `CLAUDE.md` rule 10
 * forbids "grids of identical shadowed cards" — the exception is approved
 * for this screen (decision D-F7), because a drive *is* a grid of folders
 * and any other shape would be a worse drive to argue a rule with. What the
 * rule is really against is still avoided: **these are not cards.** No
 * shadow, no box, no border at rest. The surface appears only under the
 * pointer.
 *
 * **Both lines under the name are facts.** The identifier a person searches
 * by — a client code, a job code — in mono, and then what is inside. The
 * first draft put explanations there instead ("PAN, incorporation, deeds"),
 * which looked like information, took the place of the file count, and told
 * a reader nothing they could act on. An explanation of what a folder is
 * for belongs in its empty state, where somebody is actually asking.
 *
 * The lock on a folder that comes from a record **appears on approach** —
 * hover or keyboard focus — rather than sitting on every tile at once. At
 * the Clients level every tile is a record, so a lock on each marks the
 * norm rather than the exception; it is the moment before somebody tries to
 * rename one that the fact is worth having.
 */
export default function FolderTile({
  folder,
  href,
  selected = false,
  showLock = false,
  onFocus,
  menu = null,
}) {
  const locked = folder.system && showLock;

  return (
    <div className="group/tile relative" {...(folder.drag ?? {})}>
      <Link
        href={href}
        onFocus={onFocus}
        data-drive-tile={folder.segment}
        aria-current={selected ? "true" : undefined}
        title={locked ? "Comes from the record, and is named by it" : undefined}
        draggable={folder.draggable ? true : undefined}
        onDragStart={
          folder.draggable
            ? (event) => {
                event.dataTransfer.setData(
                  "application/json",
                  JSON.stringify({
                    kind: "folder",
                    id: folder.segment.replace(/^f-/, ""),
                  }),
                );
                event.dataTransfer.effectAllowed = "move";
              }
            : undefined
        }
        className={`rounded-ledger flex h-full flex-col items-center gap-1.5 border px-2 py-4 text-center transition-colors duration-150 ease-out outline-none ${
          folder.dropping
            ? "border-carbon bg-carbon-soft"
            : selected
              ? "border-carbon/40 bg-carbon-soft"
              : "hover:bg-sunk border-transparent"
        } focus-visible:border-carbon/40 focus-visible:bg-carbon-soft`}
      >
        <Folder
          size={38}
          weight="fill"
          aria-hidden="true"
          className={selected ? "text-carbon-ink" : "text-carbon"}
        />

        <span className="text-13 line-clamp-2 leading-snug font-medium break-words">
          {folder.label}
        </span>

        {folder.sublabel && (
          <span className="num text-11 text-faint line-clamp-1 w-full">
            {folder.sublabel}
          </span>
        )}

        {folder.count ? (
          <span className="text-12 text-ink-muted">
            {folder.count} {folder.count === 1 ? "file" : "files"}
          </span>
        ) : null}

        {folder.status && (
          <span className="text-11 text-faint uppercase">{folder.status}</span>
        )}
      </Link>

      {locked && (
        <span
          aria-hidden="true"
          className="text-faint pointer-events-none absolute top-2 right-2 opacity-0 transition-opacity duration-150 ease-out group-focus-within/tile:opacity-100 group-hover/tile:opacity-100"
        >
          <Lock size={11} weight="bold" />
        </span>
      )}

      {menu}
    </div>
  );
}
