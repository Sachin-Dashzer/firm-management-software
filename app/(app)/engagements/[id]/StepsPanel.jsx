"use client";

import { canExecute } from "@/lib/services/catalog";
import { ROLE_LABELS } from "@/lib/permissions";
import { stepsView } from "@/lib/engagements/steps";
import Notice from "@/components/ui/Notice";
import Action from "@/components/ui/Action";
import { assignTask, setTaskDone } from "../actions";

/**
 * One step at a time, and only one (owner request, 03-11-2026).
 *
 * The panel used to list the whole template at once. Seven lines, six of
 * them things nobody could do yet, and the only one that mattered lost in
 * the middle of them — a sequence presented as a menu. The owner asked for
 * the opposite: the step you are on, the trail of what is already signed
 * off, and no sight of what comes next until this one closes.
 *
 * So there are exactly three things on this panel:
 *
 *   - **the trail**, folded away behind a native disclosure. It is the
 *     record of who finished what and when, which matters when a file is
 *     questioned months later and never while the work is being done.
 *   - **the open step**, the only card with controls on it. The work that
 *     step needs is rendered *inside* it (`work`) rather than somewhere
 *     else on the page, so "I am on step one" and "upload the documents"
 *     are one thing on screen instead of two.
 *   - **a count** of what is left. Not names: the next step appears when
 *     the one before it is finished, which is the whole request.
 *
 * The step also has to be *finishable*, not merely tickable. "Collect
 * documents" closes when the documents are in, so `stepBlock` refuses the
 * tick until they are, and `setTaskDone` enforces the same refusal on the
 * server (CLAUDE.md rule 1). The CA and the Partner keep the override they
 * already had on the order rule — the person signing the file is the one
 * who has to unpick a mistake at nine in the evening.
 *
 * ## Two kinds of step
 *
 * A **task** comes from the template and is ticked by a person: it is a
 * to-do, and somebody says when it is done.
 *
 * A **stage** — Filing, Review, Complete, the firm's own three at the end
 * of every job — is not ticked at all. It closes when its condition is
 * actually met: the UDIN question answered, every review point ticked, the
 * engagement marked Completed. There is deliberately no checkbox, because
 * a checkbox on a stage would let somebody claim a gate was cleared
 * without clearing it, which is the one thing these three exist to stop.
 */
export default function StepsPanel({
  engagement,
  team,
  actorRole,
  canEditWork,
  mayManage,
  isReviewer = false,
  pending,
  run,
  /**
   * The work each step needs, keyed by `workKey`: `documents`, `filing`,
   * `review`, `submit`. Only the open step's is drawn.
   */
  work = {},
}) {
  const view = stepsView(engagement, {
    isReviewer,
    reviewerName: engagement.reviewerName,
  });
  const mayJump = actorRole === "ca" || actorRole === "partner";

  if (view.total === 0) {
    return (
      <Panel>
        <Head view={view} />
        <p className="text-13 text-ink-muted">This service has no steps.</p>
      </Panel>
    );
  }

  const open = view.open;
  const isTask = open?.kind === "task";
  const floor = isTask ? open.minRole || engagement.minExecRole : "";
  const mine = isTask ? canExecute(actorRole, floor) : false;

  /**
   * Why the tick is refused, as a sentence rather than a dead control
   * (P3-8). Order matters: the thing the reader cannot change is said
   * before the thing they can. Stages have no tick, so no refusal either —
   * their own work slot is the only way they close.
   */
  const why = !isTask
    ? null
    : !canEditWork
      ? `Nothing can be edited while this job is ${engagement.status}.`
      : !mine
        ? `This step is for ${ROLE_LABELS[floor]} or above — you will be told when it comes back.`
        : view.block && !mayJump
          ? view.block.say
          : null;

  return (
    <Panel>
      <Head view={view} />
      <Rail view={view} />

      {view.done.length > 0 && (
        <Trail
          view={view}
          engagement={engagement}
          actorRole={actorRole}
          canEditWork={canEditWork}
          pending={pending}
          run={run}
        />
      )}

      {open && (
        <div className="rounded-ledger border-carbon bg-carbon-wash flex flex-col gap-3 border p-3">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <p className="text-12 text-ink-muted font-medium tracking-wide uppercase">
                Now · step <span className="num">{open.index + 1}</span>
              </p>
              <h3 className="font-display text-16 leading-tight font-semibold">
                {open.name}
              </h3>
              {isTask && open.minRole && (
                <p className="text-12 text-brass-ink">
                  {ROLE_LABELS[open.minRole]} or above
                </p>
              )}
              {open.kind === "stage" && (
                <p className="text-12 text-brass-ink">
                  {open.key === "review"
                    ? `${engagement.reviewerName || "The reviewer"} only — the preparer cannot sign off their own work`
                    : open.key === "submit"
                      ? "A CA or a Partner closes the job"
                      : "The firm's own record of the filing"}
                </p>
              )}
            </div>

            {isTask && mayManage && (
              <label className="text-12 text-ink-muted flex shrink-0 flex-col gap-1">
                Who does this
                <select
                  aria-label={`Who does “${open.name}”`}
                  value={open.assigneeId}
                  disabled={!canEditWork || pending}
                  onChange={(event) =>
                    run(() =>
                      assignTask(engagement.id, open.id, event.target.value),
                    )
                  }
                  className="rounded-control border-rule bg-paper text-13 h-8 border px-1"
                >
                  <option value="">— anyone —</option>
                  {team
                    .filter((person) => canExecute(person.role, floor))
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>

          {view.block && (
            <Notice tone="warn" title="This step is not finished yet">
              <p>{view.block.say}</p>
              {view.block.missing.length > 1 && (
                <ul className="mt-1 list-disc pl-5">
                  {view.block.missing.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}
            </Notice>
          )}

          {work[open.workKey] && (
            <div className="rounded-ledger bg-paper p-3">
              {work[open.workKey]}
            </div>
          )}

          {/*
            A task is ticked by a person. A stage closes itself, so it gets
            the sentence instead of the button — there is nothing honest for
            a button to do there.
          */}
          <div className="flex flex-wrap items-center gap-3">
            {isTask ? (
              <>
                <Action
                  id={`step-${open.id}`}
                  why={why}
                  pending={pending}
                  onClick={() =>
                    run(() => setTaskDone(engagement.id, open.id, true))
                  }
                >
                  {view.block && mayJump && mine && canEditWork
                    ? "Finish it anyway"
                    : "Mark this step done"}
                </Action>
                {view.ahead > 0 && !why && (
                  <span className="text-12 text-ink-muted">
                    Step <span className="num">{open.index + 2}</span> opens
                    when this one closes.
                  </span>
                )}
              </>
            ) : (
              view.ahead > 0 && (
                <span className="text-12 text-ink-muted">
                  Step <span className="num">{open.index + 2}</span> opens as
                  soon as this one is satisfied — there is nothing to tick.
                </span>
              )
            )}
          </div>
        </div>
      )}

      {view.ahead > 0 && (
        <p className="text-12 text-faint">
          <span className="num">{view.ahead}</span>{" "}
          {view.ahead === 1 ? "step" : "steps"} after this one, shown as each is
          reached.
        </p>
      )}

      {view.allDone && (
        <p className="text-13 text-filed">
          Every step is closed, review included. Nothing on this job is
          outstanding.
        </p>
      )}
    </Panel>
  );
}

function Panel({ children }) {
  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      {children}
    </section>
  );
}

function Head({ view }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 className="font-display text-15 font-semibold">Steps</h2>
      {view.total > 0 && (
        <span className="text-12 text-ink-muted">
          {view.allDone ? (
            "Every step is done"
          ) : (
            <>
              Step <span className="num">{view.openAt + 1}</span> of{" "}
              <span className="num">{view.total}</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * The rail: one segment a step, filled to where the work has got to.
 *
 * It states the proportion and nothing else — no names on the segments, no
 * tooltips — which keeps it on the right side of the request while still
 * answering "how much of this is left".
 */
function Rail({ view }) {
  return (
    <div
      className="flex gap-0.5"
      role="img"
      aria-label={
        view.allDone
          ? `All ${view.total} steps done`
          : `Step ${view.openAt + 1} of ${view.total}`
      }
    >
      {Array.from({ length: view.total }, (_, i) => (
        <span
          key={i}
          className={`h-1 flex-1 rounded-full ${
            i < view.openAt
              ? "bg-filed"
              : i === view.openAt
                ? "bg-carbon"
                : "bg-sunk"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * What is already signed off, folded away.
 *
 * `<details>` rather than a state hook: a disclosure is a browser feature,
 * keyboard-operable and findable by in-page search without help from us,
 * and it survives the panel re-rendering after every tick.
 *
 * Only the **last** done step can be walked back, and only when it is a
 * template task and only by somebody who could have ticked it — the same
 * rule `outOfOrder` enforces on the server, said here as one button rather
 * than five disabled ones. A stage has nothing to reopen: untick a review
 * point, or clear the UDIN answer, and it opens again on its own.
 */
function Trail({ view, engagement, actorRole, canEditWork, pending, run }) {
  const last = view.done[view.done.length - 1];
  const mayReopen =
    last.kind === "task" &&
    canEditWork &&
    canExecute(actorRole, last.minRole || engagement.minExecRole);

  return (
    <details className="group">
      <summary className="text-13 text-ink-muted hover:text-ink cursor-pointer list-none">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="text-11 transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          <span className="num">{view.done.length}</span>{" "}
          {view.done.length === 1 ? "step" : "steps"} done
          <span className="text-faint">— {last.name} was the last</span>
        </span>
      </summary>

      <ol className="mt-2 flex flex-col">
        {view.done.map((step) => (
          <li
            key={step.id}
            className="border-rule flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b py-1.5 last:border-0"
          >
            <span
              aria-hidden="true"
              className="num text-11 bg-filed text-on-carbon grid size-4 shrink-0 translate-y-0.5 place-items-center rounded-full"
            >
              ✓
            </span>
            <span className="text-13 text-ink-muted min-w-0 flex-1">
              {step.name}
            </span>
            {(step.by || step.on) && (
              <span className="text-12 text-faint">
                {step.by || (step.kind === "task" ? "Somebody" : "")}
                {step.on && (
                  <>
                    {step.by ? " · " : ""}
                    <span className="num">{step.on}</span>
                  </>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>

      {mayReopen && (
        <Action
          id={`reopen-${last.id}`}
          tone="quiet"
          pending={pending}
          onClick={() => run(() => setTaskDone(engagement.id, last.id, false))}
          className="mt-2"
        >
          Reopen “{last.name}”
        </Action>
      )}
    </details>
  );
}
