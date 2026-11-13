"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "@phosphor-icons/react";
import {
  ENTITY_CONFIGS,
  ENTITY_BY_KEY,
  panCharLabel,
} from "@/lib/clients/entityTypes";
import { onboardingChecks, checksPass } from "@/lib/clients/checks";
import { feeToPaise, quotation } from "@/lib/clients/quotation";
import { formatPaise } from "@/lib/money";
import { withArticle } from "@/lib/words";
import { PAN_CHAR_FOR_ENTITY } from "@/lib/validators";
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
/**
 * A sample PAN of the right kind for this entity (QA 09-11-2026, #30).
 *
 * The placeholder was a company PAN for everybody, so an Individual was
 * shown "AAACZ1234C" and the checks then refused the C they had copied
 * the shape of.
 */
function panPlaceholder(entityType) {
  const char = (PAN_CHAR_FOR_ENTITY[entityType] ?? "C")[0];
  return `AAA${char}Z1234C`;
}

const COMMON_FIELDS = [
  { name: "legalName", label: "Legal name", required: true },
  { name: "tradeName", label: "Trade name" },
  /* the placeholder follows the entity: an Individual holds a P PAN, not
     a company's C PAN (QA 09-11-2026, #30) */
  { name: "pan", label: "PAN", mono: true, placeholder: "panForEntity" },
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
 *
 * ## The two lists are the firm's, not ours (04-11-2026)
 *
 * The document list and the engagement pack were read straight out of
 * `entityTypes.js` and drawn as fact. That file says of itself that it is a
 * first draft nobody has certified — and the person onboarding a real client
 * is the one who knows that this company's auditor has already been
 * communicated with, or that this individual has no bank account in his own
 * name yet. Both lists are now seeded from the entity type and then owned by
 * the person on the screen: rows come off, rows go on.
 *
 * The documents list is the one that has teeth. What is left unticked on it
 * becomes the upload link the client receives, so the server takes the
 * edited list rather than the entity's — see `createFromOnboarding`.
 */
export default function Onboarding({
  branches,
  partners,
  groups: knownGroups,
  services,
  packTemplates = [],
  draft = null,
  lead = null,
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [groups, setGroups] = useState(knownGroups);
  const [entityType, setEntityType] = useState("");
  /**
   * Prefilled when somebody pressed Convert on the potential register
   * (04-11-2026). The four fields a conversation has are filled in and
   * everything else is asked as usual — a lead does not know its own
   * entity type, and guessing one would be the worst possible field to
   * get wrong.
   */
  const [values, setValues] = useState(lead?.values ?? {});
  const [carry, setCarry] = useState(lead);
  const [documents, setDocuments] = useState([]);
  const [pack, setPack] = useState([]);
  const [received, setReceived] = useState([]);
  const [fees, setFees] = useState({});
  const [groupId, setGroupId] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [addToSuggested, setAddToSuggested] = useState(false);
  /**
   * Email the client their quotation on the way out (06-11-2026). On by
   * default — the fees were just agreed out loud, and the client should
   * have them in writing the same day — but a tick, because sending it is
   * the firm speaking to a client and that is never done silently.
   */
  const [emailQuotation, setEmailQuotation] = useState(true);
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

  /**
   * Move to a step, remembering how far the person has got — and putting
   * the step in the address bar (QA 09-11-2026, #19).
   *
   * Back used to leave the wizard altogether and take six steps of typing
   * with it, because nothing about the form was in the history. Each step
   * now pushes an entry, so Back walks back through the wizard and
   * Forward walks in again. `window.history` rather than the router on
   * purpose: a router navigation re-renders the page and would throw away
   * the very state this is protecting.
   */
  function go(next) {
    setStep(next);
    setFurthest((far) => Math.max(far, next));
    if (typeof window !== "undefined") {
      window.history.pushState({ phmgStep: next }, "", `?step=${next + 1}`);
    }
  }

  /** Back and Forward move between the steps, not out of the wizard. */
  useEffect(() => {
    const onPop = (event) => {
      const next = event.state?.phmgStep;
      if (typeof next === "number") setStep(next);
    };
    window.addEventListener("popstate", onPop);
    // so the first Back has a step to come back to rather than leaving
    window.history.replaceState({ phmgStep: 0 }, "", window.location.href);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /**
   * Leaving the page another way — a bookmark, a typed URL, the window's
   * own close button — is still a loss, so the browser asks first. Only
   * once anything has been typed: a warning on an untouched form is the
   * kind that teaches people to click through warnings.
   */
  const started = Boolean(entityType) || Object.keys(values).length > 0;
  useEffect(() => {
    if (!started || created) return;
    const warn = (event) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [started, created]);

  /**
   * Picking an entity type re-stocks everything downstream of it. Changing
   * your mind at step 1 should not leave a company's ticked documents
   * sitting on a trust.
   */
  function chooseEntity(key) {
    setEntityType(key);
    setReceived([]);
    setDocuments(ENTITY_BY_KEY[key]?.documents ?? []);
    setPack(ENTITY_BY_KEY[key]?.pack ?? []);
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
            email: values["contacts.0.email"],
            mobile: values["contacts.0.mobile"],
            /* what was typed against each ticked service, so a fee of
               -500 or "abc" is caught here and not at the first invoice
               (#18) */
            fees: services
              .filter((service) => fees[service.code]?.on)
              .map((service) => ({
                name: service.name,
                fee: fees[service.code]?.fee,
              })),
            duplicate: lookups?.duplicate ?? null,
            group: step >= 4 ? (lookups?.group ?? null) : null,
            independence: step >= 4 ? (lookups?.independence ?? null) : null,
          })
        : [],
    [entityType, values, lookups, step, services, fees],
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
  /**
   * The group this client will actually be filed under.
   *
   * Worked out once and used by the gate, the summary and the create call
   * alike. The summary used to read `groupId` on its own, so ticking "add
   * to the suggested group" after a duplicate warning showed Group
   * "— none —" on the last screen while the client was in fact going into
   * that group (QA 09-11-2026, #20).
   */
  const effectiveGroupId = addToSuggested
    ? (lookups?.group?.suggestGroupId ?? groupId)
    : groupId;
  const groupChosen = Boolean(effectiveGroupId);

  /**
   * Why Continue is not available, in words (QA 09-11-2026, #24).
   *
   * A faded button with no explanation is a dead end: the QA run left a
   * client with no name and had nothing on screen to say which field was
   * missing. `null` means the step is finished.
   */
  const blocked = (() => {
    if (step === 0 && !entityType) return "Pick what kind of entity this is.";
    if (step === 1) {
      const missing = [
        String(values.legalName ?? "").trim().length < 3 && "the legal name",
        !String(values["contacts.0.name"] ?? "").trim() && "a contact person",
        !values.branchId && "a branch",
      ].filter(Boolean);
      if (missing.length) {
        return `Still needed: ${missing.join(", ")}.`;
      }
      /* the fees are step 3's business, and the duplicate is a judgement
         somebody makes on the last step */
      const wrong = checks.filter(
        (check) =>
          check.state === "bad" && !["duplicate", "fees"].includes(check.key),
      );
      if (wrong.length) {
        return `${wrong[0].label}: ${wrong[0].detail}`;
      }
    }
    if (step === 3) {
      const fee = checks.find((check) => check.key === "fees");
      if (fee?.state === "bad") return fee.detail;
    }
    if (step === 4 && !groupChosen) {
      return "Every client belongs to a group. Choose one, or make a new one.";
    }
    return null;
  })();

  const canContinue = step < 6 && !blocked;

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
    /* the register row belongs to the client just created, not to the next
       one, so the carry-over goes with the rest of the details */
    setCarry(null);
    setValues({
      branchId: values.branchId,
      clientPartnerId: values.clientPartnerId,
    });
    setEntityType("");
    setReceived([]);
    setDocuments([]);
    setPack([]);
    setFees({});
    setGroupId("");
    setAddToSuggested(false);
    setEmailQuotation(true);
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
        documents,
        received,
        groupId: effectiveGroupId,
        confirmDuplicates,
        emailQuotation,
        /* the letters settled on step 6, by code: the server reads the
           wording from the template, never from here */
        pack: pack.map((item) => item.code),
        services: services
          .filter((service) => fees[service.code]?.on)
          .map((service) => ({ code: service.code, ...fees[service.code] })),
        /* the register row this came from, so it is marked converted and
           linked rather than left looking like an open conversation */
        potentialId: carry?.id,
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

      {carry && !created && (
        <div className="rounded-ledger border-carbon bg-carbon-wash flex flex-col gap-1 border px-3 py-2">
          <p className="text-14">
            Carried over from the potential register:{" "}
            <strong>{carry.name}</strong>. Check the legal name and the contact
            person — the register keeps one name for both — and the row is
            marked converted once this client exists.
          </p>
          {carry.remarks && (
            <p className="text-13 text-ink-muted whitespace-pre-line">
              {carry.remarks}
            </p>
          )}
        </div>
      )}

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
          <Done
            created={created}
            pack={pack}
            router={router}
            onAnother={onboardAnother}
          />
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
                documents={documents}
                setDocuments={setDocuments}
                received={received}
                setReceived={setReceived}
              />
            )}
            {step === 3 && (
              <ServicesStep
                entity={entity}
                services={services}
                fees={fees}
                setFees={setFees}
              />
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
                pack={pack}
                setPack={setPack}
                templates={packTemplates}
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
                documents={documents}
                pack={pack}
                received={received}
                checks={checks}
                groups={groups}
                /* the group it will actually go into, not just the one
                   picked from the list (#20) */
                groupId={effectiveGroupId}
                confirmDuplicates={confirmDuplicates}
                setConfirmDuplicates={setConfirmDuplicates}
                emailQuotation={emailQuotation}
                setEmailQuotation={setEmailQuotation}
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
                <span className="flex flex-wrap items-center justify-end gap-3">
                  {/* what is missing, rather than a faded button (#24) */}
                  {blocked && (
                    <span role="status" className="text-13 text-waiting">
                      {blocked}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => go(step + 1)}
                    disabled={!canContinue}
                    className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-5 font-medium disabled:opacity-40"
                  >
                    Continue
                  </button>
                </span>
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
      {/* a note is read, so it is set to a measure rather than to the
          width of a 1440px panel */}
      {note && (
        <p className="text-13 text-ink-muted mt-0.5 max-w-[78ch]">{note}</p>
      )}
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
        note={`Common fields first, then fields that apply only to ${withArticle(entity.label)}. Checks run as you type.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMMON_FIELDS.map((field) => (
          <Field
            key={field.name}
            {...field}
            placeholder={
              field.placeholder === "panForEntity"
                ? panPlaceholder(entity.key)
                : field.placeholder
            }
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
// --- step 3 -----------------------------------------------------------------

function DocumentsStep({
  entity,
  documents,
  setDocuments,
  received,
  setReceived,
}) {
  const [adding, setAdding] = useState("");

  const toggle = (name) =>
    setReceived(
      received.includes(name)
        ? received.filter((n) => n !== name)
        : [...received, name],
    );

  /** Off the list, and out of what is ticked as received along with it. */
  function remove(name) {
    setDocuments(documents.filter((n) => n !== name));
    setReceived(received.filter((n) => n !== name));
  }

  /**
   * A native form, so Enter adds the row — somebody typing six documents in
   * a row should never have to reach for the mouse between them.
   */
  function add(event) {
    event.preventDefault();
    const name = adding.trim().replace(/\s+/g, " ");
    if (!name) return;
    // the same paper asked for twice is still one paper
    const already = documents.some(
      (row) => row.toLowerCase() === name.toLowerCase(),
    );
    setDocuments(already ? documents : [...documents, name]);
    setAdding("");
  }

  const standard = entity.documents;
  const edited =
    documents.length !== standard.length ||
    documents.some((name, index) => name !== standard[index]);
  const outstanding = documents.filter((name) => !received.includes(name));

  return (
    <>
      <StepHead
        title={`Documents to collect — ${entity.label}`}
        note={`The standard ${entity.label.toLowerCase()} list, yours to correct — take a row off, or add one at the bottom. Tick what is already in hand; the rest goes to the client as one upload link.`}
      />

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-13 text-ink-muted">
          <span className="num text-ink">{documents.length}</span> on the list ·{" "}
          <span className="num text-ink">{received.length}</span> in hand ·{" "}
          <span className="num text-ink">{outstanding.length}</span> to ask for
        </p>
        {edited && (
          <button
            type="button"
            onClick={() => {
              setDocuments(standard);
              setReceived(received.filter((name) => standard.includes(name)));
            }}
            className="text-13 text-ink-muted hover:text-carbon underline underline-offset-4"
          >
            Put the standard list back
          </button>
        )}
      </div>

      <ul className="border-rule divide-rule divide-y rounded border">
        {documents.map((name) => (
          <li
            key={name}
            className="group hover:bg-carbon-wash flex items-center gap-3 px-3 py-2.5"
          >
            <label className="flex flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={received.includes(name)}
                onChange={() => toggle(name)}
              />
              <span className="text-14">{name}</span>
            </label>
            <Remove label={name} onClick={() => remove(name)} />
          </li>
        ))}

        {documents.length === 0 && (
          <li className="text-13 text-ink-muted px-3 py-6 text-center">
            Nothing on the list. No upload link is made for this client.
          </li>
        )}

        <li className="bg-sunk">
          <form onSubmit={add} className="flex items-center gap-2 p-2">
            <input
              value={adding}
              onChange={(event) => setAdding(event.target.value)}
              placeholder="Another paper to ask this client for"
              aria-label="Add a document to the list"
              className="rounded-control border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-3"
            />
            <button
              type="submit"
              disabled={!adding.trim()}
              className="rounded-control border-rule bg-surface text-13 hover:bg-carbon-wash h-9 shrink-0 border px-3 font-medium disabled:opacity-40"
            >
              Add
            </button>
          </form>
        </li>
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

/**
 * What this client is taken on for, and at what fee.
 *
 * It used to be the firm's whole catalogue — fifteen rows, each with a
 * checkbox and three controls, of which two were ticked. It asked somebody
 * to read fifteen fee boxes belonging to work this client will never have,
 * and the two that mattered were lost among them.
 *
 * So the list is **this client's services**: seeded from what the entity
 * type suggests, a row taken off when it does not apply and a row put on
 * from the catalogue underneath. The catalogue has not gone anywhere — it is
 * the picker, where a service is chosen by name rather than hunted for down
 * a column of ticks.
 */
function ServicesStep({ entity, services, fees, setFees }) {
  const [picked, setPicked] = useState("");

  const patch = (code, change) =>
    setFees((previous) => ({
      ...previous,
      [code]: { ...previous[code], ...change },
    }));

  const chosen = services.filter((service) => fees[service.code]?.on);
  const spare = services.filter((service) => !fees[service.code]?.on);
  const suggested = entity.services ?? [];
  const edited =
    chosen.length !== suggested.length ||
    chosen.some((service) => !suggested.includes(service.code));

  /** The catalogue's own shelves, so the picker is not one long list. */
  const shelves = [...new Set(spare.map((service) => service.category || ""))];

  const total = chosen.reduce((sum, service) => {
    const rupees = Number(
      String(fees[service.code]?.fee ?? "").replace(/[₹,\s]/g, ""),
    );
    return Number.isFinite(rupees) ? sum + rupees : sum;
  }, 0);

  function add(event) {
    event.preventDefault();
    if (!picked) return;
    // the fee, basis and GST treatment this code was seeded with are still
    // in `fees`, so putting a row back brings its figures with it
    patch(picked, { on: true });
    setPicked("");
  }

  return (
    <>
      <StepHead
        title="Services and fees"
        note="What the firm is taking this client on for, suggested from the entity type and yours to correct. Type the agreed fee against each. The billing basis is how often you bill — it can differ from how often the return is filed, say a monthly GST return billed quarterly."
      />

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-13 text-ink-muted">
          <span className="num text-ink">{chosen.length}</span>{" "}
          {chosen.length === 1 ? "service" : "services"} of{" "}
          <span className="num">{services.length}</span> in the firm's catalogue
        </p>
        {edited && (
          <button
            type="button"
            onClick={() =>
              setFees((previous) =>
                Object.fromEntries(
                  services.map((service) => [
                    service.code,
                    {
                      ...previous[service.code],
                      on: suggested.includes(service.code),
                    },
                  ]),
                ),
              )
            }
            className="text-13 text-ink-muted hover:text-carbon underline underline-offset-4"
          >
            Put the suggested services back
          </button>
        )}
      </div>

      <div className="hidden grid-cols-[1fr_7rem_9rem_10rem_1.75rem] gap-3 px-2 pb-2 md:grid">
        {["Service", "Fee (₹)", "Billing basis", "GST", ""].map((head, i) => (
          <span
            key={i}
            className="text-12 text-ink-muted font-semibold tracking-wide uppercase"
          >
            {head}
          </span>
        ))}
      </div>

      <ul className="divide-rule border-rule divide-y rounded border">
        {chosen.map((service) => {
          const row = fees[service.code] ?? {};
          return (
            <li
              key={service.code}
              className="group hover:bg-carbon-wash grid grid-cols-1 gap-2 p-2 md:grid-cols-[1fr_7rem_9rem_10rem_1.75rem] md:items-center md:gap-3"
            >
              {/* on a phone the name and its remove share the first line,
                  rather than the remove sitting on a line of its own; on a
                  laptop `contents` hands both to the grid and `order-last`
                  sends the remove to the column after GST */}
              <div className="flex items-start justify-between gap-2 md:contents">
                <span className="text-14">
                  {service.name}
                  <span className="text-12 text-ink-muted block">
                    {service.recurrence === "one-time"
                      ? "as needed"
                      : `filed ${service.recurrence}`}
                  </span>
                </span>
                <span className="md:order-last md:flex md:justify-end">
                  <Remove
                    label={service.name}
                    onClick={() => patch(service.code, { on: false })}
                  />
                </span>
              </div>
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

        {chosen.length === 0 && (
          <li className="text-13 text-ink-muted px-3 py-6 text-center">
            No services yet. A client can be created without any — add them when
            the engagement is agreed.
          </li>
        )}

        <li className="bg-sunk">
          <form onSubmit={add} className="flex items-center gap-2 p-2">
            <select
              value={picked}
              onChange={(event) => setPicked(event.target.value)}
              aria-label="Add a service from the catalogue"
              disabled={spare.length === 0}
              className="rounded-control border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-2 disabled:opacity-60"
            >
              <option value="">
                {spare.length === 0
                  ? "Every service in the catalogue is on this client"
                  : "— another service from the catalogue —"}
              </option>
              {shelves.map((shelf) => (
                <optgroup key={shelf} label={shelf || "Other"}>
                  {spare
                    .filter((service) => (service.category || "") === shelf)
                    .map((service) => (
                      <option key={service.code} value={service.code}>
                        {service.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <button
              type="submit"
              disabled={!picked}
              className="rounded-control border-rule bg-surface text-13 hover:bg-carbon-wash h-9 shrink-0 border px-3 font-medium disabled:opacity-40"
            >
              Add
            </button>
          </form>
        </li>
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

function PackStep({
  entity,
  pack,
  setPack,
  templates,
  onOpen,
  preview,
  onClose,
}) {
  const [picked, setPicked] = useState("");
  const inPack = new Set(pack.map((item) => item.code));
  const byCode = new Map(templates.map((item) => [item.code, item]));

  /** Everything the firm has wording for that is not already in the pack. */
  const spare = templates.filter((item) => !inPack.has(item.code));

  const standard = entity.pack;
  const edited =
    pack.length !== standard.length ||
    pack.some((item, index) => item.code !== standard[index]?.code);

  function addPicked(event) {
    event.preventDefault();
    const template = byCode.get(picked);
    if (!template || inPack.has(template.code)) return;
    setPack([...pack, template]);
    setPicked("");
  }

  return (
    <>
      <StepHead
        title="Engagement pack — drafted automatically"
        note="The letters this client gets, filled from the master you entered. Take off what does not apply and add anything else the firm has wording for. Open any draft to read it; they are generated against the client once it exists."
      />

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-13 text-ink-muted">
          <span className="num text-ink">{pack.length}</span>{" "}
          {pack.length === 1 ? "letter" : "letters"} in the pack
        </p>
        {edited && (
          <button
            type="button"
            onClick={() => setPack(standard)}
            className="text-13 text-ink-muted hover:text-carbon underline underline-offset-4"
          >
            Put the standard pack back
          </button>
        )}
      </div>

      <ul className="divide-rule border-rule divide-y rounded border">
        {pack.map((item) => {
          const exists = byCode.has(item.code);
          return (
            <li
              key={item.code}
              className="group hover:bg-carbon-wash flex flex-wrap items-center gap-3 px-3 py-2.5"
            >
              <span
                className={`text-12 rounded-control px-2 py-0.5 font-medium ${
                  /audit/i.test(item.kind)
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
                  className="rounded-control border-rule text-13 hover:bg-surface h-8 border px-3"
                >
                  Open draft
                </button>
              ) : (
                <span className="text-12 text-ink-muted">
                  No wording yet — add it in Settings → Documents
                </span>
              )}
              <Remove
                label={item.label}
                onClick={() =>
                  setPack(pack.filter((row) => row.code !== item.code))
                }
              />
            </li>
          );
        })}

        {pack.length === 0 && (
          <li className="text-13 text-ink-muted px-3 py-6 text-center">
            No letters in this client's pack.
          </li>
        )}

        <li className="bg-sunk">
          <form onSubmit={addPicked} className="flex items-center gap-2 p-2">
            <select
              value={picked}
              onChange={(event) => setPicked(event.target.value)}
              aria-label="Add a letter to the pack"
              disabled={spare.length === 0}
              className="rounded-control border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-2 disabled:opacity-60"
            >
              <option value="">
                {spare.length === 0
                  ? "Every letter the firm has is in the pack"
                  : "— another letter from the firm's wording —"}
              </option>
              {spare.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.kind} — {item.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!picked}
              className="rounded-control border-rule bg-surface text-13 hover:bg-carbon-wash h-9 shrink-0 border px-3 font-medium disabled:opacity-40"
            >
              Add
            </button>
          </form>
        </li>
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
  documents,
  pack,
  received,
  checks,
  groups,
  groupId,
  confirmDuplicates,
  setConfirmDuplicates,
  emailQuotation,
  setEmailQuotation,
  blocking,
}) {
  const ticked = services.filter((service) => fees[service.code]?.on);
  const outstanding = documents.filter((name) => !received.includes(name));
  /* exactly the lines the email will carry: the same function builds both */
  const quote = quotation(
    ticked.map((service) => ({
      name: service.name,
      feePaise: feeToPaise(fees[service.code]?.fee, service.defaultFeePaise),
      billingBasis: fees[service.code]?.billingBasis,
      gstTreatment: fees[service.code]?.gstTreatment,
    })),
  );
  const quoteEmail = String(values["contacts.0.email"] ?? "").trim();
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
        <Summary
          label="Engagement pack"
          value={
            pack.length
              ? `${pack.length} ${pack.length === 1 ? "letter" : "letters"}, emailed to the client`
              : "No letters"
          }
        />
      </dl>

      {/*
        What the client actually gets, in one box (owner, 12-11-2026).

        It used to be a quotation preview with a switch under it, and
        the pack settled two steps earlier went nowhere — the Done
        screen said the letters were “to issue from the documents
        tab”, which meant somebody wrote them again by hand. One
        email now carries all of it, so one switch decides all of it.
      */}
      {(quote.lines.length > 0 || pack.length > 0) && (
        <div className="rounded-ledger border-rule bg-sunk mt-4 border p-3">
          <p className="text-12 text-ink-muted font-semibold tracking-wide uppercase">
            What goes to the client
          </p>

          {quote.lines.length > 0 && (
            <>
              <ul className="mt-2 flex flex-col gap-1">
                {quote.lines.map((line) => (
                  <li key={line} className="text-13">
                    {line}
                  </li>
                ))}
              </ul>
              {quote.totalLine && (
                <p className="text-13 border-rule mt-2 border-t pt-2 font-medium">
                  {quote.totalLine}
                </p>
              )}
            </>
          )}

          <ul className="text-13 text-ink-muted border-rule mt-3 flex flex-col gap-1 border-t pt-3">
            {quote.lines.length > 0 && <li>The quotation above, as a PDF</li>}
            {pack.map((item) => (
              <li key={item.code}>{item.label}, as a PDF</li>
            ))}
            {outstanding.length > 0 && (
              <li>
                The {outstanding.length}{" "}
                {outstanding.length === 1 ? "document" : "documents"} we still
                need, with the upload link
              </li>
            )}
          </ul>
          <p className="text-12 text-faint mt-1">
            A letter whose wording a partner has not approved yet is left out,
            and you are told which.
          </p>

          <label className="text-13 border-rule mt-3 flex items-start gap-2 border-t pt-3">
            <input
              type="checkbox"
              checked={emailQuotation && Boolean(quoteEmail)}
              disabled={!quoteEmail}
              onChange={(e) => setEmailQuotation(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              {quoteEmail ? (
                <>
                  Email all of this to{" "}
                  <span className="text-ink font-medium">{quoteEmail}</span>{" "}
                  when the client is created
                  <span className="text-ink-muted">
                    {" "}
                    — fees exclusive of GST, holding for 30 days. Nothing is
                    billed by it.
                  </span>
                </>
              ) : (
                <span className="text-ink-muted">
                  No email address for the contact, so nothing can be sent. Add
                  one on step 2 and the pack goes out with the client.
                </span>
              )}
            </span>
          </label>
        </div>
      )}
      {outstanding.length > 0 && (
        <p className="rounded-ledger border-rule bg-sunk text-13 mt-4 border px-3 py-2">
          Creating this client also makes one upload link for the{" "}
          {outstanding.length} outstanding{" "}
          {outstanding.length === 1 ? "document" : "documents"}. It goes in the
          email above, and is shown here once as well, for WhatsApp.
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

function Done({ created, pack, router, onAnother }) {
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
        {created.fromRegister && (
          <p className="text-13 text-ink-muted mt-1">
            {created.fromRegister} is marked converted on the{" "}
            <Link
              href="/potentials"
              className="hover:text-ink underline underline-offset-4"
            >
              potential register
            </Link>
            , and the row now points at this client.
          </p>
        )}
      </div>

      {created.error && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 text-waiting border px-3 py-2">
          {created.error}
        </p>
      )}

      {created.quotedTo?.length > 0 && (
        <div className="rounded-ledger border-rule bg-sunk text-13 border px-3 py-2">
          <p>
            The welcome pack is queued to {created.quotedTo.join(", ")}. It
            leaves with the next mail run.
          </p>
          <ul className="text-ink-muted mt-1 flex flex-col gap-0.5">
            {created.quoteLines > 0 && (
              <li>
                The fees for {created.quoteLines}{" "}
                {created.quoteLines === 1 ? "service" : "services"}
              </li>
            )}
            {created.packNames?.map((name) => (
              <li key={name}>
                {name} <span className="text-faint">PDF</span>
              </li>
            ))}
            {created.outstanding > 0 && (
              <li>
                The {created.outstanding}{" "}
                {created.outstanding === 1 ? "document" : "documents"} we still
                need, with the upload link
              </li>
            )}
          </ul>
        </div>
      )}

      {/*
        A letter that did not go, and why. Silence here would be the
        firm believing it had sent an engagement letter it had not.
      */}
      {created.packSkipped?.length > 0 && (
        <div className="rounded-ledger border-waiting bg-waiting-wash text-13 text-waiting border px-3 py-2">
          <p className="font-medium">
            {created.packSkipped.length === 1
              ? "One letter was not sent:"
              : `${created.packSkipped.length} letters were not sent:`}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {created.packSkipped.map((row) => (
              <li key={row.name}>
                <span className="font-medium">{row.name}</span> — {row.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      {created.quoteError && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 text-waiting border px-3 py-2">
          {created.quoteError}
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

      {/*
        The pack used to be listed again here, as a to-do: “to issue
        from the client's documents tab”. It is sent now, and the
        queued list above says what went and what did not — a second
        list naming a letter that was held back would contradict it.
      */}
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

// --- the controls the editable lists share ----------------------------------

/**
 * Take one row off a list (04-11-2026).
 *
 * Drawn on hover and on focus at desk sizes and always on a touch screen,
 * where there is no hover and a control you cannot reach is not a control
 * (the inbox rows settled this). The reason it hides at all is that these
 * are lists somebody reads down twelve rows of: a column of twelve crosses
 * reads as a warning, and nothing here is wrong.
 */
function Remove({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Take "${label}" off the list`}
      title="Take it off the list"
      className="rounded-control border-rule text-ink-muted hover:text-redpen hover:border-redpen flex h-7 w-7 shrink-0 items-center justify-center border opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
    >
      <X size={14} weight="bold" aria-hidden="true" />
    </button>
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
