"use client";

import { useState } from "react";
import AuditTick from "@/components/ledger/AuditTick";
import {
  requestChecklistItem,
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

export default function ChecklistRow({ engagementId, item, disabled, run }) {
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
          {/* the tick is the auditor's: accepted, not merely arrived */}
          <AuditTick
            checked={settled}
            label={`${item.name}: ${item.status.toLowerCase()}`}
          />
          {item.name}
          {!item.mandatory && (
            <span className="text-12 text-ink-muted"> · optional</span>
          )}
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
          {item.status === "Pending" && (
            <button
              type="button"
              onClick={() =>
                run(() => requestChecklistItem(engagementId, item.id))
              }
              className="rounded-ledger border-rule text-12 h-7 border px-2"
            >
              Ask the client
            </button>
          )}
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
          action={(formData) =>
            run(async () => {
              const out = await replaceChecklistItem(
                engagementId,
                item.id,
                formData,
              );
              close();
              return out;
            })
          }
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
          action={(formData) =>
            run(async () => {
              const out = await waiveChecklistItem(
                engagementId,
                item.id,
                formData,
              );
              close();
              return out;
            })
          }
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
          action={(formData) =>
            run(async () => {
              const out = await answerChecklistQuestion(
                engagementId,
                item.id,
                formData,
              );
              close();
              return out;
            })
          }
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
