"use client";

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
      action={(formData) =>
        startTransition(async () => {
          const result = await saveService(null, formData);
          setMessage(result);
          // a warning has to be read, so the form stays where it is
          if (result?.ok && !result.warning) router.push("/settings/services");
        })
      }
      className="flex flex-col gap-6"
    >
      {service?.id && <input type="hidden" name="id" value={service.id} />}
      <input type="hidden" name="checklist" value={JSON.stringify(checklist)} />
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />

      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}
      {message?.warning && (
        <div
          role="status"
          className="rounded-ledger border-waiting bg-waiting-wash text-13 flex flex-col gap-1 border px-3 py-2"
        >
          <p className="font-medium">{message.ok}</p>
          <p>{message.warning}</p>
        </div>
      )}

      <section className="rounded-ledger border-rule bg-surface grid gap-4 border p-4 sm:grid-cols-2">
        <Field label="Name" name="name" defaultValue={service?.name} required />
        <Field
          label="Code"
          name="code"
          defaultValue={service?.code}
          placeholder="GSTR3B"
          inputClassName="font-mono uppercase"
          required
        />

        <Select
          label="Category"
          name="category"
          defaultValue={service?.category ?? SERVICE_CATEGORIES[0]}
          options={SERVICE_CATEGORIES.map((c) => [c, c])}
        />

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Tier</span>
          <select
            name="level"
            value={level}
            onChange={(e) => chooseLevel(e.target.value)}
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
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
          label="If not a number of days, what decides the date?"
          name="turnaroundNote"
          defaultValue={service?.turnaroundNote}
          placeholder="Before the statutory due date"
          className="sm:col-span-2"
        />
      </section>

      <ItemList
        title="Checklist"
        hint="What we need from the client, and what we produce."
        items={checklist}
        onChange={setChecklist}
        blank={{ name: "", side: "client", mandatory: true }}
        renderExtra={(item, update) => (
          <>
            <select
              aria-label="Side"
              value={item.side}
              onChange={(e) => update({ side: e.target.value })}
              className="rounded-ledger border-rule bg-paper text-13 h-9 border px-2"
            >
              <option value="client">From the client</option>
              <option value="firm">We produce</option>
            </select>
            <label className="text-13 flex items-center gap-2 whitespace-nowrap">
              <input
                type="checkbox"
                checked={item.mandatory}
                onChange={(e) => update({ mandatory: e.target.checked })}
              />
              Mandatory
            </label>
          </>
        )}
      />

      <ItemList
        title="Steps"
        hint="The order the work is done in, e.g. Collect data, Prepare, Review, File. A step can ask for more than the tier does — “Sign the report” on work an employee prepares."
        items={steps}
        onChange={setSteps}
        blank={{ name: "", minRole: "" }}
        renderExtra={(item, update) => (
          <select
            aria-label="Who may do this step"
            value={item.minRole ?? ""}
            onChange={(e) => update({ minRole: e.target.value })}
            className="rounded-ledger border-rule bg-paper text-13 h-9 border px-2"
          >
            <option value="">Anyone on the job</option>
            {EXEC_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]} or above
              </option>
            ))}
          </select>
        )}
      />

      <section className="rounded-ledger border-rule bg-surface grid gap-4 border p-4 sm:grid-cols-2">
        <h2 className="font-display text-20 sm:col-span-2">Billing defaults</h2>
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
        <label className="text-14 flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            name="udinRequired"
            defaultChecked={service?.udinRequired}
          />
          A UDIN is required when this is completed
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-ledger bg-carbon text-14 h-10 px-4 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Add service"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/settings/services")}
          className="text-14 text-ink-muted underline underline-offset-4"
        >
          Cancel
        </button>
        {editing && (
          <p className="text-13 text-ink-muted">
            Version {service.version}. Changing the checklist, the steps, the
            level, the roles, the turnaround, the recurrence or the UDIN rule
            saves a new version; engagements already created keep the one they
            started from.
          </p>
        )}
      </div>
    </form>
  );
}

/** A reorderable list of rows: used for both the checklist and the steps. */
function ItemList({ title, hint, items, onChange, blank, renderExtra }) {
  function move(index, by) {
    const next = [...items];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function update(index, patch) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      <div>
        <h2 className="font-display text-20">{title}</h2>
        <p className="text-13 text-ink-muted">{hint}</p>
      </div>

      <ol className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2">
            <span className="text-13 text-ink-muted w-6 text-right font-mono">
              {index + 1}
            </span>
            <input
              aria-label={`${title} item ${index + 1}`}
              value={item.name}
              onChange={(e) => update(index, { name: e.target.value })}
              className="rounded-ledger border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-2"
            />
            {renderExtra?.(item, (patch) => update(index, patch))}
            <div className="flex gap-1">
              <RowButton
                label={`Move ${title} item ${index + 1} up`}
                onClick={() => move(index, -1)}
                disabled={index === 0}
              >
                ↑
              </RowButton>
              <RowButton
                label={`Move ${title} item ${index + 1} down`}
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
              >
                ↓
              </RowButton>
              <RowButton
                label={`Remove ${title} item ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                ×
              </RowButton>
            </div>
          </li>
        ))}
      </ol>

      <div>
        <button
          type="button"
          onClick={() => onChange([...items, { ...blank }])}
          className="rounded-ledger border-rule text-14 h-9 border px-3"
        >
          Add a row
        </button>
      </div>
    </section>
  );
}

function RowButton({ label, children, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rounded-ledger border-rule text-14 h-9 w-9 border disabled:opacity-40"
      {...rest}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, className = "", inputClassName = "", ...rest }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        className={`rounded-ledger border-rule bg-paper text-14 h-10 border px-2 ${inputClassName}`}
        {...rest}
      />
      {hint && <span className="text-12 text-ink-muted">{hint}</span>}
    </label>
  );
}

function Select({ label, options, ...rest }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <select
        className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
        {...rest}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
