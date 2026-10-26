"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRIORITIES, NEEDS_REASON } from "@/lib/engagements/status";
import { canExecute } from "@/lib/services/catalog";
import { AUDIT_TYPES, OPINIONS, MODIFIED_OPINIONS } from "@/lib/practice/books";
import { ROLE_LABELS } from "@/lib/permissions";
import Uploader from "@/components/documents/Uploader";
import DocumentList from "@/components/documents/DocumentList";
import AuditTick from "@/components/ledger/AuditTick";
import CompletionStamp from "@/components/ledger/CompletionStamp";
import FilingMilestones from "./FilingMilestones";
import ChecklistRow from "./ChecklistRow";
import {
  addEngagementComment,
  changeStatus,
  reassign,
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
  nextStatuses,
  canEditWork,
  mayManage,
  isReviewer,
  actorRole,
  team,
  comments,
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
          <h2 className="font-display text-20 mr-2">Move this on</h2>
          {nextStatuses.length === 0 && (
            <p className="text-13 text-ink-muted">
              {engagement.status === "Completed"
                ? "Completed and locked. Comments are still open."
                : engagement.status === "Cancelled"
                  ? "Cancelled."
                  : "Nothing you can move from here."}
            </p>
          )}
          {nextStatuses.map((to) => (
            <button
              key={to}
              type="button"
              disabled={pending}
              onClick={() => move(to)}
              className="rounded-ledger border-rule text-14 h-9 border px-3 disabled:opacity-60"
            >
              {to === "In progress" &&
              ["Under review", "Filed / delivered"].includes(engagement.status)
                ? "Send back for rework"
                : to}
            </button>
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
                className="rounded-ledger border-rule bg-paper text-14 border px-2 py-1"
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
                className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
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
            value={`${engagement.fee} · ${engagement.billingStatus}`}
          />
          {engagement.reworkCount > 0 && (
            <Pair
              label="Sent back"
              value={`${engagement.reworkCount} ${engagement.reworkCount === 1 ? "time" : "times"}`}
            />
          )}
        </dl>
      </section>

      {/* --- who and when ------------------------------------------------ */}
      {mayManage && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <h2 className="font-display text-20">Assignment and dates</h2>
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
                className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
                className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
          <h2 className="font-display text-20">Steps</h2>
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
                      className="rounded-ledger border-rule bg-paper text-13 h-8 border px-1"
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

        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-4 border p-4">
          <h2 className="font-display text-20">Checklist</h2>
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
        <FilingMilestones
          engagement={engagement}
          locked={["Completed", "Cancelled"].includes(engagement.status)}
          setMessage={setMessage}
        />

        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <h2 className="font-display text-20">
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
                  className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2 font-mono"
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
                className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2 font-mono uppercase"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">
                Signed by
              </span>
              <select
                name="udinMemberId"
                defaultValue=""
                className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
                  className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
                      className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
                      className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
                      className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
                      className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
                className="rounded-ledger border-rule text-14 h-9 border px-3 disabled:opacity-60"
              >
                Save filing details
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <h2 className="font-display text-20">Review</h2>
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

      {/* --- comments ------------------------------------------------------ */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <h2 className="font-display text-20">Comments</h2>
        <form
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
          <label className="flex flex-col gap-1">
            <span className="sr-only">Comment</span>
            <textarea
              name="body"
              rows={2}
              placeholder="Type @ and a name to mention someone"
              className="rounded-ledger border-rule bg-paper text-14 border px-2 py-1"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
            >
              Add comment
            </button>
            <label className="text-13 flex items-center gap-2">
              <input type="checkbox" name="internal" defaultChecked />
              Internal only
            </label>
          </div>
        </form>

        <ul className="flex flex-col">
          {comments.map((c) => (
            <li
              key={c.id}
              className="border-rule flex flex-col gap-0.5 border-b py-2 last:border-0"
            >
              <p className="text-14 whitespace-pre-wrap">{c.body}</p>
              <p className="text-12 text-ink-muted">
                {c.by} · {c.at}
                {c.internal && " · internal"}
              </p>
            </li>
          ))}
          {comments.length === 0 && (
            <li className="text-13 text-ink-muted">Nothing said yet.</li>
          )}
        </ul>
      </section>

      {/* --- how it got here ----------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
        <h2 className="font-display text-20">Pipeline history</h2>
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
        className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
