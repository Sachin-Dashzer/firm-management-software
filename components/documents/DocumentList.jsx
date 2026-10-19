"use client";

import { useState, useTransition } from "react";
import {
  deleteDocument,
  linkToDocument,
} from "../../app/(app)/documents/actions";

/**
 * The files attached to something, with preview, download and delete
 * (spec section 6).
 *
 * No link is ever rendered into the page: every open asks the server, which
 * checks permission and writes the audit entry before handing back a link
 * that lives five minutes. A link that sat in the HTML would be a link that
 * outlived the check.
 */

const PREVIEWABLE = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export default function DocumentList({
  documents,
  mayDelete = false,
  onChange,
  empty = "Nothing attached yet.",
}) {
  const [message, setMessage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pending, startTransition] = useTransition();

  function open(document, inline) {
    startTransition(async () => {
      const result = await linkToDocument(document.id, { inline });
      if (result?.error) {
        setMessage(result);
        return;
      }
      if (inline) setPreview({ ...document, url: result.url });
      else window.location.assign(result.url);
    });
  }

  if (documents.length === 0) {
    return <p className="text-13 text-ink-muted">{empty}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {message?.error && (
        <p role="alert" className="text-13 text-redpen">
          {message.error}
        </p>
      )}
      {message?.ok && (
        <p role="status" className="text-13 text-filed">
          {message.ok}
        </p>
      )}

      <ul className="flex flex-col">
        {documents.map((d) => (
          <li
            key={d.id}
            className="border-rule flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"
          >
            <span className="min-w-0">
              <span className="text-14 block truncate">{d.name}</span>
              <span className="text-12 text-ink-muted">
                {formatSize(d.size)}
                {d.versions > 0 &&
                  ` · ${d.versions} earlier ${d.versions === 1 ? "version" : "versions"}`}
                {d.uploadedByName && ` · ${d.uploadedByName}`}
              </span>
            </span>
            <span className="text-13 flex shrink-0 gap-3">
              {PREVIEWABLE.includes(d.mime) && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => open(d, true)}
                  className="underline underline-offset-4 disabled:opacity-60"
                >
                  Preview
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => open(d, false)}
                className="underline underline-offset-4 disabled:opacity-60"
              >
                Download
              </button>
              {mayDelete && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteDocument(d.id);
                      setMessage(result);
                      if (result?.ok) onChange?.();
                    })
                  }
                  className="underline underline-offset-4 disabled:opacity-60"
                >
                  Delete
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {preview && (
        <div className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-13 font-medium">{preview.name}</p>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-13 underline underline-offset-4"
            >
              Close preview
            </button>
          </div>
          {preview.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[70vh] w-full object-contain"
            />
          ) : (
            <iframe
              src={preview.url}
              title={preview.name}
              className="h-[70vh] w-full"
            />
          )}
          <p className="text-12 text-ink-muted">
            This preview link stops working in five minutes.
          </p>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
