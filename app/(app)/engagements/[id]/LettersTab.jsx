"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Notice from "@/components/ui/Notice";
import DocEditor from "./DocEditor";
import NotifyPanel from "./NotifyPanel";
import { createDraft, issueAndSend, issueDoc } from "../../docs/actions";

/**
 * The Letters tab: what has gone out, and writing the next one
 * (owner, 13-11-2026, rewritten the same day).
 *
 * ## What was wrong with the first version
 *
 * Three headings, three paragraphs of explanation, and a composer that
 * was open all the time showing every control a letter has at once —
 * *Read it, Edit the words, PDF, Word, Discard, Issue and send, Issue
 * without sending* — with a paragraph underneath explaining the
 * difference between the last two. Somebody who has not been taught what
 * "issue" means cannot start.
 *
 * ## What it is now
 *
 * A list of what was sent, and one button. Press it and the letter is
 * written in three numbered steps, one on the screen at a time:
 *
 *  1. **Which letter?** — pick from the firm's templates.
 *  2. **Check the wording** — it is already filled in from the client's
 *     record; change anything.
 *  3. **Send it** — with an optional line to go with it.
 *
 * The words "issue", "draft" and "final" do not appear. Step 3 still
 * calls `issueAndSend`, so the firm's name goes on it, the signatory and
 * the UDIN are checked, and the server can still refuse — none of that
 * moved. It is only no longer the reader's vocabulary lesson.
 *
 * "Keep it for now" is the same gate's other side: it saves the letter
 * without emailing it, and the letter waits under **Half written**.
 */
export default function LettersTab({
  engagementId,
  sent = [],
  letters = null,
  /**
   * Who a plain message could go to — the audience, not a rendered box
   * (owner-reported console error, 13-11-2026). An element built in a
   * server component and placed among another component's children is
   * one React cannot account for; the figures cross the boundary and
   * this tab draws `NotifyPanel` itself.
   */
  notify = null,
}) {
  /** null, "write", or "message" — one panel open at a time. */
  const [panel, setPanel] = useState(null);
  const [reading, setReading] = useState(null);

  const unsent = (letters?.docs?.rows ?? []).filter((doc) => !doc.sentOn);
  const mayWrite = Boolean(letters?.mayGenerate);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-display text-18 font-semibold">Letters</h2>
        <div className="flex flex-wrap gap-2">
          {mayWrite && (
            <button
              type="button"
              onClick={() => setPanel(panel === "write" ? null : "write")}
              aria-expanded={panel === "write"}
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium"
            >
              {panel === "write" ? "Cancel" : "Write to the client"}
            </button>
          )}
          {notify && (
            <button
              type="button"
              onClick={() => setPanel(panel === "message" ? null : "message")}
              aria-expanded={panel === "message"}
              className="rounded-control border-rule hover:bg-sunk text-14 h-9 border px-4"
            >
              {panel === "message" ? "Cancel" : "Send a plain message"}
            </button>
          )}
        </div>
      </div>

      {panel === "write" && (
        <WriteLetter
          engagementId={engagementId}
          letters={letters}
          onDone={() => setPanel(null)}
        />
      )}

      {panel === "message" && (
        <div className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
          <p className="text-13 text-ink-muted max-w-[70ch]">
            No template, your own words. You see exactly what each person will
            get before any of it is sent.
          </p>
          <NotifyPanel {...notify} id={engagementId} />
        </div>
      )}

      {/* ---- letters started and not sent ---------------------------- */}
      {unsent.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-13 font-semibold">Half written</h3>
          <ul className="border-rule rounded-ledger divide-rule divide-y border">
            {unsent.map((doc) => (
              <HalfWritten
                key={doc.id}
                doc={doc}
                mayWrite={mayWrite}
                maySend={Boolean(letters?.mayIssue)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ---- what has gone out --------------------------------------- */}
      <div className="flex flex-col gap-1">
        <h3 className="text-13 font-semibold">
          Sent
          {sent.length > 0 && (
            <span className="num text-ink-muted ml-1.5 font-normal">
              · {sent.length}
            </span>
          )}
        </h3>

        {sent.length === 0 ? (
          <p className="text-14 text-ink-muted rounded-ledger border-rule border border-dashed px-3 py-8 text-center">
            Nothing has been sent to this client about this job yet.
          </p>
        ) : (
          <ul className="border-rule rounded-ledger divide-rule divide-y border">
            {sent.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-14 font-medium break-words">
                      {row.subject}
                    </p>
                    <p
                      className={`text-13 ${
                        row.status === "sent"
                          ? "text-ink-muted"
                          : row.status === "failed"
                            ? "text-redpen"
                            : "text-waiting"
                      }`}
                    >
                      {row.status === "sent"
                        ? `Sent to ${row.to} on ${row.when}`
                        : row.status === "failed"
                          ? `Did not go through — ${row.to}, ${row.when}`
                          : row.status === "held"
                            ? `Not sent${row.heldReason ? ` — ${row.heldReason}` : ""}`
                            : `Waiting to go to ${row.to}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {row.body && (
                      <button
                        type="button"
                        onClick={() =>
                          setReading(reading === row.id ? null : row.id)
                        }
                        aria-expanded={reading === row.id}
                        className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3"
                      >
                        {reading === row.id ? "Close" : "Open"}
                      </button>
                    )}
                  </div>
                </div>

                {reading === row.id && row.body && (
                  <div className="rounded-ledger border-rule bg-sunk text-13 max-h-[24rem] overflow-auto border p-3 leading-relaxed whitespace-pre-wrap">
                    {row.body}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Writing one letter, three numbered steps, one at a time.
 *
 * The numbers are the whole design. A person who has never sent one of
 * these before is told how many steps there are, which one they are on,
 * and nothing about the four others they are not.
 */
function WriteLetter({ engagementId, letters, onDone }) {
  const [step, setStep] = useState(1);
  const [chosen, setChosen] = useState("");
  const [docId, setDocId] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const template = letters.templates.find((t) => t.id === chosen);

  function start() {
    setError("");
    startTransition(async () => {
      const result = await createDraft(engagementId, chosen);
      if (result?.error || !result?.id) {
        return setError(result?.error ?? "That letter could not be started.");
      }
      setDocId(result.id);
      setStep(2);
    });
  }

  function finish(send) {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("note", note);
      const result = send
        ? await issueAndSend(docId, formData)
        : await issueDoc(docId);
      if (result?.error) return setError(result.error);
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="rounded-ledger border-carbon bg-surface flex flex-col gap-4 border p-4 md:p-5">
      {error && (
        <Notice tone="bad" title="That did not go through">
          <p>{error}</p>
        </Notice>
      )}

      {/* ---- 1 ---------------------------------------------------- */}
      <Step n={1} of={3} title="Which letter?" done={step > 1}>
        {step === 1 ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
              <span className="sr-only">Choose a letter</span>
              <select
                value={chosen}
                onChange={(event) => setChosen(event.target.value)}
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              >
                <option value="">Choose a letter…</option>
                {letters.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!chosen || pending}
              onClick={start}
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-50"
            >
              {pending ? "Getting it ready…" : "Next"}
            </button>
          </div>
        ) : (
          <p className="text-13 text-ink-muted">{template?.name}</p>
        )}
        {step === 1 && template && !template.verified && (
          <p className="text-12 text-waiting mt-1 max-w-[72ch]">
            A partner has not approved this wording yet, so it goes out marked
            as a draft until one does.
          </p>
        )}
      </Step>

      {/* ---- 2 ---------------------------------------------------- */}
      {step >= 2 && (
        <Step n={2} of={3} title="Check the wording" done={step > 2}>
          {step === 2 ? (
            <div className="flex flex-col gap-2">
              <p className="text-13 text-ink-muted max-w-[72ch]">
                It is already filled in from this client&rsquo;s record. Change
                anything you like.
              </p>
              <DocEditor
                docId={docId}
                saveLabel="Looks right — go on"
                onSaved={() => setStep(3)}
              />
            </div>
          ) : (
            <p className="text-13 text-ink-muted">Checked.</p>
          )}
        </Step>
      )}

      {/* ---- 3 ---------------------------------------------------- */}
      {step >= 3 && (
        <Step n={3} of={3} title="Send it">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                A line to go with it (you can leave this empty)
              </span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Please find the certificate for the bank below."
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => finish(true)}
                className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send it to the client"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => finish(false)}
                className="rounded-control border-rule bg-paper hover:bg-sunk text-14 h-9 border px-4 disabled:opacity-60"
              >
                Keep it for now
              </button>
            </div>
            <p className="text-12 text-ink-muted max-w-[72ch]">
              Either way the firm&rsquo;s name goes on it and the wording is
              fixed. <strong>Keep it for now</strong> leaves it under{" "}
              <strong>Half written</strong>, ready to send later.
            </p>
          </div>
        </Step>
      )}
    </div>
  );
}

/** A numbered step, with a tick once it is behind you. */
function Step({ n, of, title, done = false, children }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className={`num text-12 grid size-6 shrink-0 place-items-center rounded-full ${
          done ? "bg-filed text-on-carbon" : "bg-carbon text-on-carbon"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-14 font-semibold">
          <span className="sr-only">
            Step {n} of {of}:{" "}
          </span>
          {title}
        </h3>
        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  );
}

/** A letter started and not yet sent: finish it, or send it as it stands. */
function HalfWritten({ doc, mayWrite, maySend }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function send() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("note", note);
      // issuing is idempotent on a letter already signed off, so one call
      // covers both: the server decides what still has to happen
      const result = await issueAndSend(doc.id, formData);
      if (result?.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-14 font-medium break-words">{doc.name}</p>
          <p className="text-13 text-ink-muted">
            {doc.final
              ? `Ready to send — signed off by ${doc.issuedByName || "the firm"}`
              : `Started by ${doc.byName}, not sent yet`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {mayWrite && !doc.final && (
            <button
              type="button"
              onClick={() => setOpen(open === "edit" ? false : "edit")}
              aria-expanded={open === "edit"}
              className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3"
            >
              {open === "edit" ? "Close" : "Carry on writing"}
            </button>
          )}
          {maySend && (
            <button
              type="button"
              onClick={() => setOpen(open === "send" ? false : "send")}
              aria-expanded={open === "send"}
              className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium"
            >
              {open === "send" ? "Cancel" : "Send it"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-13 text-redpen">
          {error}
        </p>
      )}

      {open === "edit" && (
        <DocEditor
          docId={doc.id}
          saveLabel="Save it"
          onSaved={() => setOpen(false)}
        />
      )}

      {open === "send" && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-12 text-ink-muted font-medium">
              A line to go with it (you can leave this empty)
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={send}
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send it to the client"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
