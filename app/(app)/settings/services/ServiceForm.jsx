"use client";

import { saving } from "@/lib/forms/saving";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, X } from "@phosphor-icons/react";
import {
  EXEC_ROLES,
  LEVEL_DEFAULTS,
  LEVEL_OF,
  RECURRENCES,
  RECURRENCE_LABELS,
  REVIEW_ROLES,
  SERVICE_CATEGORIES,
  TIERS,
  TIER_LABELS,
  TIER_RULES,
  tierOf,
  ITEM_KINDS,
  ITEM_KIND_LABELS,
  ITEM_KIND_HINTS,
  ITEM_LINKS,
  STEP_KINDS,
  STEP_KIND_LABELS,
  needsUdin,
} from "@/lib/services/catalog";
import { ROLE_LABELS } from "@/lib/permissions";
import Notice from "@/components/ui/Notice";
import { saveService } from "./actions";

/**
 * One form for adding a service and for editing one.
 *
 * The checklist and the steps are held in state and posted as JSON, so their
 * order survives and an unticked "required" box cannot knock the rows out of
 * alignment.
 *
 * ## The shape of the screen (owner, 12-11-2026: "fix the ui/ux completely")
 *
 * It was five bordered cards stacked down an 820px column, with the step
 * editor — the thing people actually come here to change — fourth, and its
 * rows inside cards inside a card. At the width the screen really runs at,
 * a checklist row carried six controls and the **name was crushed to about
 * twenty pixels**: the rendered screen showed rows reading "Sig", "F", "M".
 * Every row also repeated a 14rem "which step" selector naming the step it
 * was already sitting inside.
 *
 * Three changes, in the order they matter:
 *
 *  1. **The screen is `wide`.** `SettingsScreen` has had two widths since
 *     D106 — 820 for prose and forms, 1120 for the boards — and a step
 *     editor is a board. That is where the row's missing 300px was.
 *  2. **Sections are rules, not cards.** A settings screen is a label
 *     column and its fields, divided by hairlines; five cards in a column
 *     is the shape a page takes when every question got a box. The work
 *     takes the full width instead, because it is the one block the screen
 *     exists for, and it comes **second** — before who does it and what it
 *     costs, which are read once a year.
 *  3. **The rows are a grid, not a flex-wrap.** Every row's name, kind,
 *     detail, side, step and required box sit in the same six columns, so
 *     the eye runs down a column instead of hunting along each line, and
 *     the name keeps the space it needs. Below `lg` the columns stack and
 *     the name takes a line of its own.
 */
export default function ServiceForm({ service, docTemplates = [] }) {
  const router = useRouter();
  const editing = Boolean(service?.id);

  const [level, setLevel] = useState(service?.level ?? "L2");
  const [minExecRole, setMinExecRole] = useState(
    service?.minExecRole ?? LEVEL_DEFAULTS.L2.minExecRole,
  );
  const [minReviewRole, setMinReviewRole] = useState(
    service?.minReviewRole ?? LEVEL_DEFAULTS.L2.minReviewRole,
  );
  const [checklist, setChecklist] = useState(service?.checklist ?? []);
  const [steps, setSteps] = useState(service?.steps ?? []);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  /** Changing the level moves the roles with it; both stay editable after. */
  function chooseLevel(next) {
    setLevel(next);
    setMinExecRole(LEVEL_DEFAULTS[next].minExecRole);
    setMinReviewRole(LEVEL_DEFAULTS[next].minReviewRole);
  }

  return (
    <form
      onSubmit={saving(
        async (formData) => {
          const result = await saveService(null, formData);
          setMessage(result);
          // a warning has to be read, so the form stays where it is
          if (result?.ok && !result.warning) router.push("/settings/services");
          return result;
        },
        null,
        startTransition,
      )}
      className="flex flex-col"
    >
      {service?.id && <input type="hidden" name="id" value={service.id} />}
      <input type="hidden" name="checklist" value={JSON.stringify(checklist)} />
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />

      {/* `Notice` rather than two more hand-drawn tinted boxes: the firm
          has one shape for "this went wrong" and one for "read this", and
          a form is the last place to invent a third. */}
      {(message?.error || message?.warning) && (
        <div className="mb-5 flex flex-col gap-3">
          {message?.error && <Notice tone="bad" title={message.error} />}
          {message?.warning && (
            <Notice tone="warn" title={message.ok}>
              <p>{message.warning}</p>
            </Notice>
          )}
        </div>
      )}

      {/*
        Four questions and one board, divided by rules.

        The questions are the same four they have been since 03-11-2026 —
        **what is this**, **who does it**, **how long does it take**, **what
        does it cost** — and naming them is still most of the work. What
        changed is that each one is now a heading beside its fields rather
        than a card around them, and the board sits second instead of
        fourth.
      */}
      <Section
        title="What this service is"
        hint="The name the team picks from a list, and the code that appears on every job."
        first
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            name="name"
            defaultValue={service?.name}
            required
          />
          <Field
            label="Code"
            name="code"
            defaultValue={service?.code}
            placeholder="GSTR3B"
            inputClassName="font-mono uppercase"
            required
            hint="2–16 letters, digits or hyphens. It goes in the job code"
          />

          <Select
            label="Category"
            name="category"
            defaultValue={service?.category ?? SERVICE_CATEGORIES[0]}
            options={SERVICE_CATEGORIES.map((c) => [c, c])}
          />
        </div>
      </Section>

      <Workflow
        steps={steps}
        checklist={checklist}
        docTemplates={docTemplates}
        onSteps={setSteps}
        onChecklist={setChecklist}
      />

      <Section
        title="Who does it, and who signs it off"
        hint="The tier sets both, and both stay editable after. A job can never be signed off by the person who did it."
      >
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-13 text-ink-muted font-medium">Tier</span>
            <select
              name="level"
              value={level}
              onChange={(e) => chooseLevel(e.target.value)}
              className={CONTROL}
            >
              {/* A first: the firm reads the tiers downward, not L1 upward */}
              {TIERS.map((t) => (
                <option key={t} value={LEVEL_OF[t]}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
            <span className="text-12 text-ink-muted">
              {TIER_RULES[tierOf(level)]}
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-13 text-ink-muted font-medium">
              Minimum role to execute
            </span>
            <select
              name="minExecRole"
              value={minExecRole}
              onChange={(e) => setMinExecRole(e.target.value)}
              className={CONTROL}
            >
              {EXEC_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-13 text-ink-muted font-medium">
              Minimum role to review
            </span>
            <select
              name="minReviewRole"
              value={minReviewRole}
              onChange={(e) => setMinReviewRole(e.target.value)}
              className={CONTROL}
            >
              {REVIEW_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <span className="text-12 text-ink-muted">
              Only a CA or a Partner can sign work off.
            </span>
          </label>
        </div>
      </Section>

      <Section
        title="How often, and how long"
        hint="Recurring work is generated for each period automatically. Leave the day counts blank where a statutory date decides them."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Recurrence"
            name="recurrence"
            defaultValue={service?.recurrence ?? "one-time"}
            options={RECURRENCES.map((r) => [r, RECURRENCE_LABELS[r]])}
          />

          <Field
            label="Turnaround (working days)"
            name="turnaroundDays"
            type="number"
            min={0}
            max={365}
            defaultValue={service?.turnaroundDays ?? ""}
            hint="Leave blank when a statutory date decides it"
          />

          <Field
            label="Effort to prepare (hours)"
            name="effortHours"
            type="number"
            min={0}
            max={200}
            step="0.5"
            defaultValue={service?.effortHours ?? ""}
            hint="Leave blank until the firm has a figure. The weekly plan counts jobs instead"
          />

          <Field
            label="If not a number of days, what decides the date?"
            name="turnaroundNote"
            defaultValue={service?.turnaroundNote}
            placeholder="Before the statutory due date"
          />
        </div>
      </Section>

      <Section
        title="Billing defaults"
        hint="What a job of this kind starts at. Every one can still be priced on its own."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Default fee (rupees)"
            name="defaultFee"
            inputMode="decimal"
            defaultValue={service?.defaultFee ?? "0"}
            hint="Leave at 0 until the firm fixes a price"
          />
          <Field
            label="SAC code"
            name="sac"
            defaultValue={service?.sac}
            placeholder="998221"
            inputClassName="font-mono"
            hint="6 digits; it goes on the GST invoice"
          />
          <Field
            label="GST rate (%)"
            name="gstRate"
            type="number"
            min={0}
            max={28}
            defaultValue={service?.gstRate ?? 18}
          />
        </div>

        {/*
          The UDIN checkbox used to be here (owner, 12-11-2026).

          It was the wrong question in the wrong place. In the *billing*
          defaults, it said a number would be demanded at completion and
          never said at which point in the job anybody was supposed to get
          one. It is a **step** now: mark the step where the UDIN is
          generated, and the service is one that needs a UDIN by saying so.
        */}
      </Section>

      {/*
        The save bar, bled to the edges of the column.

        It was a bordered card floating 8px off the bottom of the window
        with a 60-character paragraph about versioning inside it, which is
        not a control and was already printed under the page title. What a
        bar carries is the action, the way out, and one line of reading.
      */}
      <div className="border-rule bg-surface sticky bottom-0 z-10 -mx-4 mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 md:-mx-6 md:px-6">
        <button
          type="submit"
          disabled={pending || steps.length === 0}
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium transition-opacity disabled:opacity-50"
        >
          {pending
            ? "Saving…"
            : editing
              ? "Save changes"
              : "Create this service"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/settings/services")}
          className="text-14 text-ink-muted hover:text-ink h-9 underline underline-offset-4"
        >
          Cancel
        </button>

        <p className="text-12 text-ink-muted ml-auto text-right">
          {steps.length === 0 ? (
            <span className="text-waiting">
              Add at least one step — a job with no steps has nothing to do.
            </span>
          ) : (
            <>
              {editing && (
                <>
                  Version <span className="num">{service.version}</span>
                  {" · "}
                </>
              )}
              <span className="num">{steps.length}</span>{" "}
              {steps.length === 1 ? "step" : "steps"}
              {", "}
              <span className="num">{checklist.length}</span>{" "}
              {checklist.length === 1 ? "thing" : "things"} between them
              {needsUdin(steps) && (
                <>
                  {" · "}
                  <span className="text-brass-ink">needs a UDIN</span>
                </>
              )}
            </>
          )}
        </p>
      </div>
    </form>
  );
}

/**
 * The spine the firm's own catalog already uses, offered as a prefill on a
 * new service.
 *
 * Read off the starter catalog in `lib/services/starter.js`, not invented:
 * GSTR-3B, GSTR-9, the TDS return and both ITRs all begin "collect,
 * reconcile, prepare" and end by sending the acknowledgement on.
 *
 * **The completion is deliberately not here.** Every job ends with it
 * whether a service lists it or not (see `lib/engagements/steps.js`), so
 * putting it in a template's own steps would show it twice. The review is
 * not here either, and since 13-11-2026 is not a step at all: it is a
 * record on the job's Work tab, because it was never the preparer's next
 * move. A service that wants its *own* review point mid-way through — read
 * the working before the return goes in — writes that step itself, and
 * several in the starter catalog do.
 */
const USUAL_SHAPE = [
  "Collect data",
  "Reconcile",
  "Prepare",
  "Share acknowledgement",
];

/**
 * The work, as one thing: the steps in order, each with its own checklist
 * (owner request, 03-11-2026).
 *
 * ## Why they are one section
 *
 * They were two: a flat **Checklist** of everything the job would ever
 * need, and below it a flat list of **Steps**. Nothing connected them. A
 * GST return's checklist was fourteen rows, and somebody on "Reconcile
 * with GSTR-2B" had to read all fourteen to find the two that were
 * theirs — while the eleven belonging to steps they had not reached yet
 * sat there looking like work they had forgotten.
 *
 * So a step owns its list, and the engagement screen shows the open step's
 * list and no other.
 *
 * ## The two things worth knowing about the editing
 *
 * **Whole-job items.** A row can belong to no step. Everything written
 * before this field existed is one, and an item that genuinely applies
 * throughout — the signed engagement letter — stays one. They are gathered
 * at the top and shown on step one, where the old undivided list sat.
 *
 * **Moving a step moves its list with it.** `stepIndex` is a position, so
 * reordering or deleting a step has to re-map every item or the lists end
 * up attached to the wrong work. That is done here, in `move` and
 * `removeStep`, rather than left for the server to notice.
 */
function Workflow({
  steps,
  checklist,
  docTemplates = [],
  onSteps,
  onChecklist,
}) {
  /** Items belonging to the job rather than to one step. */
  const loose = checklist.filter((item) => !Number.isInteger(item.stepIndex));

  const itemsFor = (index) =>
    checklist.filter((item) => item.stepIndex === index);

  function patchStep(index, patch) {
    onSteps(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  /**
   * Swap two steps, and carry their checklists with them.
   *
   * Without the re-map the names move and the lists do not, which is the
   * worst of the three possible outcomes: it looks like it worked.
   */
  function move(index, by) {
    const target = index + by;
    if (target < 0 || target >= steps.length) return;

    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onSteps(next);

    onChecklist(
      checklist.map((item) => {
        if (item.stepIndex === index) return { ...item, stepIndex: target };
        if (item.stepIndex === target) return { ...item, stepIndex: index };
        return item;
      }),
    );
  }

  /**
   * Delete a step. Its own items become whole-job items rather than being
   * deleted with it — losing a step is an editing decision, losing the
   * firm's note that it needs the bank statements is not.
   */
  function removeStep(index) {
    onSteps(steps.filter((_, i) => i !== index));
    onChecklist(
      checklist.map((item) => {
        if (!Number.isInteger(item.stepIndex)) return item;
        if (item.stepIndex === index) return { ...item, stepIndex: null };
        // everything after it shuffles down one
        if (item.stepIndex > index)
          return { ...item, stepIndex: item.stepIndex - 1 };
        return item;
      }),
    );
  }

  function addItem(stepIndex) {
    onChecklist([
      ...checklist,
      {
        name: "",
        side: "client",
        mandatory: true,
        stepIndex,
        // a document, which is what every row meant before kinds existed
        kind: "upload",
        linkTo: "",
        docTemplateId: "",
      },
    ]);
  }

  /** Rows are addressed by identity, because their order is not their key. */
  function patchItem(item, patch) {
    onChecklist(
      checklist.map((row) => (row === item ? { ...row, ...patch } : row)),
    );
  }

  function removeItem(item) {
    onChecklist(checklist.filter((row) => row !== item));
  }

  const udinAt = steps.findIndex((s) => s.kind === "udin");

  return (
    <section className="border-rule flex flex-col gap-4 border-t py-7">
      <div>
        <h2 className="font-display text-16 font-semibold">
          The work, step by step
        </h2>
        <p className="text-13 text-ink-muted mt-1 max-w-[72ch]">
          A job opens one step at a time and shows that step&rsquo;s list only.
          Put each thing against the step that actually asks for it.
        </p>
      </div>

      {steps.length === 0 ? (
        /*
          The cold start, which is most of what the *new service* page is.

          Before this it was an amber warning above a lone "Add a row"
          button: the form arrived in a state it would refuse to save
          from, and said so without offering a way out other than typing
          five step names from nothing. The empty state keeps the board's
          own frame (it is a section with nothing in it, not an error) and
          offers the shape the firm's own catalog already uses. It is a
          **prefill, not a template** — every row is editable and
          removable the moment it lands, and nothing is saved until the
          form is submitted.
        */
        <div className="rounded-ledger border-rule bg-surface flex flex-col items-start gap-3 border border-dashed p-6">
          <div>
            <p className="text-14 font-medium">This service has no steps yet</p>
            <p className="text-13 text-ink-muted max-w-[68ch]">
              Start from the shape most of the catalog already uses, then rename
              and reorder — or build it from scratch.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                onSteps(
                  USUAL_SHAPE.map((name) => ({ name, minRole: "", kind: "" })),
                )
              }
              className="rounded-control bg-carbon text-13 text-on-carbon h-9 px-3 font-medium"
            >
              Start from the usual shape
            </button>
            <button
              type="button"
              onClick={() => onSteps([{ name: "", minRole: "", kind: "" }])}
              className="rounded-control border-rule bg-surface hover:bg-carbon-wash text-13 h-9 border px-3"
            >
              Start with one blank step
            </button>
          </div>
          <p className="text-12 text-faint">{USUAL_SHAPE.join("  →  ")}</p>
        </div>
      ) : (
        <div className="rounded-ledger border-rule bg-surface divide-rule divide-y border">
          {/* --- items that belong to the whole job ---------------------- */}
          {loose.length > 0 && (
            <div className="flex flex-col gap-2 p-3 sm:p-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h3 className="text-14 font-medium">Across the whole job</h3>
                <p className="text-12 text-ink-muted">
                  Not tied to one step; shown on step one. Move each one to the
                  step that asks for it.
                </p>
              </div>
              <ul className="flex flex-col gap-1.5">
                {loose.map((item, i) => (
                  <ChecklistRow
                    key={`loose-${i}`}
                    item={item}
                    label={`Whole-job item ${i + 1}`}
                    steps={steps}
                    docTemplates={docTemplates}
                    onPatch={(patch) => patchItem(item, patch)}
                    onRemove={() => removeItem(item)}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* --- the steps themselves ------------------------------------ */}
          {steps.map((step, index) => {
            const items = itemsFor(index);
            const fromClient = items.filter((i) => i.side === "client").length;

            return (
              <div key={index} className="flex flex-col gap-2 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The number belongs beside the name it numbers, at every
                      width: `contents` lets them be one line on a phone and
                      two flex items of the header row above it. */}
                  <div className="flex w-full min-w-0 flex-1 items-center gap-2 sm:contents">
                    <span className="num text-12 border-carbon text-carbon-ink grid size-6 shrink-0 place-items-center rounded-full border font-medium">
                      {index + 1}
                    </span>
                    <input
                      aria-label={`Step ${index + 1} name`}
                      value={step.name}
                      placeholder="Collect data"
                      onChange={(e) =>
                        patchStep(index, { name: e.target.value })
                      }
                      className="rounded-control border-rule bg-surface text-15 focus:border-carbon h-9 min-w-0 flex-1 border px-2 font-medium outline-none"
                    />
                  </div>
                  {/*
                    What the step *is*. One `<select>` with two entries beats
                    a checkbox: "Ordinary work" is a real answer somebody can
                    read off the row, where an unticked box is only the
                    absence of the other one.
                  */}
                  <select
                    aria-label={`What kind of step ${index + 1} is`}
                    value={step.kind ?? ""}
                    onChange={(e) => patchStep(index, { kind: e.target.value })}
                    className={`${ROW_CONTROL} w-[9.5rem]`}
                  >
                    {STEP_KINDS.map((kind) => (
                      <option key={kind || "plain"} value={kind}>
                        {STEP_KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Who may do step ${index + 1}`}
                    value={step.minRole ?? ""}
                    onChange={(e) =>
                      patchStep(index, { minRole: e.target.value })
                    }
                    className={`${ROW_CONTROL} w-[11rem]`}
                  >
                    <option value="">Anyone on the job</option>
                    {EXEC_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]} or above
                      </option>
                    ))}
                  </select>
                  <div className="ml-auto flex gap-1 sm:ml-0">
                    <RowButton
                      label={`Move step ${index + 1} up`}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp size={14} weight="bold" />
                    </RowButton>
                    <RowButton
                      label={`Move step ${index + 1} down`}
                      onClick={() => move(index, 1)}
                      disabled={index === steps.length - 1}
                    >
                      <ArrowDown size={14} weight="bold" />
                    </RowButton>
                    <RowButton
                      label={`Remove step ${index + 1}`}
                      onClick={() => removeStep(index)}
                    >
                      <X size={14} weight="bold" />
                    </RowButton>
                  </div>
                </div>

                <div className="border-rule ml-3 flex flex-col gap-2 border-l pl-4">
                  {step.kind === "udin" && (
                    <p className="text-12 text-brass-ink max-w-[68ch]">
                      The job stops here until a UDIN is on the register against
                      it. Whoever is on this step is shown the question and the
                      way into the register — and this is what makes the service
                      one that cannot be completed without a number.
                    </p>
                  )}

                  {items.length === 0 ? (
                    <p className="text-12 text-faint">
                      Nothing listed. The step is finished by hand, when whoever
                      is doing it says so.
                    </p>
                  ) : (
                    <>
                      <p className="text-12 text-ink-muted">
                        Needs <span className="num">{items.length}</span>{" "}
                        {items.length === 1 ? "thing" : "things"}
                        {fromClient > 0 && (
                          <>
                            {", "}
                            <span className="num">{fromClient}</span>
                            {fromClient === items.length ? " of them" : ""} from
                            the client
                          </>
                        )}
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {items.map((item, i) => (
                          <ChecklistRow
                            key={`${index}-${i}`}
                            item={item}
                            label={`Step ${index + 1} item ${i + 1}`}
                            steps={steps}
                            docTemplates={docTemplates}
                            onPatch={(patch) => patchItem(item, patch)}
                            onRemove={() => removeItem(item)}
                          />
                        ))}
                      </ul>
                    </>
                  )}

                  <div>
                    <TextAction onClick={() => addItem(index)}>
                      Add something this step needs
                    </TextAction>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2 p-3 sm:px-4">
            <button
              type="button"
              onClick={() =>
                onSteps([...steps, { name: "", minRole: "", kind: "" }])
              }
              className="rounded-control border-rule bg-surface hover:bg-carbon-wash text-13 inline-flex h-9 items-center gap-1.5 border px-3 font-medium"
            >
              <Plus size={14} weight="bold" /> Add a step
            </button>
            <button
              type="button"
              onClick={() => addItem(null)}
              className="rounded-control text-13 text-ink-muted hover:text-ink hover:bg-carbon-wash inline-flex h-9 items-center gap-1.5 px-3"
            >
              <Plus size={14} weight="bold" /> Add a whole-job item
            </button>
          </div>
        </div>
      )}

      <p className="text-12 text-faint max-w-[80ch]">
        Every job also ends with two steps the firm does not configure — the
        reviewer&rsquo;s sign-off and the completion. The filing details and the
        acknowledgements are a record on the job rather than a step, and the
        UDIN is wherever you put it above.{" "}
        {udinAt >= 0 ? (
          <span className="text-brass-ink">
            This service needs a UDIN: step{" "}
            <span className="num">{udinAt + 1}</span> says so.
          </span>
        ) : (
          "No step here generates a UDIN, so a job of this kind can be completed without one."
        )}
      </p>
    </section>
  );
}

/**
 * One thing a step needs: what it is, which one, who owes it, which step it
 * belongs to, and whether it is required.
 *
 * ## Why it is a grid
 *
 * It was a `flex-wrap` of six controls. On the real screen the name input
 * — the only part anybody reads — was the thing that gave way, and rows
 * rendered as "Sig", "F", "M" beside five full-width selects. Now the six
 * cells are declared columns: the name takes what is left after the fixed
 * four, every row's third control sits under every other row's third
 * control, and below `lg` the whole thing stacks with the name on its own
 * line.
 *
 * The step selector stays on the row rather than becoming drag-and-drop,
 * because moving one item between two steps is the common edit and a
 * `<select>` does it with the keyboard, on a phone, and without a library.
 * It is numbered rather than named: the step's full title is two feet
 * above, and repeating it in a 14rem control on every row was most of what
 * crushed the name.
 */
function ChecklistRow({
  item,
  label,
  steps,
  docTemplates = [],
  onPatch,
  onRemove,
}) {
  const kind = item.kind ?? "upload";

  return (
    /*
      One row on a wide screen, one small card on a phone.

      Below `lg` the seven columns become two: the name across the top,
      then the controls in pairs, inside a 1px frame so that one thing the
      step needs is visibly one thing. Six full-width controls stacked with
      nothing between them read as a single undifferentiated list.
    */
    <li className="border-rule rounded-control hover:bg-carbon-wash/40 grid grid-cols-2 items-center gap-1.5 border p-2 lg:-mx-1 lg:grid-cols-[minmax(10rem,1fr)_11rem_11rem_8.5rem_6.5rem_5.5rem_1.75rem] lg:rounded-sm lg:border-0 lg:px-1 lg:py-0.5">
      <input
        aria-label={label}
        value={item.name}
        placeholder={PLACEHOLDER[kind]}
        onChange={(e) => onPatch({ name: e.target.value })}
        className="rounded-control border-rule bg-surface text-14 focus:border-carbon col-span-2 h-9 min-w-0 border px-2 outline-none lg:col-span-1"
      />

      {/*
        What this row asks for, which decides everything else on it.

        Switching kind does not clear the two fields below — the server
        drops whichever the new kind does not use, and a person who clicks
        `link` by mistake gets their template back by clicking `doc` again.
      */}
      <select
        aria-label={`${label}: what kind of thing it is`}
        value={kind}
        onChange={(e) =>
          onPatch({
            kind: e.target.value,
            // a tick somebody at the firm makes, and a letter the firm
            // drafts, are ours whatever the row said before
            ...(["tick", "doc"].includes(e.target.value)
              ? { side: "firm" }
              : null),
          })
        }
        className={ROW_CONTROL}
        title={ITEM_KIND_HINTS[kind]}
      >
        {ITEM_KINDS.map((k) => (
          <option key={k} value={k}>
            {ITEM_KIND_LABELS[k]}
          </option>
        ))}
      </select>

      {/*
        The cell the kind decides. It keeps its column when the kind does
        not use it, so the four controls after it stay in line down the
        whole list rather than sliding left on every other row.
      */}
      {kind === "link" ? (
        <select
          aria-label={`${label}: which screen`}
          value={item.linkTo ?? ""}
          onChange={(e) => onPatch({ linkTo: e.target.value })}
          className={ROW_CONTROL}
        >
          <option value="">Which screen…</option>
          {ITEM_LINKS.map((row) => (
            <option key={row.key} value={row.key}>
              {row.label}
            </option>
          ))}
        </select>
      ) : kind === "doc" ? (
        <select
          aria-label={`${label}: which template`}
          value={item.docTemplateId ?? ""}
          onChange={(e) => onPatch({ docTemplateId: e.target.value })}
          className={ROW_CONTROL}
        >
          {/*
            Empty is a real answer, not a prompt: the row then offers
            every template on the job and the person doing the work
            picks. See the note in `saveService`.
          */}
          <option value="">Any — picked on the job</option>
          {Object.entries(
            docTemplates.reduce((groups, row) => {
              const kind = row.kind || "Other";
              (groups[kind] ??= []).push(row);
              return groups;
            }, {}),
          ).map(([kind, rows]) => (
            <optgroup key={kind} label={kind}>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.verified ? "" : " (draft)"}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : (
        /* Not applicable, said the way the rest of the application says
           it: a grey dash, so the column reads as a column rather than as
           a control somebody forgot to fill in. */
        <span aria-hidden="true" className="text-faint hidden px-2 lg:block">
          —
        </span>
      )}

      {/*
        Who owes it. A letter the firm drafts and a tick somebody at the
        firm makes are ours by definition, so the question is only asked
        of a document and of work on another screen.
      */}
      {kind === "upload" || kind === "link" ? (
        <select
          aria-label={`${label}: who provides it`}
          value={item.side}
          onChange={(e) => onPatch({ side: e.target.value })}
          className={ROW_CONTROL}
        >
          <option value="client">From the client</option>
          <option value="firm">We produce</option>
        </select>
      ) : (
        <span className="text-12 text-faint px-2">Ours</span>
      )}

      {/*
        The step, by number. The names are two inches above in the order
        they run, and spelling one out here cost 14rem on every row for a
        word the reader had just read.
      */}
      <select
        aria-label={`${label}: which step`}
        value={Number.isInteger(item.stepIndex) ? String(item.stepIndex) : ""}
        onChange={(e) =>
          onPatch({
            stepIndex: e.target.value === "" ? null : Number(e.target.value),
          })
        }
        className={ROW_CONTROL}
      >
        <option value="">Whole job</option>
        {steps.map((step, i) => (
          <option key={i} value={i} title={step.name}>
            Step {i + 1}
          </option>
        ))}
      </select>

      <label className="text-13 text-ink-muted flex h-9 items-center gap-2 whitespace-nowrap">
        <input
          type="checkbox"
          checked={item.mandatory}
          onChange={(e) => onPatch({ mandatory: e.target.checked })}
          className="accent-carbon"
        />
        Required
      </label>

      <span className="col-span-2 justify-self-end lg:col-span-1">
        <RowButton label={`Remove ${label}`} onClick={onRemove}>
          <X size={13} weight="bold" />
        </RowButton>
      </span>
    </li>
  );
}

/** What each kind of row is, said as an example rather than as a rule. */
const PLACEHOLDER = {
  upload: "Bank statements for the period",
  tick: "Confirm the client's email is current",
  link: "Generate the UDIN on the register",
  doc: "Engagement letter",
};

function RowButton({ label, children, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rounded-control border-rule text-ink-muted hover:text-ink hover:border-carbon grid h-7 w-7 place-items-center border transition-colors disabled:opacity-30 disabled:hover:border-[color:var(--rule)]"
      {...rest}
    >
      {children}
    </button>
  );
}

/** Adding a row is a quiet, repeated act; it is not a button of its own. */
function TextAction({ children, ...rest }) {
  return (
    <button
      type="button"
      className="text-13 text-carbon-ink hover:text-ink inline-flex h-7 items-center gap-1.5 underline-offset-4 hover:underline"
      {...rest}
    >
      <Plus size={13} weight="bold" />
      {children}
    </button>
  );
}

/**
 * One of the form's questions: the heading and the line under it on the
 * left, the controls on the right, divided from the next question by a
 * hairline.
 *
 * It was `components/ui/Panel` — a card. Five cards stacked down a column
 * is the shape a settings screen takes when every question got a box, and
 * the boxes said nothing the headings did not. A rule costs one pixel and
 * does the same work.
 */
function Section({ title, hint, first = false, children }) {
  return (
    <section
      className={`grid gap-x-10 gap-y-4 py-7 lg:grid-cols-[minmax(13rem,19rem)_1fr] ${
        first ? "" : "border-rule border-t"
      }`}
    >
      <div>
        <h2 className="font-display text-16 font-semibold">{title}</h2>
        {hint && (
          <p className="text-13 text-ink-muted mt-1 max-w-[46ch]">{hint}</p>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * `h-9`, not `h-10`: every other form in the application — the offices,
 * the due-date corrections, the template editor — is 36px, and a control
 * that is 4px taller on one screen than on the next is the kind of thing
 * nobody can name and everybody feels.
 */
const CONTROL =
  "rounded-control border-rule bg-surface text-14 focus:border-carbon h-9 border px-2 outline-none";

/** The same control, sized for a row rather than for a labelled field. */
const ROW_CONTROL =
  "rounded-control border-rule bg-surface text-13 focus:border-carbon h-9 min-w-0 border px-2 outline-none";

function Field({ label, hint, className = "", inputClassName = "", ...rest }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input className={`${CONTROL} ${inputClassName}`} {...rest} />
      {hint && <span className="text-12 text-ink-muted">{hint}</span>}
    </label>
  );
}

function Select({ label, options, ...rest }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <select className={CONTROL} {...rest}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
