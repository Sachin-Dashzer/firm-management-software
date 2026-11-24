"use client";

import Link from "next/link";
import { Folder, Lock } from "@phosphor-icons/react";
import { formatSize } from "@/lib/documents/rows";
import FolderTile from "./FolderTile";

/**
 * The folders in this place, as tiles or as a list (P3-48d).
 *
 * Six columns on a wide monitor down to two on a phone — a folder's name is
 * the whole of its identity, so the tile is sized by what a name needs to
 * read, not by a column count somebody liked.
 *
 * The list is for the questions a grid cannot answer: which of these was
 * touched last, and which is holding the weight. Same rows, different
 * question, and the choice is remembered per person.
 */
export default function FolderGrid({
  folders = [],
  files = [],
  view = "grid",
  selected = "",
  showLocks = false,
  onFocusTile,
  addNew = null,
}) {
  if (view === "list") {
    return (
      <ListView
        folders={folders}
        files={files}
        showLocks={showLocks}
        addNew={addNew}
      />
    );
  }

  return (
    <div
      role="group"
      aria-label="Folders"
      className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3"
    >
      {addNew}
      {folders.map((folder) => (
        <FolderTile
          key={folder.segment}
          folder={folder}
          href={folder.href}
          selected={selected === folder.segment}
          showLock={showLocks}
          onFocus={() => onFocusTile?.(folder.segment)}
          menu={folder.menu ?? null}
        />
      ))}
    </div>
  );
}

/** Name, items, modified, size, uploaded by — the columns a grid hides. */
function ListView({ folders, files, showLocks, addNew }) {
  const rows = [
    ...folders.map((folder) => ({
      key: folder.segment,
      href: folder.href,
      name: folder.label,
      note: folder.sublabel,
      items: folder.count,
      modified: folder.updatedAt,
      size: null,
      by: "",
      system: folder.system,
    })),
    ...files.map((file) => ({
      key: file.id,
      href: null,
      name: file.name,
      note: file.from,
      items: null,
      modified: file.at,
      size: file.size,
      by: file.uploadedByName,
      system: false,
    })),
  ];

  return (
    <div className="flex flex-col gap-2">
      {addNew && <div className="flex">{addNew}</div>}

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left font-normal">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Items</th>
              <th className="px-3 py-2 font-medium">Modified</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Uploaded by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-rule border-b last:border-0">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    {row.href && (
                      <Folder
                        size={16}
                        weight="fill"
                        aria-hidden="true"
                        className="text-carbon shrink-0"
                      />
                    )}
                    {row.href ? (
                      <Link
                        href={row.href}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="pl-6">{row.name}</span>
                    )}
                    {row.system && showLocks && (
                      <Lock
                        size={11}
                        weight="bold"
                        aria-label="From the records"
                        className="text-faint shrink-0"
                      />
                    )}
                  </span>
                  {row.note && (
                    <span className="text-12 text-ink-muted num block pl-6">
                      {row.note}
                    </span>
                  )}
                </td>
                <td className="num text-13 text-ink-muted px-3 py-2">
                  {row.items ? row.items : "—"}
                </td>
                <td className="num text-13 text-ink-muted px-3 py-2">
                  {row.modified ? row.modified.slice(0, 10) : "—"}
                </td>
                <td className="num text-13 text-ink-muted px-3 py-2">
                  {row.size === null ? "—" : formatSize(row.size)}
                </td>
                <td className="text-13 text-ink-muted px-3 py-2">
                  {row.by || "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
