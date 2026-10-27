"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRIORITIES, NEEDS_REASON } from "@/lib/engagements/status";
import { canExecute } from "@/lib/services/catalog";
import { AUDIT_TYPES, OPINIONS, MODIFIED_OPINIONS } from "@/lib/practice/books";
import { ROLE_LABELS } from "@/lib/permissions";
import Uploader from "@/components/documents/Uploader";
import DocumentList from "@/components/documents/DocumentList";
import AuditTick from "@/components/ledger/AuditTick";
import CompletionStamp from "@/components/ledger/CompletionStamp";
import FeeScope from "@/components/billing/FeeScope";
import Action from "@/components/ui/Action";
import FilingMilestones from "./FilingMilestones";
import GstPanel from "./GstPanel";
import ChecklistRow from "./ChecklistRow";
import {
  addEngagementComment,
  approveWork,
  changeStatus,
  reassign,
  recordConfirmation,
  saveFiling,
  setInternalDue,
  setPriority,
  setReviewItem,
  setTaskDone,
  assignTask,
} from "../actions";

/**
 * The working face of an engagement: the pipeline buttons, the sub-tasks, the
 * two checklists, the reviewer's panel and the comment thread.
 *
 * Every control here is also enforced on the server — a button missing from
 * this screen is a courtesy, not a lock.
 */
export default function EngagementWork({
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
  comments,
  documents = [],
  mayAttach = false,
}) {
  const [message, setMessage] = useState(null);
  /**
   * The two halves. Split here rather than in two props, so the page keeps
   * one query and the counts on the chips cannot disagree with the lists.
   */
  const internalComments = comments.filter((row) => row.internal);
  const clientComments = comments.filter((row) => !row.internal);
  /** Work from before P3-1 has none, and keeps the old single filing box. */
  const hasMilestones = (engagement.milestones ?? []).length > 0;
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(null); // status awaiting a reason
  const [reason, setReason] = useState("");
  // true only for the moment somebody completed it, so the stamp presses
  // once rather than every time a finished engagement is opened
  const [juststamped, setJustStamped] = useState(false);
  /** Which half of the conversation is open (P3-17b). Internal by default. */
  const [thread, setThread] = useState("internal");
  // the opinion decides whether the reason field is on screen, so it is held
  // here rather than read off the form
  const [opinion, setOpinion] = useState(engagement.assurance?.opinion ?? "");

  const router = useRouter();

  function run(action) {
    startTransition(async () => setMessage(await action()));
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

  const client = engagement.checklist.filter((c) => c.side === "client");
  const firm = engagement.checklist.filter((c) => c.side === "firm");
  // files attached to the engagement rather than to one checklist item
  const loose = documents.filter((d) => !d.checklistItemId);

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

      {/* --- the one next thing (P3-6) --------------------------------- */}
      {engagement.next && engagement.next.stance !== "done" && (
        <section className="rounded-ledger border-carbon bg-carbon-wash flex flex-wrap items-center justify-between gap-3 border p-3">
          <div>
            <p className="text-12 text-ink-muted font-medium tracking-wide uppercase">
              Next
            </p>
            <p className="text-14">{engagement.next.text}</p>
            {engagement.next.why && (
              <p className="text-12 text-ink-muted">{engagement.next.why}</p>
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
          <strong>At risk.</strong> {engagement.atRisk}. The statutory date has
          not passed, so this can still be saved.
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
              ["Under review", "Filed / delivered"].includes(engagement.status)
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
          <div className="grid gap-3 sm:grid-cols-3">
            <Picker
              label="Assignee"
              value={engagement.assigneeId}
              team={team}
              onChange={(id) =>
                run(() =>
                  reassign(engagement.id, {
                    assigneeId: id,
                    reviewerId: engagement.reviewerId,
                  }),
                )
              }
            />
            <Picker
              label="Reviewer"
              value={engagement.reviewerId}
              team={team.filter((u) => u.role === "ca" || u.role === "partner")}
              onChange={(id) =>
                run(() =>
                  reassign(engagement.id, {
                    assigneeId: engagement.assigneeId,
                    reviewerId: id,
                  }),
                )
              }
            />
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">
                Internal due date
              </span>
              <input
                type="date"
                defaultValue={engagement.internalDueInput}
                onChange={(e) =>
                  run(() => setInternalDue(engagement.id, e.target.value))
                }
                className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">
                Priority
              </span>
              <select
                defaultValue={engagement.priority}
                onChange={(e) =>
                  run(() => setPriority(engagement.id, e.target.value))
                }
                className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {/* --- the work ----------------------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <h2 className="font-display text-15 font-semibold">Steps</h2>
          <ul className="flex flex-col">
            {engagement.tasks.map((task) => {
              // the step's own floor, or the service's when it names none
              const floor = task.minRole || engagement.minExecRole;
              const mayTick = canExecute(actorRole, floor);
              return (
                <li
                  key={task.id}
                  className="border-rule flex flex-wrap items-center gap-2 border-b py-2 last:border-0"
                >
                  <input
                    type="checkbox"
                    id={`task-${task.id}`}
                    checked={task.done}
                    disabled={!canEditWork || !mayTick || pending}
                    onChange={(e) =>
                      run(() =>
                        setTaskDone(engagement.id, task.id, e.target.checked),
                      )
                    }
                  />
                  <label
                    htmlFor={`task-${task.id}`}
                    className={`text-14 flex-1 ${task.done ? "text-ink-muted line-through" : ""}`}
                  >
                    {task.name}
                    {task.minRole && (
                      <span className="text-12 text-brass-ink">
                        {" "}
                        · {ROLE_LABELS[task.minRole]} or above
                      </span>
                    )}
                    {!mayTick && (
                      <span className="text-12 text-ink-muted">
                        {" "}
                        · not yours to tick
                      </span>
                    )}
                  </label>
                  {mayManage && (
                    <select
                      aria-label={`Who does “${task.name}”`}
                      value={task.assigneeId}
                      disabled={!canEditWork || pending}
                      onChange={(e) =>
                        run(() =>
                          assignTask(engagement.id, task.id, e.target.value),
                        )
                      }
                      className="rounded-control border-rule bg-paper text-13 h-8 border px-1"
                    >
                      <option value="">— anyone —</option>
                      {team
                        .filter((u) => canExecute(u.role, floor))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  )}
                </li>
              );
            })}
            {engagement.tasks.length === 0 && (
              <li className="text-13 text-ink-muted">
                This service has no steps.
              </li>
            )}
          </ul>
        </section>

        <section
          id="documents"
          className="rounded-ledger border-rule bg-surface flex flex-col gap-4 border p-4"
        >
          <h2 className="font-display text-15 font-semibold">Checklist</h2>
          <ChecklistGroup
            title="From the client"
            items={client}
            engagementId={engagement.id}
            disabled={!canEditWork || pending}
            run={run}
            documents={documents}
            mayAttach={mayAttach && canEditWork}
            refresh={refresh}
          />
          <ChecklistGroup
            title="We produce"
            items={firm}
            engagementId={engagement.id}
            disabled={!canEditWork || pending}
            run={run}
            documents={documents}
            mayAttach={mayAttach && canEditWork}
            refresh={refresh}
          />

          {loose.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-12 text-ink-muted font-medium tracking-wide uppercase">
                Other files on this engagement
              </h3>
              <DocumentList
                documents={loose}
                mayDelete={mayAttach && canEditWork}
                onChange={refresh}
              />
            </div>
          )}

          {mayAttach && canEditWork && (
            <Uploader
              engagementId={engagement.id}
              label="Attach a file not on the checklist"
              onDone={refresh}
            />
          )}
        </section>
      </div>

      {/* --- filing and review -------------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* --- the audit's own file, which is a screen of its own (P3-13) - */}
        {engagement.isAudit && (
          <section className="rounded-ledger border-rule bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
            <div>
              <h2 className="font-display text-15 font-semibold">Audit file</h2>
              <p className="text-13 text-ink-muted max-w-[60ch]">
                The working papers, the programme for each area, and everything
                the audit has found. Its own screen, because a file is read as a
                file.
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

        {/* --- the gates before a filing (P3-5) ------------------------- */}
        <section
          id="approval"
          className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-15 font-semibold">Approval</h2>
            {engagement.gates.version > 1 && (
              <span className="text-12 text-ink-muted">
                Version {engagement.gates.version}
              </span>
            )}
          </div>

          {engagement.gates.approvedByName ? (
            <p className="text-14">
              Version {engagement.gates.approvedVersion} approved by{" "}
              <strong>{engagement.gates.approvedByName}</strong> on{" "}
              {engagement.gates.approvedOn}.
            </p>
          ) : (
            <p className="text-14">
              Not approved yet. A reviewer approves the work{" "}
              <strong>before</strong> anything is filed, so a disagreement is
              still a conversation rather than a revised return.
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
            <div className="border-rule flex flex-col gap-2 border-t pt-3">
              <h3 className="text-16 font-semibold">
                The client confirms the figures
              </h3>
              {engagement.gates.confirmation ? (
                <p className="text-14">
                  <strong>{engagement.gates.confirmation.who}</strong> confirmed
                  version {engagement.gates.confirmation.version} on{" "}
                  {engagement.gates.confirmation.when}.
                  <span className="text-13 text-ink-muted block">
                    Evidence: {engagement.gates.confirmation.evidence} ·
                    recorded by {engagement.gates.confirmation.recordedByName}
                  </span>
                </p>
              ) : (
                <p className="text-13 text-ink-muted">
                  The client, not the firm, owes the tax. Record who confirmed,
                  when, and where the confirmation can be found.
                </p>
              )}

              {engagement.gates.approved && !engagement.gates.confirmation && (
                <form
                  action={(formData) =>
                    startTransition(async () =>
                      setMessage(
                        await recordConfirmation(engagement.id, formData),
                      ),
                    )
                  }
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
        </section>

        <FilingMilestones
          engagement={engagement}
          locked={["Completed", "Cancelled"].includes(engagement.status)}
          blocked={engagement.gates.blocksFiling}
          setMessage={setMessage}
        />

        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <h2 className="font-display text-15 font-semibold">
            {hasMilestones ? "UDIN and the report" : "Filing"}
          </h2>
          <form
            action={(formData) =>
              startTransition(async () =>
                setMessage(await saveFiling(engagement.id, formData)),
              )
            }
            className="flex flex-col gap-3"
          >
            {/*
              Since P3-1 the acknowledgement belongs to a filing, and the
              Filings panel beside this one records it. Work created before
              P3-1 has no filings listed, so it keeps the single box rather
              than being stranded with nowhere to put its number.
            */}
            {!hasMilestones && (
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  Acknowledgement number
                </span>
                <input
                  name="ackNo"
                  defaultValue={engagement.ackNo}
                  className="rounded-control border-rule bg-paper text-14 h-10 border px-2 font-mono"
                />
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">
                UDIN {engagement.udinRequired && "(required for this service)"}
              </span>
              <input
                name="udin"
                defaultValue={engagement.udin}
                maxLength={18}
                className="rounded-control border-rule bg-paper text-14 h-10 border px-2 font-mono uppercase"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">
                Signed by
              </span>
              <select
                name="udinMemberId"
                defaultValue=""
                className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
              >
                <option value="">Choose the partner or CA</option>
                {team
                  .filter((person) => ["ca", "partner"].includes(person.role))
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} ·{" "}
                      {person.role === "partner" ? "Partner" : "CA"}
                    </option>
                  ))}
              </select>
              <span className="text-12 text-ink-muted">
                A UDIN is generated against a member&rsquo;s own ICAI
                membership, and the register has to say whose. Needed only when
                the number above is entered or changed.
              </span>
            </label>
            {!hasMilestones && (
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  Filed on
                </span>
                <input
                  type="date"
                  name="filedOn"
                  defaultValue={engagement.filedOnInput}
                  max={engagement.todayInput}
                  className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
                />
                <span className="text-12 text-ink-muted">
                  The day the return or form actually went in — not the day we
                  signed it off. Late is measured from here.
                </span>
              </label>
            )}

            {engagement.isAudit && (
              <fieldset className="border-rule flex flex-col gap-3 border-t pt-3">
                <legend className="text-13 text-ink-muted font-medium">
                  The audit report
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-13 text-ink-muted font-medium">
                      Audit type
                    </span>
                    <select
                      name="auditType"
                      defaultValue={engagement.assurance?.auditType ?? ""}
                      className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
                    >
                      <option value="">Not said</option>
                      {AUDIT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-13 text-ink-muted font-medium">
                      Opinion
                    </span>
                    <select
                      name="opinion"
                      value={opinion}
                      onChange={(event) => setOpinion(event.target.value)}
                      className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
                    >
                      <option value="">Not said</option>
                      {OPINIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-13 text-ink-muted font-medium">
                      Appointed on
                    </span>
                    <input
                      type="date"
                      name="appointmentDate"
                      defaultValue={engagement.assurance?.appointmentDate ?? ""}
                      className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-13 text-ink-muted font-medium">
                      Report dated
                    </span>
                    <input
                      type="date"
                      name="reportDate"
                      defaultValue={engagement.assurance?.reportDate ?? ""}
                      className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
                    />
                  </label>
                </div>
                {MODIFIED_OPINIONS.includes(opinion) && (
                  <label className="flex flex-col gap-1">
                    <span className="text-13 text-ink-muted font-medium">
                      What the opinion is modified for
                    </span>
                    <textarea
                      name="qualificationNote"
                      rows={3}
                      defaultValue={
                        engagement.assurance?.qualificationNote ?? ""
                      }
                      className="rounded-ledger border-rule bg-paper text-14 border px-2 py-2"
                    />
                    <span className="text-12 text-ink-muted">
                      Required. A report that was not clean has to say why, in
                      the file, at the time.
                    </span>
                  </label>
                )}
              </fieldset>
            )}
            <div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
              >
                Save filing details
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <h2 className="font-display text-15 font-semibold">Review</h2>
          <p className="text-13 text-ink-muted">
            {isReviewer
              ? "Tick each point before completing. The person who did the work cannot sign it off."
              : `${engagement.reviewerName} ticks these.`}
          </p>
          <ul className="flex flex-col">
            {engagement.reviewChecklist.map((item) => (
              <li
                key={item.id}
                className="border-rule flex items-center gap-2 border-b py-2 last:border-0"
              >
                {/* the real checkbox stays, and keeps the keyboard and the
                    screen reader; the tick is drawn beside it in ink */}
                <input
                  type="checkbox"
                  id={`review-${item.id}`}
                  checked={item.checked}
                  disabled={!isReviewer || pending}
                  onChange={(e) =>
                    run(() =>
                      setReviewItem(engagement.id, item.id, e.target.checked),
                    )
                  }
                  className="peer sr-only"
                />
                <label
                  htmlFor={`review-${item.id}`}
                  className="text-14 peer-focus-visible:outline-brass flex items-center gap-2 peer-focus-visible:rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:opacity-70"
                >
                  <AuditTick checked={item.checked} tone="redpen" />
                  {item.name}
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* --- the conversation, in two halves (P3-17b) ---------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">Conversation</h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Two threads, kept apart on purpose. The internal one never leaves
            the firm; the other one <strong>is sent to the client</strong> when
            you post it, and their replies come back into it.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setThread("internal")}
            aria-pressed={thread === "internal"}
            className={`rounded-chip text-13 border px-3 py-0.5 ${
              thread === "internal"
                ? "border-carbon bg-carbon text-on-carbon"
                : "border-rule bg-surface text-ink-muted"
            }`}
          >
            Internal · {internalComments.length}
          </button>
          <button
            type="button"
            onClick={() => setThread("client")}
            aria-pressed={thread === "client"}
            className={`rounded-chip text-13 border px-3 py-0.5 ${
              thread === "client"
                ? "border-carbon bg-carbon text-on-carbon"
                : "border-rule bg-surface text-ink-muted"
            }`}
          >
            With the client · {clientComments.length}
          </button>
        </div>

        <form
          key={thread}
          action={(formData) =>
            startTransition(async () => {
              const result = await addEngagementComment(
                engagement.id,
                formData,
              );
              setMessage(result);
            })
          }
          className="flex flex-col gap-2"
        >
          {/*
            The tick became a hidden field when the two threads became two
            boxes: which thread you are typing in is the answer, and a
            checkbox that contradicts the heading above it is how somebody
            sends a client an internal note.
          */}
          <input
            type="hidden"
            name="internal"
            value={thread === "internal" ? "on" : "off"}
          />
          <label className="flex flex-col gap-1">
            <span className="sr-only">
              {thread === "internal"
                ? "Internal comment"
                : "Message to the client"}
            </span>
            <textarea
              name="body"
              rows={2}
              placeholder={
                thread === "internal"
                  ? "Type @ and a name to mention someone"
                  : "This is sent to the client as it is written"
              }
              className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
            >
              {thread === "internal" ? "Add comment" : "Send to the client"}
            </button>
            <span className="text-12 text-ink-muted">
              {thread === "internal"
                ? "Stays inside the firm. Mentions tell the person."
                : "Goes to every contact with an email address, in the firm's name."}
            </span>
          </div>
        </form>

        <ul className="flex flex-col">
          {(thread === "internal" ? internalComments : clientComments).map(
            (c) => (
              <li
                key={c.id}
                className="border-rule flex flex-col gap-0.5 border-b py-2 last:border-0"
              >
                <p className="text-14 whitespace-pre-wrap">{c.body}</p>
                <p className="text-12 text-ink-muted">
                  {c.by} · {c.at}
                  {c.fromClient && " · from the client"}
                  {!c.internal &&
                    !c.fromClient &&
                    (c.sentAt
                      ? ` · sent ${c.sentAt}`
                      : " · not sent: client email is off")}
                </p>
              </li>
            ),
          )}
          {(thread === "internal" ? internalComments : clientComments)
            .length === 0 && (
            <li className="text-13 text-ink-muted">
              {thread === "internal"
                ? "Nothing said yet."
                : "Nothing has been said to the client here."}
            </li>
          )}
        </ul>
      </section>

      {/* --- how it got here ----------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
        <h2 className="font-display text-15 font-semibold">Pipeline history</h2>
        <ol className="flex flex-col">
          {engagement.statusHistory.map((event, i) => (
            <li
              key={i}
              className="border-rule text-14 flex flex-wrap gap-2 border-b py-2 last:border-0"
            >
              <span className="num text-13 text-ink-muted w-36 shrink-0">
                {event.at}
              </span>
              <span>
                {event.from ? `${event.from} → ${event.to}` : event.to}
                <span className="text-ink-muted"> · {event.byName}</span>
                {event.reason && (
                  <span className="text-ink-muted"> · {event.reason}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function ChecklistGroup({
  title,
  items,
  engagementId,
  disabled,
  run,
  documents,
  mayAttach,
  refresh,
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-12 text-ink-muted font-medium tracking-wide uppercase">
        {title}
      </h3>
      <ul className="flex flex-col">
        {items.map((item) => {
          const attached = documents.filter(
            (d) => d.checklistItemId === item.id,
          );
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

function Picker({ label, value, team, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <select
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
      >
        <option value="">— nobody —</option>
        {team.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
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
   * The Approval section below owns this one, and the same action twice on
   * one screen is what P3-8 set out to stop — it also means two buttons that
   * can disagree about whether they are disabled. The band points at it.
   */
  if (action.act === "approve-work") {
    return (
      <a
        href="#approval"
        className="rounded-control border-carbon text-13 h-8 border px-3 leading-8 font-medium"
      >
        {help ? "Help: approve" : "Approve"}
      </a>
    );
  }

  if (action.href?.startsWith("#")) {
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
