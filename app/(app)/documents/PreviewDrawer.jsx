"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "@phosphor-icons/react";
import { formatSize } from "@/lib/documents/rows";
import { linkToDocument } from "./actions";
import { fileActivity } from "./requests";

/**
 * One file, read without leaving the list (P3-48e).
 *
 * A drawer rather than a page, because the question it answers is usually
 * "is this the right one" — asked of six files in a row, where six page
 * loads and six journeys back is the whole afternoon.
 *
 * **What it shows besides the file**: the earlier copies, each downloadable,
 * because "which version did we send them" is the question behind most
 * requests to see a file at all; and that file's own audit entries, because
 * every view and download of a document has been recorded since the vault
 * was built (spec section 6) and the record is only useful where somebody
 * can see it.
 */
export default function PreviewDrawer({ file, mayEdit = false, onClose }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [activity, setActivity] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [pending, start] = useTransition();

  /**
   * The drawer is drawn on the body, not where it is written.
   *
   * `#content` is `relative z-10`, which is a stacking context: a
   * `z-50` overlay inside it still paints under the app's own top bar, and
   * the browser test caught exactly that — the drawer's heading and its
   * close button were hidden behind the bar, leaving a panel with no way
   * out. A portal puts it beside the app shell instead of inside it.
   */
  useEffect(() => setMounted(true), []);

  const inPage = PREVIEWABLE.includes(file.mime);

  useEffect(() => {
    setUrl("");
    setError("");
    if (!inPage || file.redacted) return;

    let alive = true;
    linkToDocument(file.id, { inline: true }).then((result) => {
      if (!alive) return;
      if (result?.error) setError(result.error);
      else setUrl(result.url);
    });
    return () => {
      alive = false;
    };
  }, [file.id, file.redacted, inPage]);

  useEffect(() => {
    let alive = true;
    fileActivity(file.id).then((rows) => {
      if (alive) setActivity(rows ?? []);
    });
    return () => {
      alive = false;
    };
  }, [file.id]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function download(versionId) {
    setError("");
    start(async () => {
      const result = await linkToDocument(file.id, { versionId });
      if (result?.error) return setError(result.error);
      window.location.assign(result.url);
    });
  }

  if (!mounted) return null;

  return createPortal(
    <>
      {/*
        It sat under the app's own top bar, which hid its heading and its
        close button, so the drawer read as a panel with no way out. It is
        a layer now: above the bar, with the page behind it dimmed, and
        clicking that page closes it.
      */}
      <button
        type="button"
        aria-label="Close the file"
        onClick={onClose}
        className="bg-plate/20 fixed inset-0 z-40 cursor-default"
      />
      <aside
        aria-label={file.name}
        className="border-rule bg-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-[32rem] flex-col gap-3 overflow-y-auto border-l p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-15 font-semibold break-words">{file.name}</h2>
            <p className="text-12 text-ink-muted">
              {[file.kind, formatSize(file.size), file.added]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-control hover:bg-sunk text-ink-muted flex h-8 w-8 shrink-0 items-center justify-center transition-colors duration-150 ease-out"
          >
            <X size={15} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <p role="alert" className="text-13 text-redpen">
            {error}
          </p>
        )}

        {file.redacted ? (
          <p className="text-13 text-ink-muted rounded-ledger border-rule border border-dashed px-3 py-6 text-center">
            Erased on a deletion request. The record of it stays; the file does
            not.
          </p>
        ) : inPage && url ? (
          file.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.name}
              className="rounded-ledger border-rule max-h-[50vh] w-full border object-contain"
            />
          ) : (
            <iframe
              src={url}
              title={file.name}
              className="rounded-ledger border-rule h-[50vh] w-full border"
            />
          )
        ) : inPage && !error ? (
          /* a PDF briefly showed a Download button while its signed link was
           still being fetched, which is the wrong control for a second */
          <p className="text-13 text-ink-muted rounded-ledger border-rule flex h-[50vh] items-center justify-center border border-dashed">
            Opening it…
          </p>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => download()}
            className="rounded-control bg-carbon text-on-carbon text-13 h-9 self-start px-3 font-medium disabled:opacity-60"
          >
            Download it
          </button>
        )}

        <dl className="text-13 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
          <Fact label="Client">
            <Link
              href={`/clients/${file.clientId}`}
              className="underline-offset-4 hover:underline"
            >
              {file.client}
            </Link>
          </Fact>
          <Fact label="Where it sits">
            {file.folderHref ? (
              <Link
                href={file.folderHref}
                className="underline-offset-4 hover:underline"
              >
                {file.where}
              </Link>
            ) : (
              file.where
            )}
          </Fact>
          <Fact label="Financial year">{file.fy || "—"}</Fact>
          <Fact label="Whose paper">
            {file.origin === "firm" ? "Issued by us" : "From the client"}
          </Fact>
          <Fact label="Shared with client">{file.shared ? "Yes" : "No"}</Fact>
          <Fact label="Put up by">{file.uploadedByName || "—"}</Fact>
        </dl>

        {file.versionList?.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-11 text-faint font-medium tracking-wide uppercase">
              Earlier copies
            </h3>
            <ul className="divide-rule border-rule rounded-table divide-y border">
              {file.versionList.map((version) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-13 text-ink-muted num">
                    {version.at} · {formatSize(version.size)}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => download(version.id)}
                    className="text-13 underline underline-offset-4 disabled:opacity-60"
                  >
                    Download
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-1">
          <h3 className="text-11 text-faint font-medium tracking-wide uppercase">
            What has happened to it
          </h3>
          {activity === null && (
            <p className="text-13 text-ink-muted">Reading the log…</p>
          )}
          {activity?.length === 0 && (
            <p className="text-13 text-ink-muted">
              Nothing since it was put up.
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {(activity ?? []).map((entry) => (
              <li key={entry.id} className="text-13 text-ink-muted">
                <span className="num">{entry.when}</span> · {entry.what}
                {entry.changes?.length > 0 && (
                  <span className="block pl-4">{entry.changes.join("; ")}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {mayEdit && (
          <p className="text-12 text-ink-muted">
            Renaming, moving and deleting are on the file where it sits — open
            it in the work drive.
          </p>
        )}
      </aside>
    </>,
    document.body,
  );
}

function Fact({ label, children }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

const PREVIEWABLE = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
