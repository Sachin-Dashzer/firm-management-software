"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Notice, { Result } from "@/components/ui/Notice";
import Action from "@/components/ui/Action";
import {
  createDraft,
  discardDraft,
  issueAndSend,
  issueDoc,
  previewDoc,
  resetDraftText,
  saveDraftText,
  sendDocToClient,
} from "../../docs/actions";

/**
 * Documents generated from the firm's templates, on the engagement (P2-8b,
 * made editable and sendable 03-11-2026).
 *
 * ## What changed, and why
 *
 * The panel could *read* a draft and not change a word of it. The way out
 * was the **Word** button: download it, edit it on a laptop, attach it to
 * a personal email — and the firm's record of what it had sent the client
 * was a template nobody had actually sent. The record and the letter had
 * quietly come apart.
 *
 * So the draft is editable here and sendable from here:
 *
 *  - **Edit** opens the resolved wording in a box. Saving latches the
 *    draft to those words — it stops re-resolving from the client record,
 *    because re-reading would throw the edit away — and **Reset to the
 *    template** is the way back.
 *  - **Issue and send** is the owner's one click. It issues (which is what
 *    puts the firm's name on it) and then emails it to the client's
 *    contacts, with the wording in the body of the email.
 *
 * ## The one thing not simplified away
 *
 * **A draft cannot be emailed.** Issuing is the gate — the tier's
 * signatory, the UDIN where the service needs one, and no unresolved
 * placeholders — and a draft is watermarked working paper. Sending one
 * would be a way round all three. "Issue and send" is one button, not one
 * step: both checks still run on the server, and either can refuse.
 */
export default function DocsPanel({
  templates,
  docs,
  mayGenerate,
  mayIssue,
  /**
   * Drop the card and the heading, for the panel rendered **inside a step**
   * (owner, 12-11-2026).
   *
   * The letter used to live only on the Letters tab, so a step that said
   * "draft the certificate" sent people to another tab to do it and
   * another to come back. The same panel is now embedded in the step that
   * asks for the letter and in the reviewer's step, where a CA reads it,
   * corrects it and approves. One component, three places: an editor
   * written twice is a wording bug waiting to happen.
   */
  bare = false,
  /**
   * May a draft be thrown away here (owner, 13-11-2026)?
   *
   * Off on the Files tab, which is the register: it reads what the job
   * has and corrects it, and nothing is removed from a register. The
   * step that started the draft, and the Letters tab that is about to
   * send it, both still offer the way out.
   */
  mayDiscard = true,
  /** The checklist row this panel belongs to, when it is inside one. */
  checklistItemId = null,
  /** The empty line, when the step already says what the letter is for. */
  empty = "Nothing generated for this job yet.",
}) {
  const [message, setMessage] = useState(null);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ title: "", bodyText: "" });
  const [note, setNote] = useState("");
  const [chosen, setChosen] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(work, { close = false } = {}) {
    startTransition(async () => {
      const result = await work();
      setMessage(result);
      if (result?.ok) {
        if (close) {
          setEditing(null);
          setOpen(null);
        }
        router.refresh();
      }
    });
  }

  /** Read it, or stop reading it. */
  function show(id) {
    if (open?.id === id) {
      setOpen(null);
      setEditing(null);
      return;
    }
    startTransition(async () => {
      const result = await previewDoc(id);
      if (result.error) return setMessage(result);
      setOpen({ id, ...result });
      setEditing(null);
    });
  }

  /**
   * Edit it. The box opens on whatever the document currently reads as —
   * the resolved template the first time, the person's own words after
   * that — so editing never starts from a blank page or from text that is
   * not what the panel has just shown.
   */
  function edit(id) {
    if (editing === id) return setEditing(null);
    startTransition(async () => {
      const result = open?.id === id ? open : await previewDoc(id);
      if (result.error) return setMessage(result);
      setOpen({ id, ...result });
      setDraft({ title: result.title ?? "", bodyText: result.text ?? "" });
      setEditing(id);
    });
  }

  const Frame = bare ? "div" : "section";

  return (
    <Frame
      className={
        bare
          ? "flex flex-col gap-3"
          : "rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
      }
    >
      {!bare && (
        <div>
          <h2 className="font-display text-15 font-semibold">
            Letters and documents
          </h2>
          <p className="text-13 text-ink-muted max-w-[72ch]">
            Generated from the firm&rsquo;s templates, editable here, and sent
            to the client from here — so what the client received is what the
            file says they received.
          </p>
        </div>
      )}

      <Result message={message} />

      {/*
        One template, one button. Inside a step the template is already
        decided — the catalog row names it — so a picker with one entry
        would be a control with no decision in it.
      */}
      {mayGenerate && templates.length === 1 && (
        <div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                createDraft(
                  docs.engagementId,
                  templates[0].id,
                  checklistItemId,
                ),
              )
            }
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
          >
            {pending ? "Starting…" : `Draft the ${templates[0].name}`}
          </button>
          {!templates[0].verified && (
            <p className="text-12 text-ink-muted mt-1">
              This template&rsquo;s wording is not approved yet, so it drafts
              watermarked until a partner approves it.
            </p>
          )}
        </div>
      )}

      {mayGenerate && templates.length > 1 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Start a draft from
            </span>
            <select
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
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
            onClick={() =>
              run(() => createDraft(docs.engagementId, chosen, checklistItemId))
            }
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
          >
            Start the draft
          </button>
        </div>
      )}

      {templates.length === 0 && !bare && (
        <p className="text-13 text-ink-muted">
          No templates yet. A partner adds them in Settings → Templates.
        </p>
      )}

      {docs.rows.length === 0 ? (
        <p className="text-13 text-ink-muted rounded-ledger border-rule border border-dashed px-3 py-6 text-center">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.rows.map((doc) => (
            <li
              key={doc.id}
              className="rounded-ledger border-rule bg-paper flex flex-col gap-2 border p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-14 flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{doc.name}</span>
                    <span
                      className={`text-12 rounded-chip border px-1.5 py-0.5 ${
                        doc.final
                          ? "border-filed text-filed"
                          : "border-waiting text-waiting"
                      }`}
                    >
                      {doc.final ? `Issued ${doc.issuedOn}` : "Draft"}
                    </span>
                    {doc.edited && !doc.final && (
                      <span className="text-12 rounded-chip border-carbon text-carbon border px-1.5 py-0.5">
                        Edited by hand
                      </span>
                    )}
                    {doc.sentOn && (
                      <span className="text-12 rounded-chip border-filed text-filed border px-1.5 py-0.5">
                        Sent {doc.sentOn}
                      </span>
                    )}
                  </p>
                  <p className="text-12 text-ink-muted">
                    {doc.final
                      ? `${doc.issuedByName}${doc.udin ? ` · UDIN ${doc.udin}` : ""}`
                      : `Started by ${doc.byName} · version ${doc.version}`}
                    {doc.edited && doc.editedByName
                      ? ` · edited by ${doc.editedByName}`
                      : ""}
                    {doc.sentTo?.length
                      ? ` · went to ${doc.sentTo.join(", ")}`
                      : ""}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => show(doc.id)}
                    aria-expanded={open?.id === doc.id}
                    className="rounded-control border-rule hover:bg-carbon-wash text-13 h-8 border px-2"
                  >
                    {open?.id === doc.id ? "Hide" : "Read it"}
                  </button>
                  {!doc.final && mayGenerate && (
                    <button
                      type="button"
                      onClick={() => edit(doc.id)}
                      aria-expanded={editing === doc.id}
                      className="rounded-control border-carbon hover:bg-carbon-wash text-13 h-8 border px-2 font-medium"
                    >
                      {editing === doc.id ? "Stop editing" : "Edit the words"}
                    </button>
                  )}
                  <a
                    href={`/docs/${doc.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-control border-rule hover:bg-carbon-wash text-13 flex h-8 items-center border px-2"
                  >
                    PDF
                  </a>
                  <a
                    href={`/docs/${doc.id}/docx`}
                    className="rounded-control border-rule hover:bg-carbon-wash text-13 flex h-8 items-center border px-2"
                  >
                    Word
                  </a>
                  {!doc.final && mayGenerate && mayDiscard && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => discardDraft(doc.id), { close: true })
                      }
                      className="rounded-control border-rule hover:bg-carbon-wash text-13 h-8 border px-2 disabled:opacity-60"
                    >
                      Discard
                    </button>
                  )}
                </div>
              </div>

              {/* --- the editor ------------------------------------------ */}
              {editing === doc.id && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    run(() => saveDraftText(doc.id, formData));
                  }}
                  className="rounded-ledger border-carbon bg-carbon-wash flex flex-col gap-2 border p-3"
                >
                  <label className="flex flex-col gap-1">
                    <span className="text-12 text-ink-muted font-medium">
                      Heading
                    </span>
                    <input
                      name="title"
                      value={draft.title}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                      className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-12 text-ink-muted font-medium">
                      The letter
                    </span>
                    <textarea
                      name="bodyText"
                      required
                      rows={18}
                      value={draft.bodyText}
                      onChange={(event) =>
                        setDraft({ ...draft, bodyText: event.target.value })
                      }
                      className="rounded-ledger border-rule bg-paper text-13 border p-3 font-mono"
                    />
                    <span className="text-12 text-ink-muted max-w-[72ch]">
                      Saving fixes the draft to these words: it stops re-reading
                      the client&rsquo;s record, because that would throw your
                      edit away. Anything still in square brackets is a blank.
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-control bg-carbon text-13 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                    >
                      {pending ? "Saving…" : "Save the wording"}
                    </button>
                    {doc.edited && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => resetDraftText(doc.id), { close: true })
                        }
                        className="rounded-control border-rule bg-paper hover:bg-carbon-wash text-13 h-9 border px-3 disabled:opacity-60"
                      >
                        Reset to the template
                      </button>
                    )}
                  </div>
                </form>
              )}

              {/* --- what it says --------------------------------------- */}
              {open?.id === doc.id && editing !== doc.id && (
                <div
                  role="region"
                  aria-label={`${doc.name || "Document"} — ${
                    doc.final ? "issued wording" : "draft wording"
                  }`}
                  className="flex flex-col gap-2"
                >
                  {open.gaps?.length > 0 && (
                    <Notice
                      tone="warn"
                      title={`${open.gaps.length} ${
                        open.gaps.length === 1 ? "blank" : "blanks"
                      } the record cannot fill`}
                    >
                      <p>
                        {open.gaps.map((gap) => gap.label ?? gap).join(", ")}.
                        Fill them in with <strong>Edit the words</strong>, or
                        put them on the client&rsquo;s record.
                      </p>
                    </Notice>
                  )}
                  {open.unknown?.length > 0 && (
                    <Notice tone="bad" title="This template has a broken field">
                      <p>
                        It asks for {open.unknown.join(", ")}, which is not a
                        field the system knows. A partner corrects it in
                        Settings → Templates.
                      </p>
                    </Notice>
                  )}
                  <div className="rounded-ledger border-rule bg-sunk text-13 max-h-[28rem] overflow-auto border p-3 leading-relaxed whitespace-pre-wrap">
                    {open.text}
                  </div>
                </div>
              )}

              {/* --- issuing and sending -------------------------------- */}
              {mayIssue && (!doc.final || !doc.sentOn) && (
                <div className="border-rule flex flex-col gap-2 border-t pt-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-12 text-ink-muted font-medium">
                      A line to the client with it (optional)
                    </span>
                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Please find the certificate for the bank below."
                      className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                    />
                  </label>
                  <div className="flex flex-wrap items-start gap-2">
                    {doc.final ? (
                      <Action
                        id={`send-${doc.id}`}
                        why={null}
                        pending={pending}
                        onClick={() =>
                          run(() => {
                            const formData = new FormData();
                            formData.set("note", note);
                            return sendDocToClient(doc.id, formData);
                          })
                        }
                      >
                        Send it to the client
                      </Action>
                    ) : (
                      <>
                        <Action
                          id={`issue-send-${doc.id}`}
                          why={null}
                          pending={pending}
                          onClick={() =>
                            run(() => {
                              const formData = new FormData();
                              formData.set("note", note);
                              return issueAndSend(doc.id, formData);
                            })
                          }
                        >
                          Issue and send to the client
                        </Action>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => issueDoc(doc.id))}
                          className="rounded-control border-rule bg-paper hover:bg-carbon-wash text-14 h-9 border px-3 disabled:opacity-60"
                        >
                          Issue without sending
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-12 text-ink-muted max-w-[72ch]">
                    Issuing fixes the wording and puts the firm&rsquo;s name on
                    it — a draft goes out watermarked, so it cannot be emailed
                    until it is issued. The words go in the body of the email;
                    the signed PDF stays here on the job.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}
