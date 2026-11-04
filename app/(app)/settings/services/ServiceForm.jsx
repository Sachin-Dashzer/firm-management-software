"use client";

import { saving } from "@/lib/forms/saving";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
} from "@/lib/services/catalog";
import { ROLE_LABELS } from "@/lib/permissions";
import UiPanel from "@/components/ui/Panel";
import Notice from "@/components/ui/Notice";
import { saveService } from "./actions";

/**
 * One form for adding a service and for editing one.
 *
 * The checklist and the steps are held in state and posted as JSON, so their
 * order survives and an unticked "mandatory" box cannot knock the rows out of
 * alignment.
 */
export default function ServiceForm({ service }) {
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
      className="flex flex-col gap-6"
    >
      {service?.id && <input type="hidden" name="id" value={service.id} />}
      <input type="hidden" name="checklist" value={JSON.stringify(checklist)} />
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />

      {/* `Notice` rather than two more hand-drawn tinted boxes: the firm
          has one shape for "this went wrong" and one for "read this", and
          a form is the last place to invent a third. */}
      {message?.error && <Notice tone="bad" title={message.error} />}
      {message?.warning && (
        <Notice tone="warn" title={message.ok}>
          <p>{message.warning}</p>
        </Notice>
      )}

      {/*
        Three panels, not one grid of ten fields (03-11-2026).

        They were one undifferentiated `sm:grid-cols-2` block: the name sat
        beside the code, the tier beside a role, the effort estimate beside
        a free-text note about statutory dates, all at the same weight. Ten
        unrelated decisions in one box reads as a tax return.

        They are three questions, and naming them is most of the work:
        **what is this**, **who does it**, **how long does it take**.
      */}
      <Panel
        title="What this service is"
        hint="The name the team will pick from a list, and the code that appears on every job."
      >
        <Field label="Name" name="name" defaultValue={service?.name} required />
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
      </Panel>

      <Panel
        title="Who does it, and who signs it off"
        hint="The tier sets both, and both stay editable after. A job can never be signed off by the person who did it."
      >
        <label className="flex flex-col gap-1">
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

        <label className="flex flex-col gap-1">
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

        <label className="flex flex-col gap-1">
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
      </Panel>

      <Panel
        title="How often, and how long"
        hint="Recurring work is generated for each period automatically. Leave the day counts blank where a statutory date decides them."
      >
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
          className="sm:col-span-2"
        />
      </Panel>

      <Workflow
        steps={steps}
        checklist={checklist}
        onSteps={setSteps}
        onChecklist={setChecklist}
      />

      <Panel
        title="Billing defaults"
        hint="What a job of this kind starts at. Every one can still be priced on its own."
      >
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
        <label className="text-14 flex items-start gap-2 sm:col-span-2">
          <input
            type="checkbox"
            name="udinRequired"
            defaultChecked={service?.udinRequired}
            className="mt-1"
          />
          <span>
            A UDIN is required when this is completed
            <span className="text-12 text-ink-muted block">
              Every certificate, audit report and attestation the firm signs
              needs one. A job of this kind will refuse to complete without the
              number on the register.
            </span>
          </span>
        </label>
      </Panel>

      {/*
        The bar sticks to the bottom of the viewport, because the form is
        now four panels and a step editor tall and the save button was
        below all of it. On a service with eight steps the only way to save
        was to scroll past every one of them.
      */}
      <div className="border-rule bg-surface rounded-ledger sticky bottom-2 flex flex-wrap items-center gap-3 border p-3">
        <button
          type="submit"
          disabled={pending || steps.length === 0}
          className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
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
          className="text-14 text-ink-muted hover:text-ink underline underline-offset-4"
        >
          Cancel
        </button>
        {steps.length === 0 ? (
          <p className="text-13 text-waiting">
            Add at least one step first — a job with no steps has nothing to do.
          </p>
        ) : editing ? (
          <p className="text-13 text-ink-muted max-w-[60ch]">
            Version <span className="num">{service.version}</span>. Changing the
            steps, their checklists, the level, the roles, the turnaround, the
            recurrence or the UDIN rule saves a new version; jobs already
            created keep the one they started from.
          </p>
        ) : (
          <p className="text-13 text-ink-muted max-w-[60ch]">
            <span className="num">{steps.length}</span>{" "}
            {steps.length === 1 ? "step" : "steps"}, and{" "}
            <span className="num">{checklist.length}</span>{" "}
            {checklist.length === 1 ? "document" : "documents"} between them.
            The team can create jobs from this as soon as it is saved.
          </p>
        )}
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
 * **Review, the filing and the completion are deliberately not here.**
 * Every job now ends with those three whether a service lists them or not
 * (see `lib/engagements/steps.js`), so putting them in a template's own
 * steps would show them twice — the thing to prune from the seeded
 * services, not to repeat on new ones.
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
 * ## Why they are one section now
 *
 * They were two: a flat **Checklist** of everything the job would ever
 * need, and below it a flat list of **Steps**. Nothing connected them. A
 * GST return's checklist was fourteen rows, and somebody on "Reconcile
 * with GSTR-2B" had to read all fourteen to find the two that were
 * theirs — while the eleven belonging to steps they had not reached yet
 * sat there looking like work they had forgotten.
 *
 * So a step owns its list. "Collect data" asks for the bank statements and
 * the 26AS; "Prepare the computation" asks for the reconciliation tied out
 * and last year's return to hand. The engagement screen then shows the
 * open step's list and no other — which is the same request as the steps
 * panel, one layer earlier.
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
function Workflow({ steps, checklist, onSteps, onChecklist }) {
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
      { name: "", side: "client", mandatory: true, stepIndex },
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

  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-4 border p-4">
      <div>
        <h2 className="font-display text-15 font-semibold">
          The work, step by step
        </h2>
        <p className="text-13 text-ink-muted max-w-[72ch]">
          The order the work is done in, and what each step needs before it can
          be finished. A job opens one step at a time and shows that
          step&rsquo;s checklist only, so put each document against the step
          that actually asks for it.
        </p>
      </div>

      {/*
        The cold start, which is most of what the *new service* page is.

        Before this it was an amber line saying "a service needs at least
        one step" above a lone "Add a row" button: the form arrived in a
        state it would refuse to save from, and said so without offering a
        way out other than typing five step names from nothing.

        So the empty state offers the shape the firm's own catalog already
        uses. It is a **prefill, not a template** — every row is editable
        and removable the moment it lands, and nothing is saved until the
        form is submitted.
      */}
      {steps.length === 0 && (
        <div className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-3 border p-3">
          <div>
            <p className="text-13 font-medium">This service has no steps yet</p>
            <p className="text-13 max-w-[72ch]">
              A job needs at least one. Start from the shape most of the catalog
              already uses, then rename and reorder — or build it from scratch.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                onSteps(USUAL_SHAPE.map((name) => ({ name, minRole: "" })))
              }
              className="rounded-control bg-carbon text-13 text-on-carbon h-9 px-3 font-medium"
            >
              Start from the usual shape
            </button>
            <button
              type="button"
              onClick={() => onSteps([{ name: "", minRole: "" }])}
              className="rounded-control border-carbon bg-paper hover:bg-carbon-wash text-13 h-9 border px-3"
            >
              Start with one blank step
            </button>
          </div>
          <p className="text-12">{USUAL_SHAPE.join(" → ")}</p>
        </div>
      )}

      {/* --- items that belong to the whole job -------------------------- */}
      {loose.length > 0 && (
        <div className="rounded-ledger border-rule bg-sunk flex flex-col gap-2 border border-dashed p-3">
          <div>
            <h3 className="text-13 font-medium">The whole job</h3>
            <p className="text-12 text-ink-muted max-w-[68ch]">
              Not tied to one step. These show on step one. Items created before
              a service&rsquo;s checklist could be divided land here — move each
              one to the step that asks for it.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {loose.map((item, i) => (
              <ChecklistRow
                key={`loose-${i}`}
                item={item}
                label={`Whole-job item ${i + 1}`}
                steps={steps}
                onPatch={(patch) => patchItem(item, patch)}
                onRemove={() => removeItem(item)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* --- the steps themselves ---------------------------------------- */}
      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => {
          const items = itemsFor(index);
          const fromClient = items.filter((i) => i.side === "client").length;

          return (
            <li
              key={index}
              className="rounded-ledger border-rule bg-paper flex flex-col gap-3 border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="num text-12 bg-carbon text-on-carbon grid size-6 shrink-0 place-items-center rounded-full font-medium">
                  {index + 1}
                </span>
                <input
                  aria-label={`Step ${index + 1} name`}
                  value={step.name}
                  placeholder="Collect data"
                  onChange={(e) => patchStep(index, { name: e.target.value })}
                  className="rounded-control border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-2 font-medium"
                />
                <select
                  aria-label={`Who may do step ${index + 1}`}
                  value={step.minRole ?? ""}
                  onChange={(e) =>
                    patchStep(index, { minRole: e.target.value })
                  }
                  className="rounded-control border-rule bg-paper text-13 h-9 border px-2"
                >
                  <option value="">Anyone on the job</option>
                  {EXEC_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]} or above
                    </option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <RowButton
                    label={`Move step ${index + 1} up`}
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </RowButton>
                  <RowButton
                    label={`Move step ${index + 1} down`}
                    onClick={() => move(index, 1)}
                    disabled={index === steps.length - 1}
                  >
                    ↓
                  </RowButton>
                  <RowButton
                    label={`Remove step ${index + 1}`}
                    onClick={() => removeStep(index)}
                  >
                    ×
                  </RowButton>
                </div>
              </div>

              <div className="border-rule flex flex-col gap-2 border-l pl-4">
                <p className="text-12 text-ink-muted font-medium">
                  This step needs
                  {items.length > 0 && (
                    <>
                      {" · "}
                      <span className="num">{items.length}</span>
                      {fromClient > 0 && (
                        <>
                          {", "}
                          <span className="num">{fromClient}</span> from the
                          client
                        </>
                      )}
                    </>
                  )}
                </p>

                {items.length === 0 ? (
                  <p className="text-12 text-faint">
                    Nothing listed. The step will be finished by hand when
                    whoever is doing it says so.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {items.map((item, i) => (
                      <ChecklistRow
                        key={`${index}-${i}`}
                        item={item}
                        label={`Step ${index + 1} item ${i + 1}`}
                        steps={steps}
                        onPatch={(patch) => patchItem(item, patch)}
                        onRemove={() => removeItem(item)}
                      />
                    ))}
                  </ul>
                )}

                <div>
                  <button
                    type="button"
                    onClick={() => addItem(index)}
                    className="rounded-control border-rule hover:bg-carbon-wash text-13 h-8 border px-2"
                  >
                    Add something this step needs
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSteps([...steps, { name: "", minRole: "" }])}
          className="rounded-control border-carbon hover:bg-carbon-wash text-14 h-9 border px-3 font-medium"
        >
          Add a step
        </button>
        <button
          type="button"
          onClick={() => addItem(null)}
          className="rounded-control border-rule hover:bg-carbon-wash text-14 h-9 border px-3"
        >
          Add a whole-job item
        </button>
      </div>

      <p className="text-12 text-faint max-w-[72ch]">
        Every job also ends with three steps the firm does not configure — the
        filing and its UDIN, the reviewer&rsquo;s sign-off, and the completion.
        They are the same on every service, so they are not listed here.
      </p>
    </section>
  );
}

/**
 * One thing a step needs: the name, who owes it, whether it is mandatory,
 * and which step it belongs to.
 *
 * The step selector lives on the row rather than being drag-and-drop,
 * because moving one item between two steps is the common edit and a
 * `<select>` does it with the keyboard, on a phone, and without a library.
 */
function ChecklistRow({ item, label, steps, onPatch, onRemove }) {
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input
        aria-label={label}
        value={item.name}
        placeholder="Bank statements for the period"
        onChange={(e) => onPatch({ name: e.target.value })}
        className="rounded-control border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-2"
      />
      <select
        aria-label={`${label}: who provides it`}
        value={item.side}
        onChange={(e) => onPatch({ side: e.target.value })}
        className="rounded-control border-rule bg-paper text-13 h-9 border px-2"
      >
        <option value="client">From the client</option>
        <option value="firm">We produce</option>
      </select>
      <select
        aria-label={`${label}: which step`}
        value={Number.isInteger(item.stepIndex) ? String(item.stepIndex) : ""}
        onChange={(e) =>
          onPatch({
            stepIndex: e.target.value === "" ? null : Number(e.target.value),
          })
        }
        className="rounded-control border-rule bg-paper text-13 h-9 max-w-[14rem] border px-2"
      >
        <option value="">The whole job</option>
        {steps.map((step, i) => (
          <option key={i} value={i}>
            {i + 1}. {step.name || "(unnamed step)"}
          </option>
        ))}
      </select>
      <label className="text-13 flex items-center gap-2 whitespace-nowrap">
        <input
          type="checkbox"
          checked={item.mandatory}
          onChange={(e) => onPatch({ mandatory: e.target.checked })}
        />
        Mandatory
      </label>
      <RowButton label={`Remove ${label}`} onClick={onRemove}>
        ×
      </RowButton>
    </li>
  );
}

function RowButton({ label, children, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rounded-control border-rule text-14 h-9 w-9 border disabled:opacity-40"
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * One titled group of fields.
 *
 * The heading is the question the fields answer. Four of these beat one box
 * of fourteen inputs, which is what this form was — and on the *new* service
 * page, where every field is empty, the headings are the only thing telling
 * somebody what they are being asked.
 */
/**
 * One of the form's questions.
 *
 * Built on `components/ui/Panel` as of 04-11-2026: this file had its own
 * copy of the same card — the same radius, border, surface and padding,
 * written out again — and a second place to change the firm's card is a
 * second place to forget. What it keeps is the form's own two things: the
 * hint reads as a sub-line under the question rather than as a note off to
 * the right, and the fields sit on a two-column grid.
 */
function Panel({ title, hint, children }) {
  return (
    <UiPanel title={title}>
      {hint && (
        <p className="text-13 text-ink-muted -mt-2 max-w-[72ch]">{hint}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </UiPanel>
  );
}

/**
 * `h-9`, not `h-10`: every other form in the application — the offices,
 * the due-date corrections, the template editor — is 36px, and a control
 * that is 4px taller on one screen than on the next is the kind of thing
 * nobody can name and everybody feels.
 */
const CONTROL =
  "rounded-control border-rule bg-paper text-14 focus:border-carbon h-9 border px-2 outline-none";

function Field({ label, hint, className = "", inputClassName = "", ...rest }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input className={`${CONTROL} ${inputClassName}`} {...rest} />
      {hint && <span className="text-12 text-ink-muted">{hint}</span>}
    </label>
  );
}

function Select({ label, options, ...rest }) {
  return (
    <label className="flex flex-col gap-1">
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
