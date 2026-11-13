"use client";

import { useState } from "react";
import Link from "next/link";
import { saving } from "@/lib/forms/saving";
import DocsPanel from "./DocsPanel";
import {
  acceptChecklistItem,
  replaceChecklistItem,
  waiveChecklistItem,
  answerChecklistQuestion,
} from "../actions";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const DONE_STATUSES = ["Accepted", "Not required", "Verified"];
const ARRIVED_STATUSES = ["Received", "Format checked"];

const TONES = {
  done: "bg-filed/10 text-filed",
  info: "bg-carbon/10 text-carbon",
  waiting: "bg-waiting/10 text-waiting",
  alert: "bg-redpen/10 text-redpen",
  muted: "bg-ink-muted/10 text-ink-muted",
};

const STATUS_TONE = {
  Accepted: "done",
  Verified: "done",
  Received: "info",
  "Format checked": "info",
  Requested: "waiting",
  "Replacement requested": "alert",
  "Not required": "muted",
  Pending: "muted",
};

/** The three small forms this row can open. One shape, one component. */
const FORMS = {
  replace: {
    action: replaceChecklistItem,
    field: "reason",
    label: "What's wrong with it? The client will see this.",
    placeholder: "e.g. These are August challans, we need September",
    submit: "Send back",
    minLength: 5,
  },
  waive: {
    action: waiveChecklistItem,
    field: "reason",
    label: "Why isn't it needed? Reviewers will ask about this.",
    placeholder: "e.g. Client has no vehicle, so there's no logbook",
    submit: "Mark not required",
    minLength: 5,
  },
  answer: {
    action: answerChecklistQuestion,
    field: "answer",
    label: "Your answer to the client",
    placeholder: "Type your reply",
    submit: "Send answer",
    minLength: 2,
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Letters drafted for this row (by row id, or by template for older letters). */
function lettersForRow(item, letters) {
  if (!letters) return [];
  return letters.docs.rows.filter((row) =>
    row.checklistItemId
      ? row.checklistItemId === item.id
      : Boolean(item.docTemplateId) && row.templateId === item.docTemplateId,
  );
}

/** Templates this row may be written from: the named one, or all of them. */
function templatesForRow(item, letters) {
  if (!letters) return [];
  return item.docTemplateId
    ? letters.templates.filter((t) => t.id === item.docTemplateId)
    : letters.templates;
}

function statusLabel(item, isFile, isDone) {
  if (isFile) return item.status;
  if (item.status === "Not required") return "Not required";
  return isDone ? "Done" : "Not done yet";
}

function letterLabel(letter) {
  if (letter.final) return `Issued on ${letter.issuedOn}`;
  if (letter.edited) return "Draft (edited)";
  return "Draft started";
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

const BUTTON_STYLES = {
  primary: "bg-carbon text-on-carbon hover:opacity-90",
  secondary: "border border-rule bg-paper hover:bg-carbon-wash",
  outline: "border border-carbon text-carbon hover:bg-carbon-wash",
};

function Button({ variant = "secondary", className = "", ...props }) {
  return (
    <button
      type="button"
      className={`rounded-ledger text-12 focus-visible:outline-carbon inline-flex h-8 items-center px-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

function StatusBadge({ label, tone }) {
  return (
    <span
      className={`text-12 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${TONES[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

function Note({ tone = "muted", children }) {
  return (
    <div className={`rounded-control text-12 px-3 py-2 ${TONES[tone]}`}>
      {children}
    </div>
  );
}

function ReasonForm({ config, onSubmit, onCancel }) {
  return (
    <form
      onSubmit={saving(onSubmit)}
      className="rounded-control border-rule bg-paper flex flex-col gap-2 border p-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted font-medium">
          {config.label}
        </span>
        <input
          name={config.field}
          required
          autoFocus
          minLength={config.minLength}
          placeholder={config.placeholder}
          className="rounded-control border-rule bg-paper text-13 h-9 w-full border px-3"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          {config.submit}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* The row                                                             */
/* ------------------------------------------------------------------ */

export default function ChecklistRow({
  engagementId,
  item,
  disabled,
  run,
  mayGenerate = false,
  letters = null,
  pick = null,
}) {
  const [openForm, setOpenForm] = useState(null);
  const [letterOpen, setLetterOpen] = useState(false);

  const kind = item.kind ?? "upload";
  const isFile = kind === "upload";
  const isLetter = kind === "doc";
  const isDone = DONE_STATUSES.includes(item.status);
  const hasArrived = ARRIVED_STATUSES.includes(item.status);

  const myLetters = isLetter ? lettersForRow(item, letters) : [];
  const myTemplates = isLetter ? templatesForRow(item, letters) : [];
  const latestLetter = myLetters[0];

  const reply = item.clientReply;
  const hasOpenQuestion = reply?.kind === "question" && !reply.answer;

  const accept = () => run(() => acceptChecklistItem(engagementId, item.id));

  const submitForm = (formData) =>
    run(async () => {
      const result = await FORMS[openForm].action(
        engagementId,
        item.id,
        formData,
      );
      setOpenForm(null);
      return result;
    });

  const showActions = !disabled && !openForm;

  return (
    <div className="flex flex-col gap-3 py-3">
      {/* Header: name + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {pick && (
            <input
              type="checkbox"
              checked={pick.checked}
              onChange={pick.onChange}
              aria-label={`Ask the client for ${item.name}`}
              className="mt-1 h-4 w-4 shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-14 font-medium">{item.name}</p>
            <p className="text-12 text-ink-muted mt-0.5">
              {item.mandatory ? (
                <span className="text-brass-ink font-medium">Required</span>
              ) : (
                "Optional"
              )}
              {item.submissionCount > 1 && (
                <span> · Submission {item.submissionCount}</span>
              )}
            </p>
          </div>
        </div>

        <StatusBadge
          label={statusLabel(item, isFile, isDone)}
          tone={STATUS_TONE[item.status] ?? "muted"}
        />
      </div>

      {/* Notes: history and client replies */}
      {item.rejectReason && (
        <Note tone="alert">Sent back: {item.rejectReason}</Note>
      )}

      {item.notRequiredReason && (
        <Note>
          Not required: {item.notRequiredReason}
          {item.acceptedByName && ` (${item.acceptedByName})`}
        </Note>
      )}

      {item.status === "Accepted" && item.acceptedByName && (
        <p className="text-12 text-ink-muted">
          Accepted by {item.acceptedByName}
          {item.acceptedSubmission > 1 &&
            ` on submission ${item.acceptedSubmission}`}
        </p>
      )}

      {reply?.kind === "cannot" && (
        <Note tone="waiting">
          <strong>{reply.byName} can't provide this.</strong>
          {reply.note && ` ${reply.note}`} Ask for an alternative, or mark it
          not required.
        </Note>
      )}

      {reply?.kind === "delegated" && (
        <Note>
          {reply.byName} asked {reply.delegateName} ({reply.delegateContact}) to
          send it. An upload link has been sent to them.
        </Note>
      )}

      {reply?.kind === "question" && (
        <Note tone="info">
          <strong>{reply.byName} asks:</strong> {reply.question}
          {reply.answer && (
            <p className="text-ink-muted mt-1">Your answer: {reply.answer}</p>
          )}
        </Note>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {showActions && !isFile && !isDone && (
          <Button variant="primary" onClick={accept}>
            Mark as done
          </Button>
        )}

        {showActions && hasArrived && (
          <>
            <Button variant="primary" onClick={accept}>
              Accept
            </Button>
            <Button onClick={() => setOpenForm("replace")}>
              Ask for a new copy
            </Button>
          </>
        )}

        {showActions && hasOpenQuestion && (
          <Button variant="primary" onClick={() => setOpenForm("answer")}>
            Answer the client
          </Button>
        )}

        {item.link && (
          <Link
            href={item.link.href}
            className="rounded-ledger border-carbon text-12 text-carbon hover:bg-carbon-wash inline-flex h-8 items-center border px-3 font-medium"
          >
            {item.link.label}
          </Link>
        )}

        {isLetter && (
          <Button
            variant="outline"
            onClick={() => setLetterOpen((open) => !open)}
            aria-expanded={letterOpen}
          >
            {letterOpen
              ? "Close letter"
              : latestLetter
                ? "Open letter"
                : "Write letter"}
          </Button>
        )}

        {latestLetter && (
          <span className="text-12 text-ink-muted">
            {letterLabel(latestLetter)}
          </span>
        )}

        {showActions && !isDone && (
          <button
            type="button"
            onClick={() => setOpenForm("waive")}
            className="text-12 text-ink-muted hover:text-ink ml-auto underline underline-offset-2"
          >
            Not required
          </button>
        )}
      </div>

      {/* Inline form */}
      {openForm && (
        <ReasonForm
          config={FORMS[openForm]}
          onSubmit={submitForm}
          onCancel={() => setOpenForm(null)}
        />
      )}

      {/* Letter editor */}
      {isLetter && letterOpen && letters && (
        <div className="rounded-ledger border-rule bg-carbon-wash border p-3">
          <DocsPanel
            bare
            checklistItemId={item.id}
            templates={myLetters.length ? [] : myTemplates}
            docs={{ engagementId, rows: myLetters }}
            mayGenerate={mayGenerate && !disabled}
            mayIssue={letters.mayIssue && !disabled}
            empty="Nothing drafted yet."
          />
        </div>
      )}
    </div>
  );
}