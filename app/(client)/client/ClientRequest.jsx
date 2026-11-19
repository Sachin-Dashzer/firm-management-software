"use client";

import { saving } from "@/lib/forms/saving";
import { useState, useTransition } from "react";
import {
  sayCannotProvide,
  delegateRequest,
  askAboutRequest,
  uploadTicket,
  confirmUpload,
} from "./actions";

/**
 * One thing the firm is waiting for, and what the client can do about it
 * (P3-2).
 *
 * **Send it** first, because sending the thing is the answer to being asked
 * for it (owner, 19-11-2026) — until today the only way to do that from here
 * was the link we emailed, and a client who was already signed in had to go
 * and find it. Then the three answers that used to be a phone call: *I don't
 * have it*, *my accountant has it*, *I'm not sure what you mean*.
 */

export default function ClientRequest({ item }) {
  const [form, setForm] = useState(null);
  const [said, setSaid] = useState(null);
  /** What is going up right now, in words, because a bar tells nobody which file. */
  const [sending, setSending] = useState(null);
  const [pending, startTransition] = useTransition();

  const close = () => setForm(null);
  const reply = said?.ok ? null : item.reply;

  const run = (action, formData) =>
    startTransition(async () => {
      const out = await action(item.engagementId, item.id, formData);
      setSaid(out);
      if (out.ok) close();
    });

  /**
   * The same three steps as the emailed link: a ticket, the bytes straight to
   * the gateway, then the record. The file never passes through the app.
   *
   * One at a time and it stops at the first failure — somebody on a phone
   * connection should not have to work out which four of six went.
   */
  async function send(files) {
    if (files.length === 0) return;
    setSaid(null);

    for (const file of [...files]) {
      setSending(`Sending ${file.name}…`);

      const ticket = await uploadTicket(item.engagementId, item.id, {
        filename: file.name,
        mime: file.type,
        size: file.size,
      });
      if (ticket?.error) {
        setSending(null);
        setSaid({ error: ticket.error });
        return;
      }

      const body = new FormData();
      body.append(ticket.field, file);
      let stored;
      try {
        const response = await fetch(ticket.url, { method: "POST", body });
        stored = await response.json();
        if (!response.ok) throw new Error(stored?.error ?? "Upload refused");
      } catch {
        setSending(null);
        setSaid({
          error: `${file.name} could not be sent. Please check your connection and try again.`,
        });
        return;
      }

      const saved = await confirmUpload(item.engagementId, item.id, {
        key: ticket.key,
        fy: ticket.fy,
        filename: file.name,
        mime: stored.mime || file.type,
        size: stored.size ?? file.size,
        checksum: stored.checksum,
      });
      if (saved?.error) {
        setSending(null);
        setSaid({ error: saved.error });
        return;
      }
      setSaid(saved);
    }

    setSending(null);
    close();
  }

  return (
    <li className="border-rule flex flex-col gap-2 border-t pt-3 first:border-0 first:pt-0">
      <div>
        <span className="text-14 font-medium">{item.name}</span>{" "}
        <span className="text-ink-muted text-13">— {item.for}</span>
      </div>

      {/* our own words, because "rejected" tells nobody anything ---------- */}
      {item.status === "Replacement requested" && item.rejectReason && (
        <p className="rounded-control border-redpen/40 bg-redpen/5 text-13 border px-2 py-1">
          <strong>We could not use the copy you sent.</strong>{" "}
          {item.rejectReason}
        </p>
      )}

      {/* what they already told us ---------------------------------------- */}
      {reply?.kind === "cannot" && (
        <p className="text-13 text-ink-muted">
          You told us you do not have this
          {reply.note ? `: ${reply.note}` : ""}. Your CA will suggest an
          alternative.
        </p>
      )}
      {reply?.kind === "delegated" && (
        <p className="text-13 text-ink-muted">
          {reply.delegateName} has been sent a link for this one document.
        </p>
      )}
      {reply?.kind === "question" && (
        <p className="text-13 text-ink-muted">
          You asked: {reply.question}
          {reply.answer ? ` — ${reply.answer}` : " (we will come back to you)"}
        </p>
      )}

      {(said || sending) && (
        <p
          className={`text-13 ${
            sending ? "text-ink-muted" : said.ok ? "text-filed" : "text-redpen"
          }`}
          role="status"
        >
          {sending ?? said.ok ?? said.error}
        </p>
      )}

      {!form && !sending && (
        <div className="flex flex-wrap items-center gap-2">
          {/*
            A label around a hidden input: the native file picker, which
            already knows how to take several files, a photograph from a
            phone camera, and a drop. Nothing here needs a library.

            It stays available after a reply, because "I don't have it" and
            then finding it is the ordinary course of things — sending the
            file clears that reply (`recordSubmission`).
          */}
          <label className="rounded-control bg-carbon text-12 text-on-carbon focus-within:outline-brass flex h-7 cursor-pointer items-center px-2 font-medium focus-within:outline-2 focus-within:outline-offset-2">
            Send it now
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                /**
                 * Copied out of the `FileList` **before** the input is
                 * cleared: the list is live, so clearing the value empties
                 * the very array we are about to send. Clearing it at all is
                 * so that picking the same file again after a failed attempt
                 * still fires a change.
                 */
                const picked = [...event.target.files];
                event.target.value = "";
                send(picked);
              }}
            />
          </label>

          {!reply && (
            <>
              <button
                type="button"
                onClick={() => setForm("cannot")}
                className="rounded-ledger border-rule text-12 h-7 border px-2"
              >
                I don&rsquo;t have this
              </button>
              <button
                type="button"
                onClick={() => setForm("delegate")}
                className="rounded-ledger border-rule text-12 h-7 border px-2"
              >
                Someone else will send it
              </button>
              <button
                type="button"
                onClick={() => setForm("ask")}
                className="rounded-ledger border-rule text-12 h-7 border px-2"
              >
                Please clarify
              </button>
            </>
          )}
        </div>
      )}

      {form === "cannot" && (
        <form
          onSubmit={saving((formData) => run(sayCannotProvide, formData))}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-12 text-ink-muted font-medium">
              Why not? Optional — sometimes there is no reason to give.
            </span>
            <input
              name="note"
              placeholder="e.g. the bank has not issued September yet"
              className="rounded-control border-rule bg-paper text-13 h-8 min-w-56 border px-2"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-carbon text-12 text-on-carbon h-8 px-2 font-medium disabled:opacity-50"
          >
            Tell my CA
          </button>
          <button type="button" onClick={close} className="text-12 underline">
            Cancel
          </button>
        </form>
      )}

      {form === "delegate" && (
        <form
          onSubmit={saving((formData) => run(delegateRequest, formData))}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                Who will send it?
              </span>
              <input
                name="name"
                required
                minLength={2}
                placeholder="e.g. Meena Gupta, our accountant"
                className="rounded-control border-rule bg-paper text-13 h-8 min-w-48 border px-2"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                Their mobile or email
              </span>
              <input
                name="contact"
                required
                minLength={5}
                className="rounded-control border-rule bg-paper text-13 h-8 min-w-48 border px-2"
              />
            </label>
          </div>
          <p className="text-12 text-ink-muted">
            They get a link for this one document. They cannot see anything else
            on your file and cannot approve anything.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-control bg-carbon text-12 text-on-carbon h-8 px-2 font-medium disabled:opacity-50"
            >
              Send them the request
            </button>
            <button type="button" onClick={close} className="text-12 underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      {form === "ask" && (
        <form
          onSubmit={saving((formData) => run(askAboutRequest, formData))}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-12 text-ink-muted font-medium">
              Your question
            </span>
            <input
              name="question"
              required
              minLength={5}
              placeholder="e.g. do you need the current account or all of them?"
              className="rounded-control border-rule bg-paper text-13 h-8 min-w-56 border px-2"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-carbon text-12 text-on-carbon h-8 px-2 font-medium disabled:opacity-50"
          >
            Ask
          </button>
          <button type="button" onClick={close} className="text-12 underline">
            Cancel
          </button>
        </form>
      )}
    </li>
  );
}
