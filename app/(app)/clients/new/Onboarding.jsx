"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ENTITY_CONFIGS,
  ENTITY_BY_KEY,
  panCharLabel,
} from "@/lib/clients/entityTypes";
import { onboardingChecks, checksPass } from "@/lib/clients/checks";
import { formatPaise } from "@/lib/money";
import { keepDraft, dropDraft } from "../../drafts/actions";
import { createGroup } from "../actions";
import {
  onboardingLookups,
  previewPackDraft,
  createFromOnboarding,
} from "./actions";

const STEPS = [
  "Entity type",
  "Client master",
  "Documents",
  "Services and fees",
  "Checks",
  "Engagement pack",
  "Create",
];

/** The fields every client has, whatever kind of entity it is. */
const COMMON_FIELDS = [
  { name: "legalName", label: "Legal name", required: true },
  { name: "tradeName", label: "Trade name" },
  { name: "pan", label: "PAN", mono: true, placeholder: "AAACZ1234C" },
  { name: "contacts.0.name", label: "Contact person", required: true },
  { name: "contacts.0.email", label: "Email", type: "email" },
  { name: "contacts.0.mobile", label: "Mobile", mono: true },
  { name: "addresses.0.state", label: "State" },
];

/** How often the fee is billed, suggested from how often the work recurs. */
const BASIS_FOR = {
  monthly: "per month",
  quarterly: "per quarter",
  annual: "per year",
  "one-time": "per engagement",
};
const BASES = ["per month", "per quarter", "per year", "per engagement"];
const GST_TREATMENTS = ["plus GST", "inclusive of GST", "no GST"];

/**
 * Onboarding a client in seven steps (spec section 3).
 *
 * The wizard exists because the questions genuinely differ by entity type: a
 * trust has no CIN, a company has no Karta, and asking every client every
 * question is how onboarding forms end up ignored. Step 1 picks the entity
 * type and the remaining six read `lib/clients/entityTypes.js` for the
 * fields, the documents, the registrations, the suggested services and the
 * letters that follow from it.
 *
 * Nothing is written until step 7. Before that it is all in this component's
 * state, which is what makes "Save draft" and stepping backwards cheap — and
 * what makes the checks safe to run as often as they like, since they only
 * ever read.
 */
export default function Onboarding({
  branches,
  partners,
  groups: knownGroups,
  services,
  packCodes,
  draft = null,
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [groups, setGroups] = useState(knownGroups);
  const [entityType, setEntityType] = useState("");
  const [values, setValues] = useState({});
  const [received, setReceived] = useState([]);
  const [fees, setFees] = useState({});
  const [groupId, setGroupId] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [addToSuggested, setAddToSuggested] = useState(false);
  const [lookups, setLookups] = useState(null);
  const [confirmDuplicates, setConfirmDuplicates] = useState(false);
  const [message, setMessage] = useState(null);
  const [created, setCreated] = useState(null);
  const [preview, setPreview] = useState(null);
  const [draftOpen, setDraftOpen] = useState(Boolean(draft));
  const [pending, startTransition] = useTransition();
  const [, startLookup] = useTransition();

  const entity = ENTITY_BY_KEY[entityType] ?? null;
  const set = (name, value) =>
    setValues((previous) => ({ ...previous, [name]: value }));

  /** Move to a step, remembering how far the person has got. */
  function go(next) {
    setStep(next);
    setFurthest((far) => Math.max(far, next));
  }

  /**
   * Picking an entity type re-stocks everything downstream of it. Changing
   * your mind at step 1 should not leave a company's ticked documents
   * sitting on a trust.
   */
  function chooseEntity(key) {
    setEntityType(key);
    setReceived([]);
    const suggested = ENTITY_BY_KEY[key]?.services ?? [];
    setFees(
      Object.fromEntries(
        services.map((service) => [
          service.code,
          {
            on: suggested.includes(service.code),
            fee: service.defaultFeePaise
              ? String(Math.round(service.defaultFeePaise / 100))
              : "",
            billingBasis: BASIS_FOR[service.recurrence] ?? "per engagement",
            gstTreatment: "plus GST",
          },
        ]),
      ),
    );
  }

  const tickedServices = useMemo(
    () =>
      services.filter((service) => fees[service.code]?.on).map((s) => s.code),
    [services, fees],
  );

  /** The three checks the database answers; re-run on demand, never on keystroke. */
  function refreshLookups() {
    if (!entityType) return;
    startLookup(async () => {
      try {
        setLookups(
          await onboardingLookups({
            entityType,
            pan: values.pan,
            gstin: values["gstins.0.gstin"],
            legalName: values.legalName,
            mobile: values["contacts.0.mobile"],
            groupId,
            services: tickedServices,
            directors: values["profile.directors"],
            partners: values["profile.partners"],
            members: values["profile.members"],
            proprietorName: values["profile.proprietorName"],
            kartaName: values["profile.kartaName"],
            trustees: values["profile.trustees"],
            officeBearers: values["profile.officeBearers"],
            soleMember: values["profile.soleMember"],
          }),
        );
      } catch {
        /**
         * The database could not be reached. The three lookups stay as
         * they were — "not checked yet" — and the form carries on being
         * usable. Nothing is let through by this: the duplicate check that
         * decides anything is the one `createClient` runs on the server.
         */
      }
    });
  }

  // the checks screen is read, not typed into, so it refreshes on arrival
  useEffect(() => {
    if (step === 4) refreshLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const checks = useMemo(
    () =>
      entityType
        ? onboardingChecks({
            entityType,
            pan: values.pan,
            gstin: values["gstins.0.gstin"],
            cin: values.cin,
            duplicate: lookups?.duplicate ?? null,
            group: step >= 4 ? (lookups?.group ?? null) : null,
            independence: step >= 4 ? (lookups?.independence ?? null) : null,
          })
        : [],
    [entityType, values, lookups, step],
  );

  const masterReady =
    String(values.legalName ?? "").trim().length >= 3 &&
    String(values["contacts.0.name"] ?? "").trim().length >= 1 &&
    Boolean(values.branchId);

  /**
   * Every new client belongs to a group (owner decision, 24-10-2026), so
   * the checks step will not let go without one. The server refuses it too;
   * this only means the refusal is not saved up until step 7.
   */
  const groupChosen = Boolean(
    groupId || (addToSuggested && lookups?.group?.suggestGroupId),
  );

  const canContinue =
    (step === 0 && Boolean(entityType)) ||
    (step === 1 && masterReady && checksPass(checks)) ||
    step === 2 ||
    step === 3 ||
    (step === 4 && groupChosen) ||
    step === 5;

  /** Keep what has been typed, for whoever has to answer the phone. */
  function saveDraft() {
    const formData = new FormData();
    formData.set("entityType", entityType);
    for (const [name, value] of Object.entries(values)) {
      if (String(value ?? "").trim()) formData.set(name, String(value));
    }
    startTransition(async () =>
      setMessage(await keepDraft("client", formData)),
    );
  }

  function carryOnWithDraft() {
    const { entityType: kind, ...rest } = draft.payload ?? {};
    if (kind) chooseEntity(kind);
    setValues(rest);
    setDraftOpen(false);
    if (kind) go(1);
  }

  /**
   * Start the next one. The branch and the partner are carried over —
   * twenty clients in a sitting are twenty clients of one office — and
   * nothing else is, because carrying a PAN over would be the worst
   * possible thing to get wrong.
   */
  function onboardAnother() {
    setValues({
      branchId: values.branchId,
      clientPartnerId: values.clientPartnerId,
    });
    setEntityType("");
    setReceived([]);
    setFees({});
    setGroupId("");
    setAddToSuggested(false);
    setLookups(null);
    setConfirmDuplicates(false);
    setCreated(null);
    setMessage(null);
    setFurthest(0);
    setStep(0);
  }

  function openDraft(code) {
    setPreview({ code, loading: true });
    startTransition(async () => {
      const result = await previewPackDraft(code, {
        legalName: values.legalName,
        tradeName: values.tradeName,
        entityType,
        gstin: values["gstins.0.gstin"],
        contactName: values["contacts.0.name"],
        state: values["addresses.0.state"],
      });
      setPreview({ code, ...result });
    });
  }

  function create() {
    startTransition(async () => {
      const result = await createFromOnboarding({
        entityType,
        values,
        received,
        groupId: addToSuggested
          ? (lookups?.group?.suggestGroupId ?? groupId)
          : groupId,
        confirmDuplicates,
        services: services
          .filter((service) => fees[service.code]?.on)
          .map((service) => ({ code: service.code, ...fees[service.code] })),
      });

      if (result?.error && !result.id) {
        setMessage(result);
        return;
      }
      if (draft) await dropDraft("client");
      setCreated(result);
    });
  }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5 p-4 md:p-6">
      <nav className="text-13 text-ink-muted">
        <Link href="/clients" className="hover:text-ink underline-offset-2">
          Clients
        </Link>
        <span className="px-1">/</span>
        <span>New client</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            New client onboarding
          </h1>
          <p className="text-13 text-ink-muted">
            Seven short steps. The entity type drives everything that follows.
          </p>
        </div>
        {!created && (
          <button
            type="button"
            onClick={saveDraft}
            disabled={pending}
            className="rounded-control border-rule bg-surface text-13 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-60"
          >
            Save draft
          </button>
        )}
      </div>

      {draftOpen && (
        <div className="rounded-ledger border-waiting bg-waiting-wash flex flex-wrap items-center gap-3 border px-3 py-2">
          <p className="text-14 flex-1">
            You have an unfinished client from <strong>{draft.age}</strong>.
            {draft.dropped.length > 0 && (
              <span className="text-13 block">
                {draft.dropped.join(" and ")}{" "}
                {draft.dropped.length === 1 ? "was" : "were"} not kept — type{" "}
                {draft.dropped.length === 1 ? "it" : "them"} in again.
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={carryOnWithDraft}
            className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium"
          >
            Carry on with it
          </button>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await dropDraft("client");
                setDraftOpen(false);
              })
            }
            className="rounded-control border-rule bg-surface text-13 h-8 border px-3"
          >
            Discard it
          </button>
        </div>
      )}

      <StepRail
        step={step}
        furthest={furthest}
        onPick={go}
        locked={Boolean(created)}
      />

      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}

      <section
        key={step}
        className="anim-pop rounded-ledger border-rule bg-surface border p-4 md:p-5"
      >
        {created ? (
          <Done created={created} router={router} onAnother={onboardAnother} />
        ) : (
          <>
            {step === 0 && (
              <EntityStep chosen={entityType} onChoose={chooseEntity} />
            )}
            {step === 1 && (
              <MasterStep
                entity={entity}
                values={values}
                set={set}
                branches={branches}
                partners={partners}
                checks={checks}
                onBlurCheck={refreshLookups}
              />
            )}
            {step === 2 && (
              <DocumentsStep
                entity={entity}
                received={received}
                setReceived={setReceived}
              />
            )}
            {step === 3 && (
              <ServicesStep services={services} fees={fees} setFees={setFees} />
            )}
            {step === 4 && (
              <ChecksStep
                checks={checks}
                lookups={lookups}
                groups={groups}
                setGroups={setGroups}
                groupId={groupId}
                setGroupId={setGroupId}
                newGroup={newGroup}
                setNewGroup={setNewGroup}
                addToSuggested={addToSuggested}
                setAddToSuggested={setAddToSuggested}
                onRefresh={refreshLookups}
                setMessage={setMessage}
              />
            )}
            {step === 5 && (
              <PackStep
                entity={entity}
                packCodes={packCodes}
                onOpen={openDraft}
                preview={preview}
                onClose={() => setPreview(null)}
              />
            )}
            {step === 6 && (
              <CreateStep
                entity={entity}
                values={values}
                services={services}
                fees={fees}
                received={received}
                checks={checks}
                groups={groups}
                groupId={groupId}
                confirmDuplicates={confirmDuplicates}
                setConfirmDuplicates={setConfirmDuplicates}
                blocking={lookups?.blocking ?? []}
              />
            )}

            <div className="border-rule mt-5 flex items-center justify-between gap-3 border-t pt-4">
              <button
                type="button"
                onClick={() => go(Math.max(0, step - 1))}
                disabled={step === 0}
                className="rounded-control border-rule text-14 hover:bg-carbon-wash h-10 border px-4 disabled:opacity-40"
              >
                Back
              </button>
              {step < 6 ? (
                <button
                  type="button"
                  onClick={() => go(step + 1)}
                  disabled={!canContinue}
                  className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-5 font-medium disabled:opacity-40"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={create}
                  disabled={pending || !masterReady || !checksPass(checks)}
                  className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-5 font-medium disabled:opacity-40"
                >
                  {pending ? "Creating…" : "Create client"}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** The seven bars across the top. A finished step can be gone back to. */
function StepRail({ step, furthest, onPick, locked }) {
  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 lg:grid-cols-7">
      {STEPS.map((label, index) => {
        const state =
          index < step ? "done" : index === step ? "current" : "ahead";
        return (
          <li key={label}>
            <button
              type="button"
              disabled={locked || index > furthest}
              onClick={() => onPick(index)}
              className="group block w-full text-left disabled:cursor-default"
            >
              <span
                aria-hidden="true"
                className={`block h-[3px] rounded-full transition-colors duration-150 ${
                  state === "done"
                    ? "bg-filed"
                    : state === "current"
                      ? "bg-carbon"
                      : "bg-rule"
                }`}
              />
              <span
                className={`text-13 mt-2 block ${
                  state === "current"
                    ? "text-carbon font-semibold"
                    : state === "done"
                      ? "text-filed"
                      : "text-ink-muted"
                }`}
              >
                {index + 1}. {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepHead({ title, note }) {
  return (
    <header className="mb-4">
      <h2 className="font-display text-20 font-semibold">{title}</h2>
      {note && <p className="text-13 text-ink-muted mt-0.5">{note}</p>}
    </header>
  );
}

// --- step 1 -----------------------------------------------------------------

function EntityStep({ chosen, onChoose }) {
  return (
    <>
      <StepHead title="What kind of entity is the client?" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ENTITY_CONFIGS.map((entity) => {
          const picked = entity.key === chosen;
          return (
            <button
              key={entity.key}
              type="button"
              aria-pressed={picked}
              onClick={() => onChoose(entity.key)}
              className={`rounded-ledger lift border p-3 text-left ${
                picked
                  ? "border-carbon bg-carbon-wash"
                  : "border-rule bg-paper hover:border-carbon"
              }`}
            >
              <span className="text-14 block font-semibold">
                {entity.label}
              </span>
              <span className="text-12 text-ink-muted mt-1 block">
                PAN 4th character: {panCharLabel(entity.panChar)} ·{" "}
                {entity.documents.length} documents
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-13 text-ink-muted mt-4">
        The entity type decides the documents, master fields, registrations to
        check, suggested services and the drafts in the engagement pack.
      </p>
    </>
  );
}

// --- step 2 -----------------------------------------------------------------

function MasterStep({
  entity,
  values,
  set,
  branches,
  partners,
  checks,
  onBlurCheck,
}) {
  return (
    <>
      <StepHead
        title={`Client master — ${entity.label}`}
        note={`Common fields first, then fields that apply only to ${article(entity.label)}. Checks run as you type.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMMON_FIELDS.map((field) => (
          <Field
            key={field.name}
            {...field}
            value={values[field.name]}
            onChange={(v) => set(field.name, v)}
            onBlur={onBlurCheck}
          />
        ))}
        <Picker
          label="Branch"
          required
          value={values.branchId}
          onChange={(v) => set("branchId", v)}
          options={branches.map((b) => ({
            value: b.id,
            label: `${b.code} — ${b.name}`,
          }))}
        />
        <Picker
          label="Client partner"
          value={values.clientPartnerId}
          onChange={(v) => set("clientPartnerId", v)}
          options={partners.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>

      <h3 className="text-12 text-ink-muted mt-6 mb-3 font-semibold tracking-wide uppercase">
        {entity.label} details
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entity.fields.map((field) => (
          <Field
            key={field.name}
            {...field}
            value={values[field.name]}
            onChange={(v) => set(field.name, v)}
            onBlur={onBlurCheck}
          />
        ))}
      </div>

      <div className="border-rule mt-6 border-t pt-4">
        <CheckList checks={checks} />
      </div>
    </>
  );
}

/** "a private limited company" / "an LLP" — read aloud, it matters. */
function article(label) {
  return /^[AEIOU]/i.test(label) ? `an ${label}` : `a ${label}`;
}

// --- step 3 -----------------------------------------------------------------

function DocumentsStep({ entity, received, setReceived }) {
  const toggle = (name) =>
    setReceived(
      received.includes(name)
        ? received.filter((n) => n !== name)
        : [...received, name],
    );

  return (
    <>
      <StepHead
        title={`Documents to collect — ${entity.label}`}
        note="Tick what is already in hand. Everything left unticked goes to the client as one upload link when you create them."
      />
      <ul className="border-rule divide-rule divide-y rounded border">
        {entity.documents.map((name) => (
          <li key={name}>
            <label className="hover:bg-carbon-wash flex cursor-pointer items-center gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                checked={received.includes(name)}
                onChange={() => toggle(name)}
              />
              <span className="text-14">{name}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="rounded-ledger border-rule bg-sunk text-13 mt-3 border px-3 py-2">
        <span className="text-ink-muted">
          Registrations to check for this entity:{" "}
        </span>
        {entity.registrations.join(" · ")}
      </p>
    </>
  );
}

// --- step 4 -----------------------------------------------------------------

function ServicesStep({ services, fees, setFees }) {
  const patch = (code, change) =>
    setFees((previous) => ({
      ...previous,
      [code]: { ...previous[code], ...change },
    }));

  const total = services.reduce((sum, service) => {
    const row = fees[service.code];
    if (!row?.on) return sum;
    const rupees = Number(String(row.fee ?? "").replace(/[₹,\s]/g, ""));
    return Number.isFinite(rupees) ? sum + rupees : sum;
  }, 0);

  return (
    <>
      <StepHead
        title="Services and fees"
        note="Tick what you will do and type the agreed fee. The billing basis is how often you bill — it can differ from how often the return is filed, for example a monthly GST return billed quarterly. The fee and basis become this client's defaults."
      />

      <div className="hidden grid-cols-[1.2rem_1fr_7rem_9rem_10rem] gap-3 px-2 pb-2 md:grid">
        {["", "Service", "Fee (₹)", "Billing basis", "GST"].map((head, i) => (
          <span
            key={i}
            className="text-12 text-ink-muted font-semibold tracking-wide uppercase"
          >
            {head}
          </span>
        ))}
      </div>

      <ul className="divide-rule border-rule divide-y rounded border">
        {services.map((service) => {
          const row = fees[service.code] ?? {};
          return (
            <li
              key={service.code}
              className="grid grid-cols-1 gap-2 p-2 md:grid-cols-[1.2rem_1fr_7rem_9rem_10rem] md:items-center md:gap-3"
            >
              <label className="flex items-center gap-3 md:contents">
                <input
                  type="checkbox"
                  checked={Boolean(row.on)}
                  onChange={(e) =>
                    patch(service.code, { on: e.target.checked })
                  }
                />
                <span className="text-14">
                  {service.name}
                  <span className="text-12 text-ink-muted block">
                    {service.recurrence === "one-time"
                      ? "as needed"
                      : `filed ${service.recurrence}`}
                  </span>
                </span>
              </label>
              {/* on a phone the three controls share one row; on a laptop
                  they are three columns of the table above */}
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 md:contents">
                <input
                  value={row.fee ?? ""}
                  onChange={(e) => patch(service.code, { fee: e.target.value })}
                  inputMode="decimal"
                  placeholder="Quote"
                  aria-label={`Fee for ${service.name}`}
                  className="rounded-control border-rule bg-paper text-14 h-9 min-w-0 border px-2 text-right font-mono"
                />
                <select
                  value={row.billingBasis ?? "per engagement"}
                  onChange={(e) =>
                    patch(service.code, { billingBasis: e.target.value })
                  }
                  aria-label={`Billing basis for ${service.name}`}
                  className="rounded-control border-rule bg-paper text-14 h-9 min-w-0 border px-2"
                >
                  {BASES.map((basis) => (
                    <option key={basis}>{basis}</option>
                  ))}
                </select>
                <select
                  value={row.gstTreatment ?? "plus GST"}
                  onChange={(e) =>
                    patch(service.code, { gstTreatment: e.target.value })
                  }
                  aria-label={`GST treatment for ${service.name}`}
                  className="rounded-control border-rule bg-paper text-14 h-9 min-w-0 border px-2"
                >
                  {GST_TREATMENTS.map((treatment) => (
                    <option key={treatment}>{treatment}</option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-13 text-ink-muted mt-3">
        Fees come from the catalog in Settings → Services, where most are still
        to be set. The figures typed here are this client's agreed fees, in
        rupees
        {total > 0 && <> — {formatPaise(Math.round(total * 100))} in all</>}.
      </p>
    </>
  );
}

// --- step 5 -----------------------------------------------------------------

function ChecksStep({
  checks,
  lookups,
  groups,
  setGroups,
  groupId,
  setGroupId,
  newGroup,
  setNewGroup,
  addToSuggested,
  setAddToSuggested,
  onRefresh,
  setMessage,
}) {
  const [pending, startTransition] = useTransition();
  const suggested = lookups?.group?.suggestGroupName;

  function makeGroup() {
    startTransition(async () => {
      const result = await createGroup(newGroup);
      if (result.error) {
        setMessage(result);
        return;
      }
      setGroups(
        [...groups, { id: result.id, name: newGroup.trim() }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setGroupId(result.id);
      setNewGroup("");
      onRefresh();
    });
  }

  return (
    <>
      <StepHead title="Checks before accepting" />
      <CheckList checks={checks} />

      <div className="border-rule mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Group this client belongs to
            <span className="text-redpen"> *</span>
          </span>
          <select
            name="groupId"
            required
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setAddToSuggested(false);
            }}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— choose a group —</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {suggested && !groupId && (
            <label className="text-13 mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={addToSuggested}
                onChange={(e) => setAddToSuggested(e.target.checked)}
              />
              Add to <strong>{suggested}</strong>
            </label>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            …or start a new group
          </span>
          <span className="flex gap-2">
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Sharma family"
              className="rounded-control border-rule bg-paper text-14 h-10 min-w-0 flex-1 border px-3"
            />
            <button
              type="button"
              onClick={makeGroup}
              disabled={pending || newGroup.trim().length < 2}
              className="rounded-control border-rule text-13 hover:bg-carbon-wash h-10 shrink-0 border px-3 disabled:opacity-50"
            >
              Add
            </button>
          </span>
        </label>
      </div>
    </>
  );
}

function CheckList({ checks }) {
  if (!checks.length) return null;
  return (
    <ul className="divide-rule divide-y">
      {checks.map((check) => (
        <li
          key={check.key}
          className="grid grid-cols-[1.25rem_minmax(8rem,14rem)_1fr] items-start gap-3 py-2"
        >
          <Mark state={check.state} />
          <span className="text-14 font-medium">{check.label}</span>
          <span
            className={`text-13 ${
              check.state === "bad"
                ? "text-redpen"
                : check.state === "warn"
                  ? "text-waiting"
                  : "text-ink-muted"
            }`}
          >
            {check.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Mark({ state }) {
  const look = {
    ok: { glyph: "✓", className: "text-filed", label: "Passed" },
    warn: { glyph: "!", className: "text-waiting", label: "Worth a look" },
    bad: { glyph: "✕", className: "text-redpen", label: "Problem" },
    idle: { glyph: "·", className: "text-ink-muted", label: "Not checked yet" },
  }[state];
  return (
    <span
      className={`text-14 leading-6 font-semibold ${look.className}`}
      title={look.label}
    >
      <span aria-hidden="true">{look.glyph}</span>
      <span className="sr-only">{look.label}</span>
    </span>
  );
}

// --- step 6 -----------------------------------------------------------------

function PackStep({ entity, packCodes, onOpen, preview, onClose }) {
  return (
    <>
      <StepHead
        title="Engagement pack — drafted automatically"
        note="Filled from the master you entered. Open any draft to read it; they are generated against the client once it exists."
      />
      <ul className="divide-rule border-rule divide-y rounded border">
        {entity.pack.map((item) => {
          const exists = packCodes.includes(item.code);
          return (
            <li
              key={item.code}
              className="flex flex-wrap items-center gap-3 px-3 py-2.5"
            >
              <span
                className={`text-12 rounded-control px-2 py-0.5 font-medium ${
                  item.kind === "Audit"
                    ? "bg-waiting-wash text-waiting"
                    : "bg-carbon-wash text-carbon"
                }`}
              >
                {item.kind}
              </span>
              <span className="text-14 flex-1">{item.label}</span>
              {exists ? (
                <button
                  type="button"
                  onClick={() => onOpen(item.code)}
                  className="rounded-control border-rule text-13 hover:bg-carbon-wash h-8 border px-3"
                >
                  Open draft
                </button>
              ) : (
                <span className="text-12 text-ink-muted">
                  No wording yet — add it in Settings → Documents
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {preview && (
        <div className="rounded-ledger border-rule bg-paper mt-4 border p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-display text-16 font-semibold">
              {preview.loading ? "Opening…" : (preview.title ?? "Draft")}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border-rule text-13 h-8 border px-3"
            >
              Close
            </button>
          </div>
          {preview.error ? (
            <p className="text-13 text-waiting">{preview.error}</p>
          ) : (
            <>
              {preview.verified === false && (
                <p className="text-12 text-waiting mb-2">
                  This wording has not been approved by a partner yet, so it can
                  only ever produce a draft.
                </p>
              )}
              <pre className="text-13 max-h-80 overflow-auto font-sans whitespace-pre-wrap">
                {preview.text}
              </pre>
              {preview.gaps?.length > 0 && (
                <p className="text-12 text-ink-muted mt-2">
                  Still blank: {preview.gaps.join(", ")}.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

// --- step 7 -----------------------------------------------------------------

function CreateStep({
  entity,
  values,
  services,
  fees,
  received,
  checks,
  groups,
  groupId,
  confirmDuplicates,
  setConfirmDuplicates,
  blocking,
}) {
  const ticked = services.filter((service) => fees[service.code]?.on);
  const outstanding = entity.documents.filter((d) => !received.includes(d));
  const group = groups.find((g) => g.id === groupId);
  // the duplicate has its own block below, with the tick that overrides it
  const problems = checks.filter(
    (check) => check.state === "bad" && check.key !== "duplicate",
  );

  return (
    <>
      <StepHead
        title="Ready to create"
        note="Nothing has been written yet. This is everything the six steps collected."
      />

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Summary label="Entity type" value={entity.label} />
        <Summary label="Legal name" value={values.legalName} />
        <Summary label="PAN" value={values.pan} mono />
        <Summary label="GSTIN" value={values["gstins.0.gstin"]} mono />
        <Summary label="Contact" value={values["contacts.0.name"]} />
        <Summary label="Group" value={group?.name ?? "— none —"} />
        <Summary
          label="Services"
          value={
            ticked.length
              ? ticked.map((service) => service.name).join(", ")
              : "None ticked"
          }
        />
        <Summary
          label="Documents"
          value={`${received.length} in hand, ${outstanding.length} to ask for`}
        />
      </dl>

      {outstanding.length > 0 && (
        <p className="rounded-ledger border-rule bg-sunk text-13 mt-4 border px-3 py-2">
          Creating this client also makes one upload link for the{" "}
          {outstanding.length} outstanding{" "}
          {outstanding.length === 1 ? "document" : "documents"}. The link is
          shown once, here, for you to send.
        </p>
      )}

      {problems.length > 0 && (
        <div className="rounded-ledger border-redpen bg-redpen-wash mt-4 border p-3">
          <p className="text-14 text-redpen font-medium">
            {problems.length === 1 ? "A check has" : "Checks have"} not passed
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {problems.map((problem) => (
              <li key={problem.key} className="text-13 text-redpen">
                {problem.label}: {problem.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocking.length > 0 && (
        <div className="rounded-ledger border-redpen bg-redpen-wash mt-4 border p-3">
          <p className="text-14 text-redpen font-medium">
            This looks like an existing client
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {blocking.map((line) => (
              <li key={line} className="text-13 text-redpen">
                {line}
              </li>
            ))}
          </ul>
          <label className="text-13 mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={confirmDuplicates}
              onChange={(e) => setConfirmDuplicates(e.target.checked)}
            />
            Create anyway — I have checked and these are different clients
          </label>
        </div>
      )}

      <p className="text-13 text-ink-muted mt-4">
        The client starts as a <strong>Lead</strong>. Activate it once the
        engagement letter is signed.
      </p>
    </>
  );
}

function Summary({ label, value, mono }) {
  return (
    <div>
      <dt className="text-12 text-ink-muted font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className={`text-14 ${mono ? "font-mono" : ""}`}>
        {String(value ?? "").trim() || "—"}
      </dd>
    </div>
  );
}

function Done({ created, router, onAnother }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-20 font-semibold">{created.ok}</h2>
        <p className="text-13 text-ink-muted mt-1">
          {created.services} {created.services === 1 ? "service" : "services"}{" "}
          subscribed
          {created.outstanding > 0
            ? `, ${created.outstanding} documents asked for`
            : ", nothing outstanding"}
          .
        </p>
      </div>

      {created.error && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 text-waiting border px-3 py-2">
          {created.error}
        </p>
      )}

      {created.link && (
        <div className="rounded-ledger border-rule bg-sunk border p-3">
          <p className="text-13 text-ink-muted">
            The client's upload link, good for {created.requestDays} days. It is
            shown once — copy it now.
          </p>
          <code className="text-13 mt-1 block break-all">{created.link}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(created.link)}
            className="rounded-control border-rule bg-surface text-13 mt-2 h-8 border px-3"
          >
            Copy link
          </button>
        </div>
      )}

      {created.warnings?.length > 0 && (
        <ul className="flex flex-col gap-1">
          {created.warnings.map((warning) => (
            <li key={warning.message} className="text-13 text-waiting">
              {warning.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => router.push(`/clients/${created.id}`)}
          className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium"
        >
          Open the client
        </button>
        <button
          type="button"
          onClick={onAnother}
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-10 border px-4"
        >
          Onboard another
        </button>
      </div>
    </div>
  );
}

// --- the two inputs the whole wizard is built from --------------------------

function Field({
  label,
  name,
  value,
  onChange,
  onBlur,
  type = "text",
  options,
  placeholder,
  mono,
  required,
}) {
  if (type === "select") {
    return (
      <Picker
        label={label}
        value={value}
        onChange={onChange}
        options={(options ?? []).map((o) => ({ value: o, label: o }))}
      />
    );
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">
        {label}
        {required && <span className="text-redpen"> *</span>}
      </span>
      <input
        type={type}
        name={name}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(mono ? e.target.value.toUpperCase() : e.target.value)
        }
        onBlur={onBlur}
        className={`rounded-control border-rule bg-paper text-14 text-ink h-10 border px-3 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}

function Picker({ label, value, onChange, options, required }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">
        {label}
        {required && <span className="text-redpen"> *</span>}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
      >
        <option value="">— choose —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
