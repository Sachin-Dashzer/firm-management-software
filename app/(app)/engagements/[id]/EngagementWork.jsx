"use client";

import { saving } from "@/lib/forms/saving";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NEEDS_REASON } from "@/lib/engagements/status";
import {
  stepsView,
  itemsForStep,
  udinAnswered,
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
import FilingPanel from "./FilingPanel";
import ReviewPanel from "./ReviewPanel";
import GstPanel from "./GstPanel";
import ChecklistRow from "./ChecklistRow";
import {
  approveWork,
  changeStatus,
  recordConfirmation,
  saveAssignment,
  setTaskDone,
} from "../actions";

/**
 * The working face of an engagement: the pipeline buttons, the sub-tasks, the
 * two checklists and the reviewer's panel.
 *
 * Every control here is also enforced on the server — a button missing from
 * this screen is a courtesy, not a lock.
 */
export default function EngagementWork({
  /**
   * Which face of the job this is: "work", "files" or "setup" (owner,
   * 03-11-2026).
   *
   * One component rather than three, because every panel in here shares
   * `message`, `pending` and `run` — splitting them into three client
   * components would mean three copies of that state and three places a
   * save could be reported. Only one tab is ever rendered, so nothing is
   * paying for the others.
   */
  tab = "work",
  engagement,
  /** Every move this status could make, each with its refusal or null (P3-8). */
  moves = [],
  canEditWork,
  mayManage,
  mayPrice = false,
  isPartner = false,
  isReviewer,
  actorRole,
  team,
  documents = [],
  mayAttach = false,
}) {
  const [message, setMessage] = useState(null);
  /** Work from before P3-1 has none, and keeps the old single filing box. */
  const hasMilestones = (engagement.milestones ?? []).length > 0;
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(null); // status awaiting a reason
  const [reason, setReason] = useState("");
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

  function move(to) {
    // On hold, Cancelled and sending work back all need a reason first
    const needs =
      NEEDS_REASON.includes(to) ||
      (to === "In progress" &&
        ["Under review", "Filed / delivered"].includes(engagement.status));
    if (needs) {
      setAsking(to);
      setReason("");
      return;
    }
    startTransition(async () => {
      const result = await changeStatus(engagement.id, to);
      setMessage(result);
      if (to === "Completed" && result?.ok) setJustStamped(true);
    });
  }

  // files attached to the engagement rather than to one checklist item
  const loose = documents.filter((d) => !d.checklistItemId);

  /**
   * Where the job is. The one answer to "which step is open", so the panel
   * and everything that reads it cannot end up disagreeing.
   *
   * It used to decide the page's layout too — one column or two, depending
   * on whether the open step had work of its own. The tabs retired that:
   * the checklist is its own tab now, so the steps always have the column
   * to themselves and `openKey` is no longer needed here.
   */
  const steps = stepsView(engagement, {
    isReviewer,
    reviewerName: engagement.reviewerName,
  });

  /**
   * The checklist, for one step or for the whole job.
   *
   * Since the catalog can divide a checklist by step (03-11-2026) the
   * engagement screen asks the same question the panel does: *what does
   * the step I am on need?* So this takes the rows rather than reading
   * them, and is called twice — once with the open step's own rows, drawn
   * inside its card, and once with everything, for the record below.
   *
   * The loose files and the free uploader belong to the job, not to a
   * step, so they are only drawn on the whole-job rendering.
   */
  function checklistFor(items, { whole = false } = {}) {
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
          refresh={refresh}
          // only this side can be asked for: the rows below are ours
          askable={mayAttach}
        />
        <ChecklistGroup
          title="We produce"
          items={fromUs}
          engagementId={engagement.id}
          disabled={!canEditWork || pending}
          run={run}
          documents={documents}
          mayAttach={mayAttach && canEditWork}
          refresh={refresh}
        />

        {whole && loose.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-12 text-ink-muted font-medium">
              Other files on this engagement
            </h3>
            <DocumentList
              documents={loose}
              mayDelete={mayAttach && canEditWork}
              onChange={refresh}
            />
          </div>
        )}

        {whole && mayAttach && canEditWork && (
          <Uploader
            engagementId={engagement.id}
            label="Attach a file not on the checklist"
            onDone={refresh}
          />
        )}
      </div>
    );
  }

  /** Just this step's rows, for the open step's card. */
  const stepChecklist =
    steps.open?.kind === "task"
      ? checklistFor(itemsForStep(engagement, steps.open.index))
      : null;

  /** Everything, for the panel that is the record rather than the work. */
  const checklistWork = checklistFor(engagement.checklist, { whole: true });

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
   * The Review step's work: the reviewer's points, and the approval that
   * used to be the "Approval" panel.
   *
   * **The approval could not simply be deleted with its section.** It is
   * `gates.approved`, and `blocksFiling` reads it — remove the only button
   * that sets it and no job could ever be filed again. It is the
   * reviewer's act, the Review step is the reviewer's step, so it belongs
   * here: tick the points, approve the version, and where the service
   * wants it, record the client's confirmation of the figures.
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
        onClick={() => move("Completed")}
      >
        Mark this engagement Completed
      </Action>
    </div>
  );

  /** Keyed by the open step's `workKey`; only the open one is ever drawn. */
  const stepWork = {
    documents: stepChecklist,
    filing: filingWork,
    review: reviewWork,
    submit: submitWork,
  };

  return (
    <div className="flex flex-col gap-6">
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      {/* ================= WORK ========================================= */}
      {tab === "work" && (
        <>
          {/* --- the one next thing (P3-6) --------------------------------- */}
          {engagement.next && engagement.next.stance !== "done" && (
            <section className="rounded-ledger border-carbon bg-carbon-wash flex flex-wrap items-center justify-between gap-3 border p-3">
              <div>
                <p className="text-12 text-ink-muted font-medium">Next</p>
                <p className="text-14">{engagement.next.text}</p>
                {engagement.next.why && (
                  <p className="text-12 text-ink-muted">
                    {engagement.next.why}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {engagement.next.stance === "nudge" ? (
                  <span className="text-13 text-ink-muted">
                    Nudge {engagement.next.who}
                  </span>
                ) : engagement.next.stance === "watch" ? (
                  <span className="text-13 text-ink-muted">
                    With {engagement.next.who}
                  </span>
                ) : (
                  engagement.next.action && (
                    <NextAction
                      action={engagement.next.action}
                      // a manager stepping into somebody else's job says so
                      help={engagement.next.stance === "help"}
                      pending={pending}
                      onRun={run}
                    />
                  )
                )}
              </div>
            </section>
          )}

          {/* at risk: the deadline is still ahead, a target has already gone */}
          {engagement.atRisk && (
            <p className="rounded-ledger border-waiting bg-waiting-wash text-13 text-waiting border px-3 py-2">
              <strong>At risk.</strong> {engagement.atRisk}. The statutory date
              has not passed, so this can still be saved.
            </p>
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

          {/* --- the pipeline ------------------------------------------------ */}
          <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-15 mr-2 font-semibold">
                Move this on
              </h2>
              {moves.length === 0 && (
                <p className="text-13 text-ink-muted">
                  {engagement.status === "Completed"
                    ? "Completed and locked. Comments are still open."
                    : engagement.status === "Cancelled"
                      ? "Cancelled."
                      : "There is nowhere for this to go from here."}
                </p>
              )}
              {moves.map(({ to, why }) => (
                <Action
                  key={to}
                  id={`move-${to.replace(/W/g, "")}`}
                  why={why}
                  pending={pending}
                  tone="plain"
                  onClick={() => move(to)}
                >
                  {to === "In progress" &&
                  ["Under review", "Filed / delivered"].includes(
                    engagement.status,
                  )
                    ? "Send back for rework"
                    : to}
                </Action>
              ))}
            </div>

            {asking && (
              <div className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-2 border p-3">
                <label className="flex flex-col gap-1">
                  <span className="text-13 font-medium">
                    {asking === "In progress"
                      ? "What needs redoing?"
                      : `Why is this going ${asking.toLowerCase()}?`}
                  </span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending || !reason.trim()}
                    onClick={() => {
                      const to = asking;
                      const why = reason;
                      setAsking(null);
                      run(() => changeStatus(engagement.id, to, why));
                    }}
                    className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setAsking(null)}
                    className="text-14 text-ink-muted underline underline-offset-4"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <dl className="text-13 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Pair label="Doing the work" value={engagement.assigneeName} />
              <Pair label="Reviewing" value={engagement.reviewerName} />
              {(engagement.helperNames ?? []).length > 0 && (
                <Pair
                  label="Also on it"
                  value={engagement.helperNames.join(", ")}
                />
              )}
              <Pair
                label="Service version"
                value={`v${engagement.templateVersion} (as created)`}
              />
              <Pair
                label="Fee"
                value={`${engagement.feePaise > 0 ? engagement.fee : "Not agreed"} · ${engagement.billingStatus}`}
              />
              {engagement.reworkCount > 0 && (
                <Pair
                  label="Sent back"
                  value={`${engagement.reworkCount} ${engagement.reworkCount === 1 ? "time" : "times"}`}
                />
              )}
            </dl>
          </section>

          {/*
        The work comes first (owner, 03-11-2026).

        The steps used to sit below the fee and the assignment, which is
        the order the panels happened to be built in and not the order
        anybody reads them. Somebody opening a job wants the step they
        are on; who it is assigned to and what it is worth are settings
        on it, and settings go after the thing they are settings for.
      */}
          {/* --- the steps ---------------------------------------------------- */}
          {/*
        One step at a time, full width.

        This used to be a two-column layout — the steps beside the whole
        checklist — which collapsed to one column whenever the open step
        had work of its own to draw. The tabs retired the branch: the
        checklist is the Files tab now, so the steps have the column to
        themselves on every job and the layout has one shape instead of
        two.

        `#steps` stays as the anchor the next-action band and the Issues
        list point at, since the approval, the filing and the client's
        confirmation all live inside a step.
      */}
          <div id="steps">
            <StepsPanel
              engagement={engagement}
              team={team}
              actorRole={actorRole}
              canEditWork={canEditWork}
              mayManage={mayManage}
              isReviewer={isReviewer}
              pending={pending}
              run={run}
              work={stepWork}
            />
          </div>

          {/* --- the audit file and the month's GST data ---------------------- */}
          <div className="grid gap-6 lg:grid-cols-2">
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
        <section
          id="documents"
          className="rounded-ledger border-rule bg-surface flex flex-col gap-4 border p-4"
        >
          <div>
            <h2 className="font-display text-15 font-semibold">
              Checklist
              {engagement.checklist.length > 0 && (
                <span className="num text-ink-muted ml-1.5 font-normal">
                  · {engagement.checklist.length}
                </span>
              )}
            </h2>
            <p className="text-13 text-ink-muted max-w-[72ch]">
              Everything this job needs, whichever step asks for it. The step
              you are on shows its own on the Work tab.
            </p>
          </div>
          {checklistWork}
        </section>
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

        Approval and Filings used to be panels here too. Both moved into
        the step that owns them rather than being deleted, because both
        set something the pipeline reads: `gates.approved` is what
        `blocksFiling` consults — delete the only button that sets it and
        no job could ever be filed again — and a filing needs its
        acknowledgement recorded somewhere. The approval is on the
        **Review** step and the acknowledgements on the **Filing** step.

        `#approval` and `#filings` are gone as anchors; `#steps` replaces
        both, and `lib/issues/next.js` and the next-action band point at
        it.
      */}

          {/*
        The two step panels, once their step has passed.

        Taking them off the bottom of the page was the owner's request and
        it is right while the work is live — but a filing number and a
        signed-off review list are *records*, and a record nobody can open
        after the fact is worse than one in an awkward place.

        So each appears here **only once its own step is closed**, folded
        shut, with its state on the summary line. Before that there is no
        record to read, and showing the panel early would put the next step
        back on screen — which is the thing being fixed.
      */}
          {(udinAnswered(engagement) || reviewComplete(engagement)) && (
            <div className="grid gap-6 lg:grid-cols-2">
              {udinAnswered(engagement) && (
                <Folded
                  title={hasMilestones ? "UDIN and the report" : "Filing"}
                  state={
                    engagement.udin
                      ? `UDIN ${engagement.udin}`
                      : "Recorded as needing no UDIN"
                  }
                >
                  {filingWork}
                </Folded>
              )}
              {reviewComplete(engagement) && (
                <Folded
                  title="Review"
                  state={
                    engagement.reviewChecklist.length === 0
                      ? "No points on this job"
                      : `all ${engagement.reviewChecklist.length} points ticked`
                  }
                >
                  {reviewWork}
                </Folded>
              )}
            </div>
          )}
        </>
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
      ? items.filter((item) => !isSettled(item) && !needsReview(item))
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

              {mayAttach && (
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
function Folded({ title, state, children }) {
  return (
    <details className="rounded-ledger border-rule bg-surface group border p-4">
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

function Pair({ label, value }) {
  return (
    <div className="flex gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * The button on the "Next" band (P3-6).
 *
 * Either a link to the part of this page that does the thing, or the action
 * itself when it is one click on one record. `help` only changes the label:
 * a manager doing somebody else's step should see that is what they are
 * doing, and the job's own log records it as help either way.
 */
function NextAction({ action, help, pending, onRun }) {
  const label = help ? `Help: ${action.label.toLowerCase()}` : action.label;

  /**
   * The Review step owns this one, and the same action twice on one screen
   * is what P3-8 set out to stop — it also means two buttons that can
   * disagree about whether they are disabled. The band points at it.
   *
   * It pointed at `#approval` until the Approval panel was folded into
   * that step (03-11-2026); `#steps` is the anchor that is always there.
   */
  if (action.act === "approve-work") {
    return (
      <a
        href="#steps"
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
