"use client";

import { saving } from "@/lib/forms/saving";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Notice, { Result } from "@/components/ui/Notice";
import {
  stepsView,
  itemsForStep,
  reviewComplete,
} from "@/lib/engagements/steps";
// the same two predicates createDocRequest filters the checklist with, so
// the tick boxes below cannot offer a row the request would drop
import { isSettled, needsReview } from "@/lib/engagements/checklist";
import { createDocRequest } from "../../documents/requests";
import Uploader from "@/components/documents/Uploader";
import DocumentList from "@/components/documents/DocumentList";
import CompletionStamp from "@/components/ledger/CompletionStamp";
import FeeScope from "@/components/billing/FeeScope";
import Action from "@/components/ui/Action";
import AssignmentPanel from "./AssignmentPanel";
import StepsPanel from "./StepsPanel";
import FilingMilestones from "./FilingMilestones";
import FilingPanel, { UdinQuestion } from "./FilingPanel";
import DocsPanel from "./DocsPanel";
import FilesTab from "./FilesTab";
import ReviewPanel from "./ReviewPanel";
import GstPanel from "./GstPanel";
import ChecklistRow from "./ChecklistRow";
import {
  approveWork,
  changeStatus,
  deleteEngagement,
  recordConfirmation,
  saveAssignment,
  setTaskDone,
} from "../actions";

export default function EngagementWork({
  tab = "work",
  engagement,
  /** Every move this status could make, each with its refusal or null (P3-8). */
  moves = [],
  canEditWork,
  mayManage,
  mayPrice = false,
  isPartner = false,
  /** Partner only: `deleteRecord`. The server asks the same question. */
  mayDelete = false,
  isReviewer,
  actorRole,
  team,
  documents = [],
  mayAttach = false,
  /** May this person draft a letter? A `doc` checklist row needs it. */
  mayGenerate = false,
  letters = null,
  /** The upload links given to the client; the Files tab draws them. */
  docRequests = null,
}) {
  const [message, setMessage] = useState(null);
  /** Work from before P3-1 has none, and keeps the old single filing box. */
  const hasMilestones = (engagement.milestones ?? []).length > 0;
  const [pending, startTransition] = useTransition();
  /** Why this job is being deleted — kept apart from the status reason. */
  const [binReason, setBinReason] = useState("");
  // true only for the moment somebody completed it, so the stamp presses
  // once rather than every time a finished engagement is opened
  const [juststamped, setJustStamped] = useState(false);

  const router = useRouter();

  function run(action) {
    const answer = action();
    startTransition(async () => setMessage(await answer));
    // the answer goes back to the caller: a form clears itself only on a save
    return answer;
  }

  /** Server components hold the document list, so ask them again. */
  function refresh() {
    startTransition(() => router.refresh());
  }

  /**
   * Completing the job, from the last step's own button.
   *
   * Every other status move now lives in the head's status menu
   * (`StatusMenu`, 13-11-2026). This one stays here because it is the
   * closing step's work, and because the stamp presses only when somebody
   * completes it — not every time a finished job is opened.
   */
  function complete() {
    startTransition(async () => {
      const result = await changeStatus(engagement.id, "Completed");
      setMessage(result);
      if (result?.ok) setJustStamped(true);
    });
  }

  /**
   * Where the job is. The one answer to "which step is open", so the panel
   * and everything that reads it cannot end up disagreeing.
   */
  const steps = stepsView(engagement);

  /**
   * The open step's own checklist rows, and nothing else (owner,
   * 13-11-2026).
   *
   * It briefly also carried a free uploader, a template picker and the
   * "ask the client" link. The owner took all three off again: **a step
   * asks for the documents the step names.** Anything a person could
   * attach or request outside the catalog is a document the catalog
   * should have named, and a step that offers it is a step that stopped
   * describing the work.
   *
   * So the catalog decides, here as everywhere else. The one way to add
   * a row to a job is to add it to the service.
   */
  function checklistFor(items) {
    const fromClient = items.filter((row) => row.side === "client");
    const fromUs = items.filter((row) => row.side === "firm");

    return (
      <div className="flex flex-col gap-4">
        {items.length === 0 && (
          <p className="text-13 text-ink-muted">
            Nothing is listed against this step.
          </p>
        )}
        <ChecklistGroup
          title="From the client"
          items={fromClient}
          engagementId={engagement.id}
          disabled={!canEditWork || pending}
          run={run}
          documents={documents}
          mayAttach={mayAttach && canEditWork}
          mayGenerate={mayGenerate}
          letters={letters}
          refresh={refresh}
          // only this side can be asked for: the rows below are ours
          askable={mayAttach}
        />
        <ChecklistGroup
          title="We do"
          items={fromUs}
          engagementId={engagement.id}
          disabled={!canEditWork || pending}
          run={run}
          documents={documents}
          mayAttach={mayAttach && canEditWork}
          mayGenerate={mayGenerate}
          letters={letters}
          refresh={refresh}
        />
      </div>
    );
  }

  /**
   * This step's own rows, its uploader and its template picker — drawn on
   * **every** task step now, not only on one the catalog happened to mark
   * as the documents step (owner, 13-11-2026).
   *
   * The Files tab used to be where documents were handled. It is the
   * register now, so every way of getting a document onto a job has to
   * exist here, on the step doing the work.
   */
  const stepChecklist =
    steps.open?.kind === "task"
      ? checklistFor(itemsForStep(engagement, steps.open.index))
      : null;

  /**
   * The Filing step's work: the details, and the per-filing
   * acknowledgements that used to be a panel of their own.
   *
   * `FilingMilestones` was a standalone section halfway down the page. The
   * owner asked for the Filing section to go, and it has — but a filing
   * acknowledgement has to be recordable *somewhere*, and the step called
   * Filing is the honest place for it.
   */
  const filingWork = (
    <div className="flex flex-col gap-4">
      <FilingPanel
        bare
        engagement={engagement}
        team={team}
        pending={pending}
        startTransition={startTransition}
        setMessage={setMessage}
        run={run}
      />
      {hasMilestones && (
        <div className="border-rule border-t pt-3">
          <FilingMilestones
            engagement={engagement}
            locked={["Completed", "Cancelled"].includes(engagement.status)}
            blocked={engagement.gates.blocksFiling}
            setMessage={setMessage}
          />
        </div>
      )}
    </div>
  );

  /**
   * The review: the reviewer's points, and the approval that used to be
   * the "Approval" panel.
   *
   * **The approval could not simply be deleted with its section.** It is
   * `gates.approved`, and `blocksFiling` reads it — remove the only button
   * that sets it and no job could ever be filed again.
   *
   * It was a step until 13-11-2026 and is now a record on this tab, which
   * changes where it is drawn and nothing about what it does: the same
   * points, the same approval, the same refusals, all of them computed on
   * the server. What it stops doing is standing in the preparer's way as
   * the next thing to do when the next thing to do is somebody else's.
   */
  const reviewWork = (
    <div className="flex flex-col gap-4">
      <ReviewPanel
        bare
        engagement={engagement}
        isReviewer={isReviewer}
        pending={pending}
        run={run}
      />

      {/*
        The letters, where the reviewer actually is (owner, 12-11-2026).
        A CA signing a certificate off reads it, corrects the wording and
        then approves — three things on one screen, in that order, rather
        than a tab in the middle of them. No template picker: the review
        step corrects what the work produced, it does not start new ones.
      */}
      {letters && letters.docs.rows.length > 0 && (
        <div className="border-rule flex flex-col gap-2 border-t pt-3">
          <h3 className="text-14 font-semibold">What this job has written</h3>
          <DocsPanel
            bare
            templates={[]}
            docs={letters.docs}
            mayGenerate={letters.mayGenerate && canEditWork}
            mayIssue={letters.mayIssue && canEditWork}
          />
        </div>
      )}
      <div className="border-rule flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-14 font-semibold">Approve it for filing</h3>
          {engagement.gates.version > 1 && (
            <span className="text-12 text-ink-muted">
              Version <span className="num">{engagement.gates.version}</span>
            </span>
          )}
        </div>

        {engagement.gates.approvedByName ? (
          <p className="text-13">
            Version{" "}
            <span className="num">{engagement.gates.approvedVersion}</span>{" "}
            approved by <strong>{engagement.gates.approvedByName}</strong> on{" "}
            <span className="num">{engagement.gates.approvedOn}</span>.
          </p>
        ) : (
          <p className="text-13 text-ink-muted max-w-[72ch]">
            A reviewer approves the work <strong>before</strong> anything is
            filed, so a disagreement is still a conversation rather than a
            revised return.
          </p>
        )}

        {!engagement.gates.approved && (
          <Action
            id="approve-for-filing"
            why={engagement.gates.cannotApprove}
            pending={pending}
            onClick={() => run(() => approveWork(engagement.id))}
          >
            Approve for filing
          </Action>
        )}

        {engagement.gates.needsClient && (
          <div className="mt-1 flex flex-col gap-2">
            <h4 className="text-13 font-semibold">
              The client confirms the figures
            </h4>
            {engagement.gates.confirmation ? (
              <p className="text-13">
                <strong>{engagement.gates.confirmation.who}</strong> confirmed
                version{" "}
                <span className="num">
                  {engagement.gates.confirmation.version}
                </span>{" "}
                on{" "}
                <span className="num">
                  {engagement.gates.confirmation.when}
                </span>
                .
                <span className="text-12 text-ink-muted block">
                  Evidence: {engagement.gates.confirmation.evidence} · recorded
                  by {engagement.gates.confirmation.recordedByName}
                </span>
              </p>
            ) : (
              <p className="text-13 text-ink-muted max-w-[72ch]">
                The client, not the firm, owes the tax. Record who confirmed,
                when, and where the confirmation can be found.
              </p>
            )}

            {engagement.gates.approved && !engagement.gates.confirmation && (
              <form
                onSubmit={saving(
                  (formData) => recordConfirmation(engagement.id, formData),
                  setMessage,
                  startTransition,
                )}
                className="flex flex-wrap items-end gap-2"
              >
                <label className="flex flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    Who confirmed
                  </span>
                  <input
                    name="who"
                    required
                    placeholder="Name at the client"
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    When
                  </span>
                  <input
                    type="date"
                    name="when"
                    required
                    max={engagement.todayInput}
                    defaultValue={engagement.todayInput}
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  />
                </label>
                <label className="flex min-w-60 flex-1 flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    Where it can be found
                  </span>
                  <input
                    name="evidence"
                    required
                    placeholder="WhatsApp from Jaspal, 25 Oct 4:10 pm"
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  />
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                >
                  Record it
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );

  /**
   * The last step is the completion itself, so its work is the one control
   * that performs it — with the refusal the pipeline already computed, not
   * a second guess at it. `moves` is the authority on whether this can go
   * anywhere, and `changeStatus` is the authority full stop.
   */
  const completeMove = moves.find((row) => row.to === "Completed");
  const submitWork = (
    <div className="flex flex-col gap-2">
      <p className="text-13 text-ink-muted max-w-[60ch]">
        Everything before this is closed. Completing locks the job — the
        figures, the checklist and the review stop being editable, and the stamp
        goes on the file.
      </p>
      <Action
        id="complete-from-step"
        why={
          completeMove
            ? completeMove.why
            : "Completing is not offered from this status."
        }
        pending={pending}
        onClick={complete}
      >
        Mark this engagement Completed
      </Action>
    </div>
  );

  /** Keyed by the open step's `workKey`; only the open one is ever drawn. */
  const stepWork = {
    documents: stepChecklist,
    submit: submitWork,
    /**
     * The UDIN step's work, drawn on whichever step the service marked as
     * its UDIN step (owner, 12-11-2026) — not on a closing gate of its own.
     * `Filing` is no longer a step at all: see `lib/engagements/steps.js`.
     */
    udin: (
      <div className="flex flex-col gap-3">
        <UdinQuestion engagement={engagement} pending={pending} run={run} />
        {/*
          And the boxes the number comes back into (owner, 12-11-2026).
          The register is where a UDIN is applied for; this is where the
          person who has just been there writes down what they got — the
          number, who it was generated against, and the acknowledgement.
          `FilingPanel` already owns those fields and the one save that
          keeps them and the register in step, so it is rendered here
          rather than copied.
        */}
        <FilingPanel
          bare
          engagement={engagement}
          team={team}
          pending={pending}
          startTransition={startTransition}
          setMessage={setMessage}
          run={run}
        />
      </div>
    ),
  };

  return (
    <div className="flex flex-col gap-6">
      {/* <Result message={message} /> */}

      {tab === "work" && (
        <>
          {/* at risk: the deadline is still ahead, a target has already gone */}
          {engagement.atRisk && (
            <Notice tone="warn" title="At risk">
              <p>
                {engagement.atRisk}. The statutory date has not passed, so this
                can still be saved.
              </p>
            </Notice>
          )}

          {/* --- the stamp, once the work is signed off --------------------- */}
          {engagement.status === "Completed" && (
            <div className="flex justify-center py-2 sm:justify-end sm:pr-6">
              <CompletionStamp
                udin={engagement.udin}
                on={engagement.completedOn}
                by={engagement.completedBy}
                justNow={juststamped}
              />
            </div>
          )}

          {/* --- the one card ------------------------------------------------- */}
          {/*
            `#steps` stays as the anchor the Issues list and the next
            sentence point at. The approval and the client's confirmation
            moved out of a step on 13-11-2026 and have `#review` of their
            own, on the Work tab, which is what points at them now.
          */}
          <div id="steps">
            <StepsPanel
              engagement={engagement}
              team={team}
              actorRole={actorRole}
              canEditWork={canEditWork}
              mayManage={mayManage}
              pending={pending}
              run={run}
              work={stepWork}
              next={engagement.next}
              /*
                The heading carries every next action except the tick
                (owner, 13-11-2026): "Mark it done" here was the same
                `setTaskDone` call as the button at the foot of the same
                card, so the step was offered twice. The register link,
                "Send for review" and the rest go nowhere else, so they
                stay.
              */
              nextAction={
                engagement.next?.action &&
                engagement.next.action.act !== "tick-task" && (
                  <NextAction
                    action={engagement.next.action}
                    // a manager stepping into somebody else's job says so
                    help={engagement.next.stance === "help"}
                    pending={pending}
                    onRun={run}
                  />
                )
              }
            />
          </div>

          {/* --- the audit file and the month's GST data ---------------------- */}
          {/*
            One column. They were a two-up grid, and a job is almost never
            both an audit and a GST return — so the grid drew one card
            beside an empty half for every job that had either.
          */}
          <div className="flex flex-col gap-4">
            {/* --- the audit's own file, which is a screen of its own (P3-13) - */}
            {engagement.isAudit && (
              <section className="rounded-ledger border-rule bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
                <div>
                  <h2 className="font-display text-15 font-semibold">
                    Audit file
                  </h2>
                  <p className="text-13 text-ink-muted max-w-[60ch]">
                    The working papers, the programme for each area, and
                    everything the audit has found. Its own screen, because a
                    file is read as a file.
                  </p>
                </div>
                <Link
                  href={`/practice/audit/${engagement.id}`}
                  className="rounded-control border-carbon text-14 h-9 border px-3 leading-9 font-medium"
                >
                  Open the file
                </Link>
              </section>
            )}

            {/* --- the month's GST data, before anything is prepared (P3-12) - */}
            {engagement.isGst && (
              <GstPanel
                gst={engagement.gst}
                engagementId={engagement.id}
                mayEdit={canEditWork}
                isPartner={isPartner}
              />
            )}
          </div>
        </>
      )}

      {/* ================= FILES ======================================== */}
      {/*
        What the client owes and what has arrived — the whole checklist,
        both sides, plus anything attached to the job itself.

        It is the *record* here, not the work: the step you are on draws
        its own rows inside its card on the Work tab, and this is where
        somebody comes to ask "what have we actually got?".

        `id="documents"` lives here now. The next-action card and the
        Issues list link to it, and both already link to the job — the
        fragment lands on the right tab because those links go to the
        Files tab when they are about a document.
      */}
      {tab === "files" && (
        <div id="documents">
          <FilesTab
            engagementId={engagement.id}
            documents={documents}
            letters={letters}
            mayEdit={mayAttach && canEditWork}
            docRequests={docRequests}
          />
        </div>
      )}

      {/* ================= SETUP ======================================== */}
      {tab === "setup" && (
        <>
          {/* --- what it is worth (P3-4) ------------------------------------- */}
          {(mayPrice ||
            engagement.money.scope !== "billable" ||
            engagement.money.pending) && (
            <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
              <h2 className="font-display text-15 font-semibold">
                How this is paid for
              </h2>
              <p
                className={`text-14 ${engagement.money.blocked ? "text-redpen" : ""}`}
              >
                {engagement.money.line || engagement.money.label}
                {!engagement.money.line && engagement.money.detail && (
                  <span className="text-ink-muted">
                    {" "}
                    — {engagement.money.detail}
                  </span>
                )}
              </p>
              <FeeScope
                money={{
                  id: engagement.id,
                  feePaise: engagement.feePaise,
                  scope: engagement.money.scope,
                  waiver: engagement.money.waiver,
                }}
                canPrice={mayPrice}
                isPartner={isPartner}
                whyNoPricing={engagement.money.whyNoPricing}
                onResult={(result) => {
                  setMessage(result);
                  if (result?.ok) refresh();
                }}
              />
              {engagement.money.waiver && !isPartner && (
                <p className="text-13 text-ink-muted">
                  Waiting for a partner. The job stays on the list to bill until
                  they decide.
                </p>
              )}
            </section>
          )}

          {/* --- who and when ------------------------------------------------ */}
          {mayManage && (
            <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
              <h2 className="font-display text-15 font-semibold">
                Assignment and dates
              </h2>
              <AssignmentPanel
                engagement={engagement}
                team={team}
                pending={pending}
                onSave={(input) =>
                  run(() => saveAssignment(engagement.id, input))
                }
              />
            </section>
          )}

          {/*
        The audit file link and the GST data moved to the Work tab
        (03-11-2026): both are working data, not settings on the job, and
        a tab called Setup is the wrong place to read the month’s
        turnover off.

        Approval and Filings used to be panels here too. Both became a
        step rather than being deleted, because both set something the
        pipeline reads: `gates.approved` is what `blocksFiling` consults —
        delete the only button that sets it and no job could ever be filed
        again — and a filing needs its acknowledgement recorded somewhere.

        Both are back, as the two folded records below, because neither was
        ever the preparer's next move: Filing on 12-11-2026 and Review on
        13-11-2026. `#approval` and `#filings` are gone as anchors;
        `#review` is the one `lib/issues/next.js` and the next-action band
        point at.
      */}

          {/*
        The two records, neither of which is a step any more.

        A filing number and a signed-off review list are *records* — read
        back long after the moment they were written — and a record nobody
        can open after the fact is worse than one in an awkward place. So
        both are here, folded shut, with their state on the summary line,
        open at any point in the job.
      */}
          {/*
            Filing is a record, not a step (owner, 12-11-2026).

            It used to appear here only once its own step had closed —
            which was once the UDIN question had been answered. With that
            question moved to the step the firm chooses, and Filing no
            longer a step at all, waiting for anything would mean the
            acknowledgement number had nowhere to be typed. So it is
            always here, folded, with its state on the summary line.
          */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Folded
              title={hasMilestones ? "UDIN and the report" : "Filing"}
              state={filingState(engagement)}
            >
              {filingWork}
            </Folded>

            {/*
              Review is a record, not a step (owner, 13-11-2026).

              It appeared here only once its own step had closed, which was
              the right rule while it *was* a step: before that the step
              itself held it, and showing it twice would have put the next
              thing to do back on screen. With the step gone, waiting for
              anything would mean the reviewer had nowhere to tick a point
              and nobody could approve the work for filing. So it is always
              here, folded, with its state on the summary line — and it is
              what `#review` points at.
            */}
            <Folded id="review" title="Review" state={reviewState(engagement)}>
              {reviewWork}
            </Folded>
          </div>
        </>
      )}

      {/*
        Deleting it, on Setup and nowhere else (owner, 13-11-2026).

        It was put on every tab on 12-11-2026, on the reasoning that
        nobody looks in Setup an hour after raising a job against the
        wrong client. In practice that put a red-edged panel under the
        work on four screens that are read all day, which is four
        reminders of a thing almost nobody does. Setup is where the job's
        settings are and deleting it is the last of them.
      */}
      {tab === "setup" && mayDelete && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
          <h2 className="font-display text-15 font-semibold">
            Delete this job
          </h2>
          <p className="text-13 text-ink-muted max-w-[72ch]">
            For a job raised by mistake — the wrong client, the wrong period. It
            goes with its files, letters, document requests, time entries and
            comments, and every one of them stays in the audit trail with your
            reason. Work the firm really did belongs on{" "}
            <span className="text-ink">Cancelled</span> instead, where it keeps
            its history.
          </p>
          <label className="flex max-w-[48ch] flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Reason (required)
            </span>
            <input
              value={binReason}
              onChange={(event) => setBinReason(event.target.value)}
              placeholder="Raised against the wrong client"
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>
          <Action
            id="delete-job"
            tone="plain"
            pending={pending}
            why={binReason.trim() ? null : "Type a reason above to delete it."}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteEngagement(engagement.id, binReason);
                setMessage(result);
                if (result?.ok) router.push("/engagements");
              })
            }
            className="hover:bg-redpen-wash hover:text-redpen self-start"
          >
            Delete job {engagement.code}
          </Action>
        </section>
      )}

      {/*
        Conversation and Pipeline history are gone (owner, 03-11-2026).

        The screen had eleven panels and the work was in two of them. The
        history was the audit log told twice — `auditLogs` holds every
        status change with its reason and its hash, and the Activity tab
        reads it — so the panel was a second copy that could only ever
        agree or be wrong.

        The conversation is a real removal, not a move: the two comment
        threads and the with-client messaging went with it. What the owner
        asked for instead is the letters panel below, where a document is
        edited and sent to the client as a document. Comments already
        written are still in `Comment` and still in the audit trail;
        nothing was deleted, and the panel can come back in an afternoon
        if the firm misses it.
      */}
    </div>
  );
}

/**
 * One side of the checklist — what the client owes us, or what we produce.
 *
 * ## Asking for documents is a bulk move (owner, 11-11-2026)
 *
 * Every client row used to carry its own "Ask the client" button, so a
 * step that wanted six documents wanted six clicks. Worse, that button
 * only set the status to Requested: it sent nothing, and the client heard
 * from us only when somebody went to the Files tab and made a request by
 * hand.
 *
 * So the asking lives here instead, on the list, because the set being
 * asked for is a property of the list and not of any one row: tick the
 * rows, press once, and `createDocRequest` makes **one** request holding
 * all of them and sends **one** email naming them all. That is the server
 * action the Files tab already used — it has always taken `itemIds` — so
 * nothing new had to be written to make this work, and the follow-up
 * chasing, the audit entry and the seven-day link are the same ones.
 *
 * `We produce` gets no tick boxes at all: asking a client to send us the
 * GSTR-2B reconciliation we are being paid to prepare is the mistake the
 * per-row button also used to make (QA 09-11-2026, #26).
 */
function ChecklistGroup({
  title,
  items,
  engagementId,
  disabled,
  run,
  documents,
  mayAttach,
  mayGenerate = false,
  letters = null,
  refresh,
  /** True for the client's side only — see the note above. */
  askable = false,
}) {
  const [picked, setPicked] = useState([]);

  if (items.length === 0) return null;

  /**
   * What is still outstanding, by the same two helpers `createDocRequest`
   * filters on — so a row that offers a tick box is a row the request will
   * actually include, and the count on the button is the count in the
   * email. A `Replacement requested` row is outstanding and is the one
   * most worth re-asking for; `Received` and `Accepted` are not.
   */
  const open =
    askable && !disabled
      ? items.filter(
          (item) =>
            // a document, and nothing else: `createDocRequest` drops the
            // other kinds, and a tick box offering to ask the client for
            // something that has no upload behind it is the dead control
            // the whole P3-2 pass was about
            (item.kind ?? "upload") === "upload" &&
            !isSettled(item) &&
            !needsReview(item),
        )
      : [];
  const openIds = open.map((item) => item.id);
  // a refresh can settle a row that was ticked, so the selection is read
  // against what is open now rather than trusted
  const chosen = picked.filter((id) => openIds.includes(id));
  const allPicked = open.length > 0 && chosen.length === open.length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-12 text-ink-muted font-medium">{title}</h3>

        {open.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {open.length > 1 && (
              <label className="text-12 text-ink-muted flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? [] : openIds)}
                />
                Tick all <span className="num">{open.length}</span>
              </label>
            )}
            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={() =>
                run(async () => {
                  const out = await createDocRequest(engagementId, {
                    itemIds: chosen,
                    email: true,
                  });
                  if (out?.ok) setPicked([]);
                  return out;
                })
              }
              className="rounded-ledger bg-carbon text-12 text-on-carbon h-7 px-2 font-medium disabled:opacity-50"
            >
              {chosen.length === 0
                ? "Tick what to ask for"
                : `Ask the client for ${chosen.length} in one email`}
            </button>
          </div>
        )}
      </div>

      <ul className="flex flex-col">
        {items.map((item) => {
          const attached = documents.filter(
            (d) => d.checklistItemId === item.id,
          );
          const canAsk = openIds.includes(item.id);
          return (
            <li
              key={item.id}
              className="border-rule flex flex-col gap-2 border-b py-2 last:border-0"
            >
              {/*
                Six states and three of the moves need a reason, so this is
                buttons and inline forms rather than a dropdown (P3-2). A
                dropdown cannot ask why.
              */}
              <ChecklistRow
                engagementId={engagementId}
                item={item}
                disabled={disabled}
                run={run}
                mayGenerate={mayGenerate}
                letters={letters}
                pick={
                  canAsk
                    ? {
                        checked: chosen.includes(item.id),
                        onChange: () =>
                          setPicked((was) =>
                            was.includes(item.id)
                              ? was.filter((id) => id !== item.id)
                              : [...was, item.id],
                          ),
                      }
                    : null
                }
              />

              {attached.length > 0 && (
                <DocumentList
                  documents={attached}
                  mayDelete={mayAttach}
                  onChange={refresh}
                  empty=""
                />
              )}

              {/*
                Only a row that is a document gets an uploader. A tick, a
                link to another screen or a letter the firm drafts has
                nothing to attach, and an upload box under one of them is
                an invitation to file the evidence in the wrong place.
              */}
              {mayAttach && (item.kind ?? "upload") === "upload" && (
                <Uploader
                  engagementId={engagementId}
                  checklistItemId={item.id}
                  label={`Attach to “${item.name}”`}
                  onDone={refresh}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A panel whose step has passed, kept on the page but shut.
 *
 * `<details>` and nothing else: a disclosure is a browser feature, it is
 * keyboard-operable and findable by the browser's own in-page search
 * without any help from us, and it needs no state that could get out of
 * step with the panel re-rendering around it.
 *
 * The summary carries the state, so the common case — "is the review
 * done?" — is answered without opening anything.
 */
/**
 * The one line on the folded Filing panel, so the common questions —
 * *has this gone in?* and *is the number recorded?* — are answered without
 * opening anything.
 *
 * The filings come first because they are the thing with a date on them;
 * the UDIN is added where there is one. A job with neither says so plainly
 * rather than showing an empty summary.
 */
/**
 * The review, in one line on the folded summary: how far the points have
 * got, and whether the work has been approved for filing. Both, because
 * they are two different acts — a reviewer can tick every point and still
 * not have approved the version.
 */
function reviewState(engagement) {
  const items = engagement.reviewChecklist ?? [];
  const ticked = items.filter((item) => item.checked).length;
  const parts = [
    items.length === 0
      ? "no points on this job"
      : reviewComplete(engagement)
        ? `all ${items.length} points ticked`
        : `${ticked} of ${items.length} points ticked`,
  ];
  if (engagement.gates.approved) {
    parts.push(`version ${engagement.gates.approvedVersion} approved`);
  }
  return parts.join(" · ");
}

function filingState(engagement) {
  const parts = [];
  const milestones = engagement.milestones ?? [];
  if (milestones.length) {
    const filed = milestones.filter((row) => row.filedOn).length;
    parts.push(
      filed === milestones.length
        ? `all ${milestones.length} filed`
        : `${filed} of ${milestones.length} filed`,
    );
  } else if (engagement.ackNo) {
    parts.push(`acknowledgement ${engagement.ackNo}`);
  } else if (engagement.filedOn) {
    parts.push(`filed ${engagement.filedOn}`);
  }
  if (engagement.udin) parts.push(`UDIN ${engagement.udin}`);
  return parts.length ? parts.join(" · ") : "nothing recorded yet";
}

function Folded({ id, title, state, children }) {
  return (
    <details
      id={id}
      className="rounded-ledger border-rule bg-surface group border p-4"
    >
      <summary className="text-ink-muted hover:text-ink flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-display text-15 text-ink font-semibold">
          <span
            aria-hidden="true"
            className="text-11 text-faint mr-1.5 inline-block transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          {title}
        </span>
        <span className="text-12">{state}</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/**
 * The control on the next sentence (P3-6).
 *
 * Either a link to the part of this page that does the thing, or the action
 * itself when it is one click on one record. `help` only changes the label:
 * a manager doing somebody else's step should see that is what they are
 * doing, and the job's own log records it as help either way.
 */
function NextAction({ action, help, pending, onRun }) {
  const label = help ? `Help: ${action.label.toLowerCase()}` : action.label;

  /**
   * The review record owns this one, and the same action twice on one
   * screen is what P3-8 set out to stop — it also means two buttons that
   * can disagree about whether they are disabled. The band points at it.
   *
   * It pointed at `#approval` until the Approval panel was folded into
   * the Review step (03-11-2026), and at `#steps` until Review stopped
   * being a step (13-11-2026). `?tab=work#review` is the record itself.
   */
  if (action.act === "approve-work") {
    return (
      <a
        href="?tab=work#review"
        className="rounded-control border-carbon text-13 h-8 border px-3 leading-8 font-medium"
      >
        {help ? "Help: approve" : "Approve"}
      </a>
    );
  }

  /*
    A same-page jump: an anchor, or a tab on this screen with an anchor
    after it. A plain `<a>` rather than next/link, so the browser does the
    scrolling it already knows how to do.
  */
  if (action.href?.startsWith("#") || action.href?.startsWith("?")) {
    return (
      <a
        href={action.href}
        className="rounded-control border-carbon text-13 h-8 border px-3 leading-8 font-medium"
      >
        {label}
      </a>
    );
  }
  if (action.href) {
    return (
      <Link
        href={action.href}
        className="rounded-control border-carbon text-13 h-8 border px-3 leading-8 font-medium"
      >
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (action.act === "tick-task")
          onRun(() => setTaskDone(action.id, action.taskId, true));
        else if (action.act === "to-review")
          onRun(() => changeStatus(action.id, "Under review"));
      }}
      className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
    >
      {label}
    </button>
  );
}
