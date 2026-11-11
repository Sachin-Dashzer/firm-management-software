"use client";

import { saving } from "@/lib/forms/saving";
import { useState } from "react";
import AuditTick from "@/components/ledger/AuditTick";
import {
  acceptChecklistItem,
  replaceChecklistItem,
  waiveChecklistItem,
  answerChecklistQuestion,
} from "../actions";

/**
 * One requested document and what can be done about it (P3-2).
 *
 * This was a dropdown of four states. Three of the six moves need a reason —
 * sending a file back, waiving a mandatory item, answering a question — and
 * a dropdown cannot ask why. So: the state in words, and only the buttons
 * that apply to it.
 */

const SETTLED = ["Accepted", "Not required", "Verified"];
const ARRIVED = ["Received", "Format checked"];

const TONE = {
  Accepted: "text-filed",
  Verified: "text-filed",
  "Not required": "text-ink-muted",
  "Replacement requested": "text-redpen",
  "Format checked": "text-carbon",
  Received: "text-carbon",
  Requested: "text-waiting",
  Pending: "text-ink-muted",
};

export default function ChecklistRow({
  engagementId,
  item,
  disabled,
  run,
  /**
   * The bulk-ask tick, when this is a row the client still owes us:
   * `{ checked, onChange }`, or null for a row that cannot be asked for.
   *
   * Deliberately a second box next to the `AuditTick`, not the same one.
   * That one is the auditor's mark and follows the item's *state*; this one
   * is a selection, and the set being selected belongs to the list rather
   * than to any row — so `ChecklistGroup` owns it and the button that acts
   * on it.
   */
  pick = null,
}) {
  const [form, setForm] = useState(null);

  const settled = SETTLED.includes(item.status);
  const arrived = ARRIVED.includes(item.status);
  const reply = item.clientReply;
  const openQuestion = reply?.kind === "question" && !reply.answer;

  const close = () => setForm(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-14 flex items-center gap-2">
          {pick && (
            <input
              type="checkbox"
              checked={pick.checked}
              onChange={pick.onChange}
              aria-label={`Ask the client for ${item.name}`}
            />
          )}
          {/*
            The tick is the auditor's mark — accepted, not merely arrived
            — and it is a state, not a control: three of the six moves
            need a reason, which a checkbox cannot ask for. The QA run
            read it as a checkbox that did nothing (#26), so it now says
            what it is when you hover or read it aloud.

            It is not drawn beside a selection box. A row being asked for
            is a row nothing has been accepted on, so the mark would be an
            empty square next to a real checkbox — two boxes on one line,
            one of them dead, which is #26 again and worse.
          */}
          {!pick && (
            <AuditTick
              checked={settled}
              label={`${item.name}: ${item.status.toLowerCase()}`}
              title={
                settled
                  ? `${item.status}. This mark follows the state; the buttons change it.`
                  : `Not accepted yet — ${item.status.toLowerCase()}. Use the buttons on this row.`
              }
            />
          )}
          {/*
            The name and its required/optional marker are one run of text,
            not two flex children: at 390px they were being broken into a
            column with "· required" stranded on its own line away from the
            document it describes.

            Saying it both ways is the owner's ask (11-11-2026). The
            service catalog carries a Mandatory box against every checklist
            item, and this page only ever rendered the unticked case as a
            quiet "· optional" — so a genuinely required document and a row
            whose flag nobody had thought about looked exactly alike. It
            decides what gets chased and what can be waived.
          */}
          <span className="min-w-0">
            {item.name}
            <span
              className={`text-12 ${
                item.mandatory ? "text-brass-ink" : "text-ink-muted"
              }`}
            >
              {" · "}
              {item.mandatory ? "required" : "optional"}
            </span>
          </span>
        </span>

        <span className={`text-12 font-medium ${TONE[item.status] ?? ""}`}>
          {item.status}
          {item.submissionCount > 1 && (
            <span className="text-ink-muted">
              {" "}
              · submission {item.submissionCount}
            </span>
          )}
        </span>
      </div>

      {/* why it went back, and who waived it ------------------------------ */}
      {item.rejectReason && (
        <p className="text-12 text-redpen">Sent back: {item.rejectReason}</p>
      )}
      {item.notRequiredReason && (
        <p className="text-12 text-ink-muted">
          Not required: {item.notRequiredReason}
          {item.acceptedByName && ` — ${item.acceptedByName}`}
        </p>
      )}
      {item.status === "Accepted" && item.acceptedByName && (
        <p className="text-12 text-ink-muted">
          Accepted by {item.acceptedByName}
          {item.acceptedSubmission > 1 &&
            ` at submission ${item.acceptedSubmission}`}
        </p>
      )}

      {/* what the client said back ---------------------------------------- */}
      {reply?.kind === "cannot" && (
        <p className="rounded-control border-waiting/40 bg-waiting/5 text-12 border px-2 py-1">
          <strong>{reply.byName} says they cannot provide this.</strong>
          {reply.note && ` ${reply.note}`} Decide: ask for an alternative, or
          mark it not required.
        </p>
      )}
      {reply?.kind === "delegated" && (
        <p className="text-12 text-ink-muted">
          {reply.byName} asked {reply.delegateName} ({reply.delegateContact}) to
          send it. An upload link for this one item has gone to them.
        </p>
      )}
      {reply?.kind === "question" && (
        <p className="rounded-control border-carbon/30 bg-carbon-wash text-12 border px-2 py-1">
          <strong>{reply.byName} asks:</strong> {reply.question}
          {reply.answer && (
            <>
              <br />
              <span className="text-ink-muted">Answered: {reply.answer}</span>
            </>
          )}
        </p>
      )}

      {/* what can be done ------------------------------------------------- */}
      {!disabled && !form && (
        <div className="flex flex-wrap gap-2">
          {arrived && (
            <>
              <button
                type="button"
                onClick={() =>
                  run(() => acceptChecklistItem(engagementId, item.id))
                }
                className="rounded-ledger bg-carbon text-12 text-on-carbon h-7 px-2 font-medium"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => setForm("replace")}
                className="rounded-ledger border-rule text-12 h-7 border px-2"
              >
                Request a replacement
              </button>
            </>
          )}
          {/*
            There is no per-row "Ask the client" here any more (owner,
            11-11-2026). It was one click per document and it emailed
            nothing — it only set the status to Requested, so the client
            heard from us only when somebody remembered to make a request
            on the Files tab. Asking is a bulk move now: tick the rows and
            the group asks for all of them in one request and one email.
            The control lives on ChecklistGroup in EngagementWork.jsx,
            because the set being asked for is a property of the list.
          */}
          {openQuestion && (
            <button
              type="button"
              onClick={() => setForm("answer")}
              className="rounded-ledger bg-carbon text-12 text-on-carbon h-7 px-2 font-medium"
            >
              Answer the client
            </button>
          )}
          {!settled && (
            <button
              type="button"
              onClick={() => setForm("waive")}
              className="rounded-ledger border-rule text-12 h-7 border px-2"
            >
              Not required
            </button>
          )}
        </div>
      )}

      {form === "replace" && (
        <form
          onSubmit={saving((formData) =>
            run(async () => {
              const out = await replaceChecklistItem(
                engagementId,
                item.id,
                formData,
              );
              close();
              return out;
            }),
          )}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-12 text-ink-muted font-medium">
              What is wrong with it? The client reads this.
            </span>
            <input
              name="reason"
              required
              minLength={5}
              placeholder="e.g. these are August challans, we need September"
              className="rounded-control border-rule bg-paper text-13 h-8 min-w-56 border px-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-control bg-carbon text-12 text-on-carbon h-8 px-2 font-medium"
          >
            Send it back
          </button>
          <button type="button" onClick={close} className="text-12 underline">
            Cancel
          </button>
        </form>
      )}

      {form === "waive" && (
        <form
          onSubmit={saving((formData) =>
            run(async () => {
              const out = await waiveChecklistItem(
                engagementId,
                item.id,
                formData,
              );
              close();
              return out;
            }),
          )}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-12 text-ink-muted font-medium">
              Why is it not needed? A waived mandatory document is the thing a
              reviewer asks about.
            </span>
            <input
              name="reason"
              required
              minLength={5}
              placeholder="e.g. client has no vehicle, so no logbook exists"
              className="rounded-control border-rule bg-paper text-13 h-8 min-w-56 border px-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-control border-rule text-12 h-8 border px-2 font-medium"
          >
            Mark not required
          </button>
          <button type="button" onClick={close} className="text-12 underline">
            Cancel
          </button>
        </form>
      )}

      {form === "answer" && (
        <form
          onSubmit={saving((formData) =>
            run(async () => {
              const out = await answerChecklistQuestion(
                engagementId,
                item.id,
                formData,
              );
              close();
              return out;
            }),
          )}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-12 text-ink-muted font-medium">
              Your answer
            </span>
            <input
              name="answer"
              required
              minLength={2}
              className="rounded-control border-rule bg-paper text-13 h-8 min-w-56 border px-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-control bg-carbon text-12 text-on-carbon h-8 px-2 font-medium"
          >
            Answer
          </button>
          <button type="button" onClick={close} className="text-12 underline">
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
