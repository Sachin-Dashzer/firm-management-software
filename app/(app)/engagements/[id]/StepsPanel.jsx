"use client";

import { canExecute } from "@/lib/services/catalog";
import { ROLE_LABELS } from "@/lib/permissions";
import { stepsView } from "@/lib/engagements/steps";
import Notice from "@/components/ui/Notice";
import Action from "@/components/ui/Action";
import { assignTask, setTaskDone } from "../actions";

export default function StepsPanel({
  engagement,
  team,
  actorRole,
  canEditWork,
  mayManage,
  pending,
  run,
  /**
   * The work each step needs, keyed by `workKey`: `documents`, `submit`, plus `udin` for the step the service marks as its UDIN step.
   * Only the open step's is drawn.
   */
  work = {},
  /** The one next sentence (P3-6), and its control, under the heading. */
  next = null,
  nextAction = null,
}) {
  const view = stepsView(engagement);
  const mayJump = actorRole === "ca" || actorRole === "partner";

  if (view.total === 0) {
    return (
      <Card>
        <p className="text-13 text-ink-muted">This service has no steps.</p>
      </Card>
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

  /** The quiet line at the foot of the card: whose step this is, and why. */
  const whoLine = [
    open?.kind === "stage"
      ? open.key === "review"
        ? `${engagement.reviewerName || "The reviewer"} signs this off`
        : "A CA or a Partner closes the job"
      : null,
    isTask && open.minRole ? `${ROLE_LABELS[open.minRole]} or above` : null,
    open?.udin ? "carries the UDIN" : null,
  ].filter(Boolean);

  const stepWork = (open?.udin && work.udin) || work[open?.workKey];

  return (
    <div className="flex flex-col gap-3">
      <Card>
        {/* where the job has got to, before anything about this step */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-12 text-ink-muted font-medium">
              {view.allDone ? (
                "Every step done"
              ) : (
                <>
                  Step <span className="num">{view.openAt + 1}</span> of{" "}
                  <span className="num">{view.total}</span>
                </>
              )}
            </h2>
            {view.ahead > 0 && (
              <p className="text-12 text-faint">
                <span className="num">{view.ahead}</span> more after this
              </p>
            )}
          </div>
          <Rail view={view} />
        </div>

        {open && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="font-display text-18 leading-tight font-semibold">
                  {open.name}
                </h3>
                {next && next.stance !== "done" && (
                  <div className="text-14 text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="max-w-[60ch]">{next.text}</span>
                    {next.stance === "nudge" || next.stance === "watch" ? (
                      <span className="text-13 text-faint">
                        {next.stance === "nudge" ? "Nudge" : "With"} {next.who}
                      </span>
                    ) : (
                      nextAction
                    )}
                  </div>
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

            {/*
              The step's work, on the card's own ground.

              It used to sit in a second box, inside the step's box, inside
              the steps panel. Three frames around one checklist is most of
              what made this screen read as complex; a rule and the page's
              own surface separate it just as well.

              The UDIN step gets its question *and* whatever its own list
              asks for (owner, 12-11-2026): a step called "Generate UDIN"
              that also wants the signed report uploaded has two things to
              show, and the register link is the first of them.
            */}
            {stepWork && (
              <div className="border-rule flex flex-col gap-4 border-t pt-4">
                {open.udin && work.udin}
                {work[open.workKey]}
              </div>
            )}

            {/*
              The step is ticked here, at the foot of its own card, and
              only here (owner, 13-11-2026). The heading used to carry the
              same tick beside the next sentence, which put the same act on
              the screen twice; the heading now states what is next and
              this row does it.

              A stage closes itself, so it gets the sentence instead of the
              button — there is nothing honest for a button to do there.
            */}
            <div className="border-rule flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
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
                      Step <span className="num">{open.index + 2}</span> opens
                      as soon as this one is satisfied — there is nothing to
                      tick.
                    </span>
                  )
                )}
              </div>
              {whoLine.length > 0 && (
                <p className="text-12 text-brass-ink max-w-[52ch] sm:text-right">
                  {whoLine.join(" · ")}
                </p>
              )}
            </div>
          </>
        )}

        {view.allDone && (
          <p className="text-13 text-filed">
            Every step is closed, review included. Nothing on this job is
            outstanding.
          </p>
        )}
      </Card>

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
    </div>
  );
}

function Card({ children }) {
  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-4 border p-4 md:p-5">
      {children}
    </section>
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
 * What is already signed off, folded away, under the card rather than in it.
 *
 * `<details>` rather than a state hook: a disclosure is a browser feature,
 * keyboard-operable and findable by in-page search without help from us,
 * and it survives the panel re-rendering after every tick.
 *
 * Every done step carries its own **Undo**, so a step ticked by mistake
 * is walked back where it is read (owner, 12-11-2026) — it used to be one
 * button under the list, and only ever for the last step.
 *
 * The rules are the server's, said as the absence of a button rather than a
 * refusal afterwards: a stage closes itself and has nothing to undo, a step
 * can only be undone by somebody who could have ticked it, and the order
 * still holds — the last step first — except for a CA or a Partner, who may
 * go straight at any of them, as `outOfOrder` has always allowed.
 */
function Trail({ view, engagement, actorRole, canEditWork, pending, run }) {
  const last = view.done[view.done.length - 1];
  const mayJump = actorRole === "ca" || actorRole === "partner";

  /**
   * Why this step cannot be walked back, or null. A stage has nothing to
   * reopen — untick a review point, or clear the UDIN answer, and it opens
   * again on its own.
   */
  const whyNot = (step) =>
    step.kind !== "task"
      ? "This one closes itself"
      : !canEditWork
        ? `Nothing can be edited while this job is ${engagement.status}`
        : !canExecute(actorRole, step.minRole || engagement.minExecRole)
          ? `${ROLE_LABELS[step.minRole || engagement.minExecRole]} or above`
          : step.id !== last.id && !mayJump
            ? `Reopen "${last.name}" first`
            : null;

  return (
    <details className="group px-1">
      <summary className="text-13 text-ink-muted hover:text-ink cursor-pointer list-none">
        <span
          aria-hidden="true"
          className="text-11 mr-1.5 inline-block transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        <span className="num">{view.done.length}</span>{" "}
        {view.done.length === 1 ? "step" : "steps"} done
        <span className="text-faint"> — {last.name} was the last</span>
      </summary>

      <ol className="mt-2 flex flex-col">
        {view.done.map((step) => {
          const why = whyNot(step);
          return (
            <li
              key={step.id}
              className="border-rule-soft flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b py-1.5 last:border-0"
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
              {step.kind === "task" && !why && (
                <Action
                  id={`reopen-${step.id}`}
                  tone="quiet"
                  pending={pending}
                  onClick={() =>
                    run(() => setTaskDone(engagement.id, step.id, false))
                  }
                >
                  Undo
                </Action>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
