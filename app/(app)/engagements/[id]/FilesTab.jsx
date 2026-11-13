"use client";

import { useState, useTransition } from "react";
import Segmented from "@/components/ui/Segmented";
import Uploader from "@/components/documents/Uploader";
import DocEditor from "./DocEditor";
import RequestPanel from "./RequestPanel";
import { linkToDocument } from "../../documents/actions";
import { previewDoc } from "../../docs/actions";

/**
 * The Files tab: everything this job has, in one list (owner, 13-11-2026).
 *
 * ## The first attempt, and what was wrong with it
 *
 * It separated the documents the firm wrote from the files people
 * uploaded, gave each group its own heading and its own explaining
 * sentence, and drew them as two different shapes with two different sets
 * of buttons — *Read it, Edit the words, PDF, Word* against *View,
 * Download, Edit*. Seven words for what are really two things a person
 * wants to do, and a split that exists because of how the two are stored,
 * which is the system's problem and not the reader's.
 *
 * So: **one list, one row, two buttons.**
 *
 *  - **Open** shows it. A letter opens its words, a PDF or a photograph
 *    opens in the page, anything else downloads. One verb, because from
 *    where the reader sits it is one act.
 *  - **Edit** changes it. A letter opens its words in a box; a file takes
 *    a corrected copy, and the one it replaces stays behind it. Also one
 *    act: fix this, keep what it said before.
 *
 * Nothing is deleted here and nothing new is attached here. Both are
 * decisions, and a decision belongs on the step doing the work.
 *
 * ## The switch
 *
 * **By our side / By client side** is `Document.origin`, which the vault
 * has recorded since it was built and this screen never asked. A letter
 * written from a template is always ours. Each row then says in plain
 * words what it is and what happened to it, so nothing depends on
 * knowing which of the two kinds it is underneath.
 */
export default function FilesTab({
  engagementId,
  documents = [],
  letters = null,
  mayEdit = false,
  /**
   * The upload links we have given the client, and the button that makes
   * another — as figures, not as a rendered panel. It is the client's
   * side of the job, so it sits under the client's side of this list and
   * nowhere else.
   */
  docRequests = null,
}) {
  const [side, setSide] = useState("firm");

  const written = (letters?.docs?.rows ?? []).map((doc) => ({
    id: `doc-${doc.id}`,
    docId: doc.id,
    kind: "letter",
    name: doc.name,
    at: doc.at ?? "",
    what: "Letter we wrote",
    said: doc.sentOn
      ? `sent to the client on ${doc.sentOn} · cannot be changed now`
      : doc.final
        ? `signed off by ${doc.issuedByName || "the firm"} on ${doc.issuedOn} · cannot be changed now`
        : `still a draft, started by ${doc.byName}`,
    /**
     * A letter that has been signed off is not rewritten — a fresh one
     * replaces it. Rather than a greyed button nobody can use, the row
     * simply has no Edit and its own line says why: a dead control that
     * only explains itself on hover is the thing this screen was
     * rewritten to stop doing.
     */
    fixed: Boolean(doc.final),
  }));

  const uploaded = documents.map((d) => ({
    id: `file-${d.id}`,
    fileId: d.id,
    kind: "file",
    name: d.name,
    mime: d.mime,
    origin: d.origin,
    at: d.at ?? "",
    what: fileWord(d.mime),
    said: [
      d.uploadedByName ? `put up by ${d.uploadedByName}` : "uploaded",
      d.uploadedOn || "",
      d.versions > 0
        ? `${d.versions} earlier ${d.versions === 1 ? "copy" : "copies"} kept`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
    fixed: false,
  }));

  const ours = [...written, ...uploaded.filter((r) => r.origin === "firm")];
  const theirs = uploaded.filter((r) => r.origin !== "firm");
  const by = (a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0);
  ours.sort(by);
  theirs.sort(by);

  const rows = side === "firm" ? ours : theirs;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-display text-18 font-semibold">Files</h2>
        <Segmented
          label="Whose documents to show"
          value={side}
          onSelect={setSide}
          items={[
            {
              key: "firm",
              label: "By our side",
              badge: ours.length ? { value: ours.length } : undefined,
            },
            {
              key: "client",
              label: "By client side",
              badge: theirs.length ? { value: theirs.length } : undefined,
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-14 text-ink-muted rounded-ledger border-rule border border-dashed px-3 py-8 text-center">
          {side === "firm"
            ? "Nothing of ours on this job yet. Letters and working papers appear here as the steps produce them."
            : "The client has not sent anything in yet. Ask them for it on the step that needs it."}
        </p>
      ) : (
        <ul className="border-rule rounded-ledger divide-rule divide-y border">
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              engagementId={engagementId}
              mayEdit={mayEdit}
            />
          ))}
        </ul>
      )}

      {side === "client" && docRequests && (
        <RequestPanel engagementId={engagementId} {...docRequests} />
      )}
    </section>
  );
}

/**
 * One line of the list, whichever of the two kinds it is.
 *
 * Open and Edit are the same two buttons in the same two places on every
 * row; what they open is what differs. That is the whole point of the
 * rewrite — a reader learns the row once.
 */
function Row({ row, engagementId, mayEdit }) {
  const [open, setOpen] = useState(null);
  const [text, setText] = useState(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const inPage =
    row.kind === "file" &&
    ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      row.mime,
    );

  function openIt() {
    if (open === "read") return setOpen(null);
    setError("");
    startTransition(async () => {
      if (row.kind === "letter") {
        const result = await previewDoc(row.docId);
        if (result?.error) return setError(result.error);
        setText(result.text ?? "");
        setOpen("read");
        return;
      }
      const result = await linkToDocument(row.fileId, { inline: inPage });
      if (result?.error) return setError(result.error);
      // not something a browser shows: opening it means getting it
      if (!inPage) return window.location.assign(result.url);
      setUrl(result.url);
      setOpen("read");
    });
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-14 font-medium break-words">{row.name}</p>
          <p className="text-13 text-ink-muted">
            {row.what} · {row.said}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={openIt}
            aria-expanded={open === "read"}
            className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3 disabled:opacity-60"
          >
            {open === "read" ? "Close" : "Open"}
          </button>
          {mayEdit && !row.fixed && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(open === "edit" ? null : "edit")}
              aria-expanded={open === "edit"}
              className="rounded-control border-carbon text-carbon hover:bg-carbon-wash text-13 h-8 border px-3 font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              {open === "edit" ? "Cancel" : "Edit"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-13 text-redpen">
          {error}
        </p>
      )}

      {open === "read" && row.kind === "letter" && (
        <div className="flex flex-col gap-2">
          <div className="rounded-ledger border-rule bg-sunk text-13 max-h-[26rem] overflow-auto border p-3 leading-relaxed whitespace-pre-wrap">
            {text}
          </div>
          <p className="text-12 text-ink-muted flex gap-3">
            <a
              href={`/docs/${row.docId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Save as PDF
            </a>
            <a
              href={`/docs/${row.docId}/docx`}
              className="underline underline-offset-4"
            >
              Save as Word
            </a>
          </p>
        </div>
      )}

      {open === "read" && row.kind === "file" && url && (
        <div className="flex flex-col gap-1">
          {row.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={row.name}
              className="rounded-ledger border-rule max-h-[60vh] w-full border object-contain"
            />
          ) : (
            <iframe
              src={url}
              title={row.name}
              className="rounded-ledger border-rule h-[60vh] w-full border"
            />
          )}
          <p className="text-12 text-ink-muted">
            This stops working in five minutes, for safety.
          </p>
        </div>
      )}

      {open === "edit" && row.kind === "letter" && (
        <DocEditor
          docId={row.docId}
          saveLabel="Save the changes"
          onSaved={() => setOpen(null)}
        />
      )}

      {open === "edit" && row.kind === "file" && (
        <div className="flex flex-col gap-2">
          <p className="text-13 text-ink-muted max-w-[72ch]">
            Choose the corrected file and it becomes the one everybody sees.
            Nothing is lost — this copy stays behind it.
          </p>
          <Uploader
            engagementId={engagementId}
            replacesId={row.fileId}
            origin={row.origin === "firm" ? "firm" : "client"}
            label="Choose the corrected file"
            onDone={() => setOpen(null)}
          />
        </div>
      )}
    </li>
  );
}

/** What this file is, in a word a person would use. */
function fileWord(mime = "") {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Photo";
  if (/sheet|excel|csv/i.test(mime)) return "Spreadsheet";
  if (/word|officedocument\.word/i.test(mime)) return "Word file";
  if (mime.startsWith("text/")) return "Text file";
  return "File";
}
