"use client";

import { useId, useState, useTransition } from "react";
import {
  deleteDocument,
  linkToDocument,
  updateDocument,
} from "../../app/(app)/documents/actions";
import Uploader from "./Uploader";
import { UNFILED, groupByFolder } from "@/lib/documents/folders";

/**
 * The files attached to something, with preview, download and delete
 * (spec section 6).
 *
 * No link is ever rendered into the page: every open asks the server, which
 * checks permission and writes the audit entry before handing back a link
 * that lives five minutes. A link that sat in the HTML would be a link that
 * outlived the check.
 *
 * Files carry a **folder** — the document's `kind` — and the list puts them
 * under it. A folder is a label on the record, not a place in the vault: the
 * bytes stay where the gateway put them, so filing a document under a
 * different folder moves nothing and can never lose it. The headings appear
 * only once something has been filed, so a list of three files does not grow
 * dividers it does not need.
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
  /**
   * May this person correct a file in place (owner, 13-11-2026)?
   *
   * A PDF cannot be edited in a browser, so **Replace** means what it has
   * always meant in the vault: a corrected copy goes up and the one it
   * replaces stays behind it as a version. `confirmUpload` has taken
   * `replacesId` since the vault was built; this is the button for it.
   *
   * It needs `engagementId` or `clientId` to know where the new file may
   * go — the same check the first upload passed.
   */
  mayReplace = false,
  engagementId,
  clientId,
  /** Folder names already in use here, for the suggestions list. */
  folders = [],
  /**
   * May a file be moved in or out of the client's permanent file from here?
   *
   * Only where the whole client is in view. On an engagement or a UDIN the
   * list shows one job's papers, and "this belongs to the client for ever"
   * is not a judgement to make from inside one job.
   */
  mayMakePermanent = false,
  onChange,
  empty = "Nothing attached yet.",
}) {
  const [message, setMessage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [replacing, setReplacing] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [pending, startTransition] = useTransition();
  const listId = useId();

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

  const groups = groupByFolder(documents);
  const filed = groups.some((group) => group.folder);

  const row = (d) => (
    <li
      key={d.id}
      className="border-rule flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"
    >
      <span className="min-w-0">
        <span className="text-14 block truncate">{d.name}</span>
        <span className="text-12 text-ink-muted">
          {d.origin === "firm" ? "Issued by us · " : ""}
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
            View
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
        {/* the same permission as deleting: whoever may edit documents here */}
        {mayDelete && (
          <button
            type="button"
            disabled={pending}
            aria-expanded={renaming === d.id}
            onClick={() => setRenaming(renaming === d.id ? null : d.id)}
            className="underline underline-offset-4 disabled:opacity-60"
          >
            {renaming === d.id ? "Cancel" : "Rename / move"}
          </button>
        )}
        {mayReplace && (
          <button
            type="button"
            disabled={pending}
            aria-expanded={replacing === d.id}
            onClick={() => setReplacing(replacing === d.id ? null : d.id)}
            className="underline underline-offset-4 disabled:opacity-60"
          >
            {replacing === d.id ? "Cancel" : "Replace"}
          </button>
        )}
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

      {renaming === d.id && (
        <form
          className="rounded-ledger border-carbon bg-carbon-wash mt-1 flex w-full flex-wrap items-end gap-2 border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const name = String(form.get("name") ?? "").trim();
            if (!name) {
              setMessage({ error: "A file needs a name." });
              return;
            }
            startTransition(async () => {
              const result = await updateDocument(d.id, {
                name,
                kind: String(form.get("folder") ?? "").trim(),
                ...(mayMakePermanent
                  ? { permanent: form.get("permanent") === "on" }
                  : {}),
              });
              setMessage(result);
              if (result?.ok) {
                setRenaming(null);
                onChange?.();
              }
            });
          }}
        >
          <label className="text-12 text-ink-muted flex min-w-[12rem] flex-1 flex-col gap-1">
            Name
            <input
              name="name"
              defaultValue={d.name}
              required
              className="rounded-control border-rule bg-paper text-14 text-ink h-9 border px-2"
            />
          </label>
          <label className="text-12 text-ink-muted flex min-w-[12rem] flex-1 flex-col gap-1">
            Folder
            <input
              name="folder"
              defaultValue={d.folder ?? ""}
              list={`${listId}-folders`}
              placeholder="e.g. Bank statements"
              className="rounded-control border-rule bg-paper text-14 text-ink h-9 border px-2"
            />
          </label>
          {mayMakePermanent && (
            <label className="text-13 text-ink flex h-9 items-center gap-2">
              <input
                type="checkbox"
                name="permanent"
                defaultChecked={Boolean(d.isPermanent)}
                className="accent-brass size-4"
              />
              Permanent file
            </label>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
          >
            Save
          </button>
        </form>
      )}

      {replacing === d.id && (
        <div className="rounded-ledger border-carbon bg-carbon-wash mt-1 flex w-full flex-col gap-1 border p-3">
          <p className="text-12 text-ink-muted max-w-[72ch]">
            Put the corrected file up and it becomes the current one. Nothing is
            lost — this copy stays behind it as a version, and the change is on
            the job&rsquo;s record.
          </p>
          <Uploader
            engagementId={engagementId}
            clientId={clientId}
            replacesId={d.id}
            origin={d.origin === "firm" ? "firm" : "client"}
            label="Choose the corrected file"
            onDone={() => {
              setReplacing(null);
              onChange?.();
            }}
          />
        </div>
      )}
    </li>
  );

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

      <datalist id={`${listId}-folders`}>
        {folders.map((folder) => (
          <option key={folder} value={folder} />
        ))}
      </datalist>

      {filed ? (
        groups.map((group) => (
          <section key={group.folder || UNFILED} className="flex flex-col">
            <h4 className="text-12 text-brass-ink border-rule flex items-baseline gap-2 border-b pt-2 pb-1 font-medium tracking-wide uppercase">
              <span>{group.folder || UNFILED}</span>
              <span className="num text-ink-muted normal-case">
                {group.docs.length}
              </span>
            </h4>
            <ul className="flex flex-col">{group.docs.map(row)}</ul>
          </section>
        ))
      ) : (
        <ul className="flex flex-col">{groups[0].docs.map(row)}</ul>
      )}

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
