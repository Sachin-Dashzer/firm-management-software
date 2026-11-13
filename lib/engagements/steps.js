// @ts-check

import {
  PENDING,
  REQUESTED,
  REPLACEMENT,
  isWaitingOnClient,
} from "./checklist.js";

/**
 * The steps of a job, read one at a time (owner request, 03-11-2026).
 *
 * The panel used to list every step of the template at once, which turned
 * the sequence into a menu: seven lines, six of them things nobody can do
 * yet, and the one that matters lost among them. A person opening a job
 * should see the thing in front of them, the trail of what is already
 * signed off, and nothing else.
 *
 * So this computes three groups and a gate:
 *
 *   - **done** — stamped with who and when, kept as a trail
 *   - **open** — exactly one, the only step with controls on it
 *   - **ahead** — a count, never names. The next step is not a promise to
 *     be read ahead of time; it appears when the one before it is finished.
 *
 * ## The template's steps, and the firm's one
 *
 * A template's steps are the *preparer's* to-do list, written per service
 * and editable in the catalog. One thing at the end of every job is not:
 * the completion itself. That is the firm's own gate, the same on an ITR
 * and on a statutory audit, and `changeStatus` already refuses a
 * completion that skips anything.
 *
 * Before this it was a panel further down the page, which meant the step
 * list claimed to be the job's spine while ending a gate short of the end
 * of the job. Now it is the last step — **Complete** — so "where is this
 * job?" has one answer, and the page cannot say the work is finished while
 * a gate is still shut.
 *
 * ## Review was the second-last step, and is not a step any more (owner, 13-11-2026)
 *
 * It was the one step whose gate was about *who was reading the screen*
 * rather than about the job, so for the person who did the work it was a
 * step they could only watch: a card saying the reviewer has it, sitting
 * where the next thing to do should be. And it stood between the last real
 * step and the end of the job on every service, whether that service had
 * anything for a reviewer to tick or not.
 *
 * The gate itself has not moved an inch. `changeStatus` still refuses a
 * completion by the person who did the work (CLAUDE.md rule 4),
 * `blocksFiling` still reads `gates.approved`, and the reviewer's points
 * and the approval are still the only way to set it — they are now a
 * **record** on the Work tab, open at any point in the job, the way the
 * filing details became one on 12-11-2026.
 *
 * ## Filing was a third, and is not a step any more (owner, 12-11-2026)
 *
 * It closed on one question — *does this work need a UDIN?* — asked of
 * every job whether the service had planned for one or not. The owner
 * asked for that question to move to a step the firm chooses, and it has:
 * a service names its UDIN step and `stepBlock` holds that step shut until
 * the number is on the register.
 *
 * Which left Filing with nothing to close on. The acknowledgement number
 * and the filed-on date cannot be it — a certificate is signed, never
 * filed, and that job must still reach the end — and the returns being
 * filed cannot be it either, because the approval that *permits* filing is
 * ticked on the Review step after it: the job would have been waiting on
 * its own permission.
 *
 * So the filing details are a **record** rather than a gate. They sit on
 * the Work tab, folded, readable and editable at any point in the job,
 * and the pipeline's own "Filed / delivered" status is what says the
 * return went in.
 *
 * They are computed, not stored. No migration, no backfill, nothing for a
 * template to leave out by accident, and each one closes when its own
 * condition is actually met rather than when somebody ticks a box claiming
 * it is — a stage has no checkbox for that reason.
 *
 * Everything here is pure and shared: `StepsPanel` draws it, `setTaskDone`
 * enforces the documents gate (CLAUDE.md rule 1), and the two cannot drift
 * apart.
 */

/** Nothing has arrived for this item and nobody has waived it. */
const outstanding = (item) =>
  [PENDING, REQUESTED, REPLACEMENT].includes(item?.status) ||
  isWaitingOnClient(item);

/**
 * The checklist items belonging to the step at `index`.
 *
 * Since 03-11-2026 an item names its own step. Items that name none —
 * everything written before the catalog could divide a checklist, and
 * anything a partner deliberately leaves attached to the whole job — are
 * gathered on **step one**, which is where the single undivided checklist
 * effectively sat.
 *
 * @param {any} engagement
 * @param {number} index
 */
export function itemsForStep(engagement, index) {
  return (engagement.checklist ?? []).filter((item) => {
    const at = Number.isInteger(item.stepIndex) ? item.stepIndex : null;
    return at === null ? index === 0 : at === index;
  });
}

/**
 * Which of a step's rows can hold it shut.
 *
 * **A mandatory document the client owes**, as it always was: an optional
 * extra, or a document a later step will ask for, must never hold this step
 * shut — that was the whole complaint about one list for the whole job.
 *
 * **And since 12-11-2026, any mandatory row that is not a document.** A
 * tick, a link to the screen where the work happens, a letter drafted from
 * a template: those are the step's own work rather than something we are
 * waiting on, so "we produce it" is no longer a reason to let the step
 * close without them. A mandatory *document* the firm produces still does
 * not block — producing it is what doing the step means.
 */
const holdsStepShut = (item) =>
  item?.mandatory &&
  (item.side === "client" || (item.kind ?? "upload") !== "upload");

/** Is the step at `index` the one that carries the UDIN? */
export const isUdinStep = (engagement, index) =>
  (engagement?.tasks ?? [])[index]?.kind === "udin";

/**
 * Why the step at `index` cannot be ticked yet, or null.
 *
 * Two preconditions, in the order somebody meets them: this step's own
 * outstanding rows, and — on the step the firm marked as the UDIN step —
 * the number itself.
 *
 * The order rule is somebody else's: `outOfOrder` in the engagement
 * actions owns it, so this stays the one place a *precondition* lives
 * rather than a second copy of the sequence.
 *
 * @param {any} engagement
 * @param {number} index
 * @returns {{ reason: string, missing: string[], say: string } | null}
 */
export function stepBlock(engagement, index) {
  const held = itemsForStep(engagement, index)
    .filter(holdsStepShut)
    .filter(outstanding);
  const missing = held.map((item) => item.name);

  if (missing.length > 0) {
    /** All documents reads differently from a tick nobody has made. */
    const docs = held.every((item) => (item.kind ?? "upload") === "upload");
    const reason =
      missing.length === 1
        ? `${missing[0]} ${docs ? "has not come in yet" : "is not done yet"}.`
        : docs
          ? `${missing.length} documents have not come in yet.`
          : `${missing.length} things on this step are not done yet.`;

    return {
      reason,
      missing,
      /** Said to the person, not to the log. */
      say: `${reason} ${
        docs
          ? "Upload it against this step's checklist and the step closes itself."
          : "Settle this step's list and the step closes itself."
      }`,
    };
  }

  /**
   * The UDIN step (owner request, 12-11-2026).
   *
   * It used to be a gate at the end of every job whether the firm had
   * planned for one or not. Now the service says which step generates the
   * number, and that step is the one that will not close without it —
   * which is also how `udinRequired` is decided in the first place, so the
   * two can never disagree.
   */
  if (isUdinStep(engagement, index) && !udinAnswered(engagement)) {
    return {
      reason: "No UDIN has been recorded against this work.",
      missing: [],
      say: "This is the UDIN step. Apply for the number on the register — it is generated against a member's own ICAI membership — and the step closes itself.",
    };
  }

  return null;
}

// --- the firm's closing stage ----------------------------------------------

export const SUBMIT = "submit";

/** The UDIN question has an answer on the record, either way. */
export const udinAnswered = (engagement) =>
  Boolean((engagement.udin ?? "").trim()) ||
  Boolean(engagement.udinNotRequired);

/**
 * Every review point is ticked.
 *
 * An empty checklist counts as done. Work created before the review list
 * existed has none, and a review that could never read as finished would
 * leave those jobs looking unreviewed for ever.
 */
export const reviewComplete = (engagement) => {
  const items = engagement.reviewChecklist ?? [];
  return items.length === 0 || items.every((item) => item.checked);
};

const CLOSED = ["Completed", "Cancelled"];

/**
 * The job's one closing stage.
 *
 * Its refusal is deliberately the plain sentence and not the pipeline's
 * reasoning: `moves` is what actually knows whether this job can be
 * completed — the review, the approval, who the reader is — and the panel
 * drawn inside this step reads it. Two places computing the same refusal
 * is two places that can disagree.
 *
 * @param {any} engagement
 */
function closingStages(engagement) {
  return [
    {
      kind: "stage",
      key: SUBMIT,
      id: SUBMIT,
      name: "Complete",
      done: CLOSED.includes(engagement.status),
      block: CLOSED.includes(engagement.status)
        ? null
        : {
            reason: "The job is not closed yet.",
            missing: [],
            say: "Mark the engagement Completed to close it. Only a CA or a Partner can.",
          },
      on: engagement.completedOn ?? "",
      by: engagement.completedBy ?? "",
    },
  ];
}

/**
 * The job's steps, grouped for a reader.
 *
 * `workKey` names the panel that belongs inside the step's card, so the
 * screen renders the work of the step the reader is on and nothing else.
 *
 * @param {any} engagement
 */
export function stepsView(engagement) {
  const tasks = engagement.tasks ?? [];

  const entries = [
    ...tasks.map((task, i) => {
      const items = itemsForStep(engagement, i);
      return {
        ...task,
        /**
         * **After the spread, not before.**
         *
         * `kind` here is the entry's discriminator — task or stage — and
         * it is what `StepsPanel` reads to decide whether the step has a
         * tick, an assignee and its checklist drawn inside it. Since
         * 12-11-2026 a *task* carries a `kind` of its own too, snapshotted
         * from the template's step (`""` or `"udin"`), and with the spread
         * second that field overwrote the discriminator: every step became
         * neither a task nor a stage, so the open step rendered as a card
         * with a name and nothing in it. The step's own kind is `udin`
         * below, which is the only thing anything asks of it.
         */
        kind: "task",
        done: Boolean(task.done),
        block: stepBlock(engagement, i),
        /**
         * Every step that asks for something gets the checklist in its own
         * card — its own rows, not the job's. A step that asks for nothing
         * gets no panel, because an empty checklist under a step is just a
         * heading.
         */
        workKey: items.length > 0 ? "documents" : null,
        /**
         * The UDIN step shows the question and the way into the register,
         * *as well as* whatever its own checklist asks for — a step called
         * "Generate UDIN" that also wants the signed report uploaded gets
         * both, which is why this is a flag beside `workKey` rather than
         * another value for it.
         */
        udin: task.kind === "udin",
        /** How many rows, so the screen can size itself before rendering. */
        itemCount: items.length,
        on: task.doneOn ?? "",
        by: task.doneByName ?? "",
      };
    }),
    ...closingStages(engagement).map((stage) => ({
      ...stage,
      workKey: stage.key,
    })),
  ].map((entry, index) => ({ ...entry, index }));

  const openAt = entries.findIndex((entry) => !entry.done);
  const allDone = openAt === -1;
  const at = allDone ? entries.length : openAt;
  const open = allDone ? null : entries[openAt];

  return {
    total: entries.length,
    openAt: at,
    done: entries.slice(0, at),
    open,
    ahead: allDone ? 0 : entries.length - at - 1,
    allDone,
    block: open ? open.block : null,
    /** The last template step, after which the firm's own one begins. */
    taskCount: tasks.length,
  };
}
