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
 * ## The template's steps, and the firm's three
 *
 * A template's steps are the *preparer's* to-do list, written per service
 * and editable in the catalog. Three things at the end of every job are
 * not: the filing details, the reviewer's sign-off, and the completion
 * itself. Those are the firm's own gates, the same on an ITR and on a
 * statutory audit, and `changeStatus` already refuses a completion that
 * skips any of them.
 *
 * Before this they were three panels further down the page, which meant
 * the step list claimed to be the job's spine while ending three gates
 * short of the end of the job. Now they are the last three steps —
 * **Filing**, **Review**, **Complete** — so "where is this job?" has one
 * answer, and the page cannot say the work is finished while a gate is
 * still shut.
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
 * Why the step at `index` cannot be ticked yet, or null.
 *
 * Only the **mandatory** items the **client** owes, and only this step's
 * own. An optional extra, a paper the firm produces itself, or a document
 * a later step will ask for must never hold this step shut — that was the
 * whole complaint about one list for the whole job.
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
  const missing = itemsForStep(engagement, index)
    .filter((item) => item.side === "client" && item.mandatory)
    .filter(outstanding)
    .map((item) => item.name);

  if (missing.length === 0) return null;
  const reason =
    missing.length === 1
      ? `${missing[0]} has not come in yet.`
      : `${missing.length} documents have not come in yet.`;

  return {
    reason,
    missing,
    /** Said to the person, not to the log. */
    say: `${reason} Upload it against this step's checklist and the step closes itself.`,
  };
}

// --- the firm's three closing stages ---------------------------------------

export const FILING = "filing";
export const REVIEW = "review";
export const SUBMIT = "submit";

/** The UDIN question has an answer on the record, either way. */
export const udinAnswered = (engagement) =>
  Boolean((engagement.udin ?? "").trim()) ||
  Boolean(engagement.udinNotRequired);

/**
 * Every review point is ticked.
 *
 * An empty checklist counts as done. Work created before the review list
 * existed has none, and a stage that can never close would strand it one
 * step short of the end for ever.
 */
export const reviewComplete = (engagement) => {
  const items = engagement.reviewChecklist ?? [];
  return items.length === 0 || items.every((item) => item.checked);
};

const CLOSED = ["Completed", "Cancelled"];

/**
 * The three stages, in order, for this engagement and this reader.
 *
 * @param {any} engagement
 * @param {{ isReviewer?: boolean, reviewerName?: string }} ctx
 */
function closingStages(engagement, ctx) {
  const unticked = (engagement.reviewChecklist ?? []).filter(
    (item) => !item.checked,
  );

  return [
    {
      kind: "stage",
      key: FILING,
      id: FILING,
      name: "Filing",
      /**
       * Closes on the UDIN answer, which is the question the owner asked
       * this step to put. The acknowledgement number and the filed-on date
       * are recorded here too, but a job can legitimately reach completion
       * with neither — a certificate is signed, not filed — so neither can
       * be the thing that holds the step shut.
       */
      done: udinAnswered(engagement),
      block: udinAnswered(engagement)
        ? null
        : {
            reason: "The UDIN question has not been answered.",
            missing: [],
            say: engagement.udinRequired
              ? "This service needs a UDIN. Record the number below and this step closes itself."
              : "Say whether this work needs a UDIN. The step closes on your answer, either way.",
          },
      on: engagement.filedOn ?? "",
      by: "",
    },
    {
      kind: "stage",
      key: REVIEW,
      id: REVIEW,
      name: "Review",
      done: reviewComplete(engagement),
      /**
       * Maker and checker are different people (CLAUDE.md rule 4), so this
       * is the one step whose gate is about *who is reading it* rather than
       * about the job. The preparer is told it is with the reviewer instead
       * of being shown four checkboxes they cannot tick.
       */
      block: reviewComplete(engagement)
        ? null
        : ctx.isReviewer
          ? {
              reason: `${unticked.length} review ${
                unticked.length === 1 ? "point" : "points"
              } still to tick.`,
              missing: unticked.map((item) => item.name),
              say: "Tick each point below. The step closes on the last one.",
            }
          : {
              reason: "This step is the reviewer's.",
              missing: [],
              say: `${
                ctx.reviewerName || "The reviewer"
              } signs this off — the person who did the work cannot. You will be told when it comes back.`,
            },
      on: "",
      by: ctx.reviewerName || "",
    },
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
 * @param {{ isReviewer?: boolean, reviewerName?: string }} [ctx]
 */
export function stepsView(engagement, ctx = {}) {
  const tasks = engagement.tasks ?? [];

  const entries = [
    ...tasks.map((task, i) => {
      const items = itemsForStep(engagement, i);
      return {
        kind: "task",
        ...task,
        done: Boolean(task.done),
        block: stepBlock(engagement, i),
        /**
         * Every step that asks for something gets the checklist in its own
         * card — its own rows, not the job's. A step that asks for nothing
         * gets no panel, because an empty checklist under a step is just a
         * heading.
         */
        workKey: items.length > 0 ? "documents" : null,
        /** How many rows, so the screen can size itself before rendering. */
        itemCount: items.length,
        on: task.doneOn ?? "",
        by: task.doneByName ?? "",
      };
    }),
    ...closingStages(engagement, ctx).map((stage) => ({
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
    /** The last template step, after which the firm's three begin. */
    taskCount: tasks.length,
  };
}
