"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import Uploader from "@/components/documents/Uploader";
import DocumentList from "@/components/documents/DocumentList";

/**
 * A client's files (spec section 6).
 *
 * The permanent file sits at the top — PAN card, incorporation certificate,
 * MOA/AOA, GST certificate — because it is the part every engagement
 * references instead of asking the client again. Everything else is listed
 * by the engagement it came in on, and within each list by folder.
 *
 * A client with a thousand files cannot be read, only searched, so the box
 * at the top filters every section at once on the file's name and its
 * folder. Sections with nothing matching disappear while a search is
 * running rather than standing empty, because a screen of empty headings
 * hides the few rows that did match.
 */
export default function DocumentsPanel({
  clientId,
  permanent,
  byEngagement,
  folders = [],
  mayEdit,
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  const needle = query.trim().toLowerCase();
  const match = useMemo(() => {
    if (!needle) return () => true;
    return (d) =>
      d.name.toLowerCase().includes(needle) ||
      (d.folder ?? "").toLowerCase().includes(needle);
  }, [needle]);

  const permanentShown = permanent.filter(match);
  const groupsShown = byEngagement
    .map((group) => ({ ...group, documents: group.documents.filter(match) }))
    .filter((group) => !needle || group.documents.length > 0);

  const total =
    permanent.length +
    byEngagement.reduce((sum, group) => sum + group.documents.length, 0);
  const shown =
    permanentShown.length +
    groupsShown.reduce((sum, group) => sum + group.documents.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
          <span className="text-12 text-ink-muted">
            Search this client&rsquo;s files by name or folder
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. bank statement, 26AS, GST returns"
            className="rounded-control border-rule bg-paper text-14 text-ink h-9 border px-2"
          />
        </label>
        <p className="text-13 text-ink-muted self-end pb-1">
          {needle ? (
            <>
              <span className="num">{shown}</span> of{" "}
              <span className="num">{total}</span> files
            </>
          ) : (
            <>
              <span className="num">{total}</span>{" "}
              {total === 1 ? "file" : "files"}
            </>
          )}
        </p>
      </div>

      {folders.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-12 text-ink-muted">Folders:</span>
          {folders.map((folder) => (
            <button
              key={folder}
              type="button"
              onClick={() =>
                setQuery(needle === folder.toLowerCase() ? "" : folder)
              }
              aria-pressed={needle === folder.toLowerCase()}
              className={`text-13 underline underline-offset-4 ${
                needle === folder.toLowerCase() ? "text-brass-ink" : ""
              }`}
            >
              {folder}
            </button>
          ))}
        </div>
      )}

      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">Permanent file</h2>
          <p className="text-13 text-ink-muted">
            Documents that do not change year to year. Any engagement can use
            these without asking the client again.
          </p>
        </div>

        <DocumentList
          documents={permanentShown}
          mayDelete={mayEdit}
          mayMakePermanent={mayEdit}
          clientId={clientId}
          folders={folders}
          onChange={refresh}
          empty={
            needle
              ? "Nothing in the permanent file matches."
              : "Nothing in the permanent file yet."
          }
        />

        {mayEdit && (
          <Uploader
            clientId={clientId}
            permanent
            folders={folders}
            label="Add to the permanent file"
            onDone={refresh}
          />
        )}
      </section>

      {groupsShown.map((group) => (
        <section
          key={group.id}
          className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4"
        >
          <h2 className="font-display text-15 font-semibold">{group.title}</h2>
          <p className="text-13 text-ink-muted font-mono">{group.code}</p>
          <DocumentList
            documents={group.documents}
            mayDelete={mayEdit}
            mayMakePermanent={mayEdit}
            clientId={clientId}
            folders={folders}
            onChange={refresh}
          />
        </section>
      ))}

      {byEngagement.length === 0 && (
        <p className="text-14 text-ink-muted">
          No files have come in on an engagement yet.
        </p>
      )}

      {needle && byEngagement.length > 0 && groupsShown.length === 0 && (
        <p className="text-14 text-ink-muted">
          No engagement file matches “{query.trim()}”.
        </p>
      )}
    </div>
  );
}
