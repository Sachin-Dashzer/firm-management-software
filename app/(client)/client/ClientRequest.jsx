"use client";

import { useState, useTransition } from "react";
import { sayCannotProvide, delegateRequest, askAboutRequest } from "./actions";

/**
 * One thing the firm is waiting for, and what the client can say back
 * (P3-2).
 *
 * There is no upload here. That stays on the emailed link, which has its own
 * narrow scope — a second way into the vault is a second thing to get wrong.
 * What is here is the three answers that used to be a phone call: *I don't
 * have it*, *my accountant has it*, *I'm not sure what you mean*.
 */

export default function ClientRequest({ item }) {
  const [form, setForm] = useState(null);
  const [said, setSaid] = useState(null);
  const [pending, startTransition] = useTransition();

  const close = () => setForm(null);
  const reply = said?.ok ? null : item.reply;

  const run = (action, formData) =>
    startTransition(async () => {
      const out = await action(item.engagementId, item.id, formData);
      setSaid(out);
      if (out.ok) close();
    });

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

      {said && (
        <p
          className={`text-13 ${said.ok ? "text-filed" : "text-redpen"}`}
          role="status"
        >
          {said.ok ?? said.error}
        </p>
      )}

      {!form && !reply && (
        <div className="flex flex-wrap gap-2">
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
        </div>
      )}

      {form === "cannot" && (
        <form
          action={(formData) => run(sayCannotProvide, formData)}
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
          action={(formData) => run(delegateRequest, formData)}
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
          action={(formData) => run(askAboutRequest, formData)}
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
