"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDraft,
  discardDraft,
  issueDoc,
  previewDoc,
} from "../../docs/actions";

/**
 * Documents generated from the firm's templates, on the engagement (P2-8b).
 *
 * A draft is a working paper: it is watermarked, it re-reads the record
 * every time it is opened, and discarding one costs nothing. Issuing is the
 * act that matters, so it is a separate button with the consequence written
 * beside it — and the server checks it again whatever this screen shows.
 */
export default function DocsPanel({ templates, docs, mayGenerate, mayIssue }) {
  const [message, setMessage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [chosen, setChosen] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(work) {
    startTransition(async () => {
      const result = await work();
      setMessage(result);
      if (result?.ok) router.refresh();
    });
  }

  function show(id) {
    if (preview?.id === id) return setPreview(null);
    startTransition(async () => {
      const result = await previewDoc(id);
      if (result.error) return setMessage(result);
      setPreview({ id, ...result });
    });
  }

  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-20">Documents from templates</h2>
        <p className="text-13 text-ink-muted">
          A draft can be regenerated any time. Issuing fixes the wording.
        </p>
      </div>

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`text-13 ${message.error ? "text-redpen" : "text-ink-muted"}`}
        >
          {message.error ?? message.ok}
        </p>
      )}

      {mayGenerate && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Start a draft from
            </span>
            <select
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
              className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
            >
              <option value="">Choose a template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.verified ? "" : " — not approved yet"}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!chosen || pending}
            onClick={() => run(() => createDraft(docs.engagementId, chosen))}
            className="rounded-ledger bg-carbon text-14 h-10 px-3 font-medium text-white disabled:opacity-60"
          >
            Start the draft
          </button>
        </div>
      )}

      {templates.length === 0 && (
        <p className="text-13 text-ink-muted">
          No templates yet. A partner adds them in Settings → Document
          templates.
        </p>
      )}

      {docs.rows.length === 0 ? (
        <p className="text-13 text-ink-muted">
          Nothing generated for this job yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {docs.rows.map((doc) => (
            <li
              key={doc.id}
              className="border-rule flex flex-col gap-2 border-b py-3 last:border-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-14 font-medium">{doc.name}</span>{" "}
                  <span
                    className={`text-12 rounded-ledger border px-1.5 py-0.5 ${
                      doc.final
                        ? "border-rule text-ink-muted"
                        : "border-waiting text-waiting"
                    }`}
                  >
                    {doc.final ? `Issued ${doc.issuedOn}` : "Draft"}
                  </span>
                  <p className="text-12 text-ink-muted">
                    {doc.final
                      ? `${doc.issuedByName}${doc.udin ? ` · UDIN ${doc.udin}` : ""}`
                      : `Started by ${doc.byName} · version ${doc.version}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => show(doc.id)}
                    className="rounded-ledger border-rule text-13 h-8 border px-2"
                  >
                    {preview?.id === doc.id ? "Hide" : "Read it"}
                  </button>
                  <a
                    href={`/docs/${doc.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-ledger border-rule text-13 flex h-8 items-center border px-2"
                  >
                    PDF
                  </a>
                  {/* the editable copy: a letter is usually tweaked before
                      it is sent, and a PDF cannot be */}
                  <a
                    href={`/docs/${doc.id}/docx`}
                    className="rounded-ledger border-rule text-13 flex h-8 items-center border px-2"
                  >
                    Word
                  </a>
                  {!doc.final && mayIssue && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => issueDoc(doc.id))}
                      className="rounded-ledger bg-carbon text-13 h-8 px-2 font-medium text-white disabled:opacity-60"
                    >
                      Issue
                    </button>
                  )}
                  {!doc.final && mayGenerate && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => discardDraft(doc.id))}
                      className="rounded-ledger border-rule text-13 h-8 border px-2"
                    >
                      Discard
                    </button>
                  )}
                </div>
              </div>

              {preview?.id === doc.id && (
                <div className="rounded-ledger border-rule bg-paper flex flex-col gap-2 border p-3">
                  {preview.gaps?.length > 0 && (
                    <p className="text-13 text-redpen">
                      Blank until the record is filled in:{" "}
                      {preview.gaps.map((gap) => gap.label).join(", ")}.
                    </p>
                  )}
                  {preview.unknown?.length > 0 && (
                    <p className="text-13 text-redpen">
                      This template asks for fields that do not exist:{" "}
                      {preview.unknown.join(", ")}. A partner has to correct it.
                    </p>
                  )}
                  <pre className="text-13 font-sans whitespace-pre-wrap">
                    {preview.text}
                  </pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
