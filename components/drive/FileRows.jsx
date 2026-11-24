"use client";

import { useState, useTransition } from "react";
import {
  FileText,
  FilePdf,
  Image as ImageIcon,
  Table,
} from "@phosphor-icons/react";
import { linkToDocument } from "@/app/(app)/documents/actions";
import { formatSize } from "@/lib/documents/rows";
import Chip from "@/components/ui/Chip";

/**
 * The files in the folder you are looking at (P3-48d).
 *
 * Under the folders, not beside them: in a drive, folders are the structure
 * and files are the contents, and a grid that mixes the two makes a person
 * read every tile to find out which is which.
 *
 * A row says what the file is, how big it is, who put it there and when —
 * and **Open** does the one thing: a PDF or a photograph opens in the page,
 * anything else downloads. Each open is a five-minute signed link and an
 * audit entry, as every read of the vault has always been.
 */
export default function FileRows({ files = [], mayMove = false, onMove }) {
  if (files.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-11 text-ink-muted font-semibold tracking-wide uppercase">
        {files.length} {files.length === 1 ? "file" : "files"} here
      </h2>

      <ul className="rounded-table border-rule divide-rule bg-surface divide-y border">
        {files.map((file) => (
          <Row key={file.id} file={file} mayMove={mayMove} onMove={onMove} />
        ))}
      </ul>
    </section>
  );
}

function Row({ file, mayMove = false, onMove }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const inPage = PREVIEWABLE.includes(file.mime);

  function open() {
    setError("");
    start(async () => {
      const result = await linkToDocument(file.id, { inline: inPage });
      if (result?.error) return setError(result.error);
      window.location.assign(result.url);
    });
  }

  const Glyph = glyphFor(file.mime);

  return (
    <li
      draggable={mayMove ? true : undefined}
      onDragStart={
        mayMove
          ? (event) => {
              event.dataTransfer.setData(
                "application/json",
                JSON.stringify({ kind: "file", id: file.id }),
              );
              event.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
    >
      <Glyph
        size={18}
        weight="regular"
        aria-hidden="true"
        className="text-ink-muted shrink-0"
      />

      <span className="min-w-0 flex-1">
        <span className="text-14 flex flex-wrap items-center gap-2 font-medium break-words">
          {file.name}
          {file.linked && (
            <Chip
              tone="neutral"
              title="It lives elsewhere; this folder points at it"
            >
              linked
            </Chip>
          )}
          {file.isPermanent && <Chip tone="info">permanent file</Chip>}
          {file.sharedWithClient && <Chip tone="good">shared</Chip>}
        </span>
        <span className="text-12 text-ink-muted block">
          {[
            file.from || null,
            file.uploadedByName ? `put up by ${file.uploadedByName}` : null,
            file.uploadedOn || null,
            file.versions
              ? `${file.versions} earlier ${file.versions === 1 ? "copy" : "copies"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>

      <span className="num text-13 text-ink-muted w-16 shrink-0 text-right">
        {formatSize(file.size)}
      </span>

      {file.redacted ? (
        <span className="text-13 text-ink-muted shrink-0">
          Erased on request
        </span>
      ) : (
        <span className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={open}
            disabled={pending}
            className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3 transition-colors duration-150 ease-out disabled:opacity-60"
          >
            {pending ? "Opening…" : "Open"}
          </button>
          {mayMove && !file.linked && (
            <button
              type="button"
              onClick={() => onMove?.(file)}
              className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3 transition-colors duration-150 ease-out"
            >
              Move
            </button>
          )}
        </span>
      )}

      {error && (
        <p role="alert" className="text-13 text-redpen basis-full">
          {error}
        </p>
      )}
    </li>
  );
}

/** What a browser will show in the page rather than download. */
const PREVIEWABLE = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function glyphFor(mime = "") {
  if (mime === "application/pdf") return FilePdf;
  if (mime.startsWith("image/")) return ImageIcon;
  if (/sheet|excel|csv/i.test(mime)) return Table;
  return FileText;
}
