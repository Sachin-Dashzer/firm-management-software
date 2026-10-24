"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BILLING_CYCLES,
  CLIENT_STATUSES,
  ENTITY_TYPES,
  RISK_RATINGS,
  TURNOVER_BANDS,
} from "@/lib/validators";
import { createClient, updateClient, checkForDuplicates } from "./actions";

/**
 * The onboarding and edit form (spec section 3).
 *
 * The duplicate check runs when the PAN or a GSTIN loses focus, so a clash is
 * found while the person is still typing rather than after they have filled in
 * two screens. The same check runs again on the server, which is the one that
 * counts.
 */
export default function ClientForm({
  client,
  branches,
  partners,
  groups,
  canEditSensitive,
}) {
  const router = useRouter();
  const editing = Boolean(client);

  const [contacts, setContacts] = useState(
    client?.contacts?.length
      ? client.contacts
      : [{ name: "", designation: "", mobile: "", email: "", primary: true }],
  );
  const [gstins, setGstins] = useState(
    client?.gstins?.length ? client.gstins : [{ gstin: "", qrmp: false }],
  );
  const [duplicates, setDuplicates] = useState({ blocking: [], warnings: [] });
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  /** Ask the server whether anything already uses this PAN, GSTIN or mobile. */
  function runDuplicateCheck(formEl) {
    const data = new FormData(formEl);
    startTransition(async () => {
      const result = await checkForDuplicates({
        id: client?.id,
        pan: data.get("pan"),
        legalName: data.get("legalName"),
        gstins: gstins.map((g) => ({ gstin: g.gstin })),
        contacts: contacts.map((c) => ({ mobile: c.mobile })),
      });
      setDuplicates(result);
    });
  }

  function onSubmit(formData) {
    startTransition(async () => {
      const result = editing
        ? await updateClient(client.id, formData)
        : await createClient(null, formData);

      setMessage(result);
      if (result?.duplicates) {
        setDuplicates({
          blocking: result.duplicates.map((d) => d.message),
          warnings: (result.warnings ?? []).map((d) => d.message),
        });
      }
      if (result?.ok && result.id) router.push(`/clients/${result.id}`);
      if (result?.ok && editing) router.refresh();
    });
  }

  return (
    <form
      action={onSubmit}
      onBlur={(e) => {
        if (["pan", "legalName"].includes(e.target.name)) {
          runDuplicateCheck(e.currentTarget);
        }
      }}
      className="flex flex-col gap-6"
    >
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

      {duplicates.blocking.length > 0 && (
        <div className="rounded-ledger border-redpen bg-redpen-wash border p-3">
          <p className="text-14 text-redpen font-medium">
            This looks like an existing client
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {duplicates.blocking.map((m) => (
              <li key={m} className="text-13 text-redpen">
                {m}
              </li>
            ))}
          </ul>
          <label className="text-13 mt-2 flex items-center gap-2">
            <input type="checkbox" name="confirmDuplicates" value="yes" />
            Save anyway — I have checked and these are different clients
          </label>
        </div>
      )}
      {duplicates.warnings.length > 0 && (
        <div className="rounded-ledger border-waiting bg-waiting-wash border p-3">
          <p className="text-14 text-waiting font-medium">Worth a check</p>
          <ul className="mt-1 flex flex-col gap-1">
            {duplicates.warnings.map((m) => (
              <li key={m} className="text-13 text-waiting">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section title="Identity">
        <Field
          label="Legal name"
          name="legalName"
          required
          defaultValue={client?.legalName}
          className="sm:col-span-2"
        />
        <Field
          label="Trade name"
          name="tradeName"
          defaultValue={client?.tradeName}
        />
        <Select
          label="Entity type"
          name="entityType"
          required
          defaultValue={client?.entityType}
          options={ENTITY_TYPES}
          placeholder="Choose…"
        />
        <Field
          label="Incorporation / birth date"
          name="establishedOn"
          type="date"
          defaultValue={client?.establishedOn}
        />
        <Select
          label="Branch"
          name="branchId"
          required
          defaultValue={client?.branchId}
          options={branches.map((b) => ({
            value: b.id,
            label: `${b.code} — ${b.name}`,
          }))}
          placeholder="Choose…"
        />
      </Section>

      <Section
        title="Statutory identifiers"
        note={
          canEditSensitive
            ? undefined
            : "You can see these but not change them."
        }
      >
        <Field
          label="PAN"
          name="pan"
          defaultValue={client?.pan}
          placeholder="AAAPZ1234C"
          className="font-mono uppercase"
          disabled={!canEditSensitive}
        />
        <Field
          label="TAN"
          name="tan"
          defaultValue={client?.tan}
          placeholder="DELA12345B"
          className="font-mono uppercase"
          disabled={!canEditSensitive}
        />
        <Field
          label="CIN / LLPIN"
          name="cin"
          defaultValue={client?.cin}
          placeholder="U74999DL2019PTC123456"
          className="font-mono uppercase"
          disabled={!canEditSensitive}
        />
        <Field
          label="Udyam number"
          name="udyam"
          defaultValue={client?.udyam}
          placeholder="UDYAM-UP-09-1234567"
          className="font-mono uppercase"
        />
        <Field
          label="IEC"
          name="iec"
          defaultValue={client?.iec}
          className="font-mono uppercase"
        />
        {canEditSensitive && (
          <Field
            label="Aadhaar"
            name="aadhaar"
            inputMode="numeric"
            placeholder={
              client?.aadhaarLast4
                ? `Stored, ending ${client.aadhaarLast4}`
                : "12 digits"
            }
            className="font-mono"
            hint="Stored encrypted; only the last four digits are ever shown."
          />
        )}
      </Section>

      <Rows
        title="GST registrations"
        hint="One per state. The PAN inside each GSTIN must match the client's PAN."
        rows={gstins}
        setRows={setGstins}
        blank={{ gstin: "", qrmp: false }}
        addLabel="Add another state"
        render={(row, i, update) => (
          <>
            <input
              name={`gstins.${i}.gstin`}
              value={row.gstin ?? ""}
              onChange={(e) => update({ gstin: e.target.value.toUpperCase() })}
              onBlur={(e) => runDuplicateCheck(e.currentTarget.form)}
              placeholder="09AAAPZ1234C1ZX"
              className="rounded-ledger border-rule bg-paper text-14 h-9 flex-1 border px-2 font-mono uppercase"
            />
            <label className="text-13 flex items-center gap-2 whitespace-nowrap">
              <input
                type="checkbox"
                name={`gstins.${i}.qrmp`}
                checked={Boolean(row.qrmp)}
                onChange={(e) => update({ qrmp: e.target.checked })}
              />
              QRMP
            </label>
          </>
        )}
      />

      <Rows
        title="Contact persons"
        hint="The first one is the primary contact unless you tick another."
        rows={contacts}
        setRows={setContacts}
        blank={{
          name: "",
          designation: "",
          mobile: "",
          email: "",
          primary: false,
        }}
        addLabel="Add another contact"
        render={(row, i, update) => (
          <>
            <input
              name={`contacts.${i}.name`}
              value={row.name ?? ""}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Name"
              className="rounded-ledger border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-2"
            />
            <input
              name={`contacts.${i}.designation`}
              value={row.designation ?? ""}
              onChange={(e) => update({ designation: e.target.value })}
              placeholder="Designation"
              className="rounded-ledger border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-2"
            />
            <input
              name={`contacts.${i}.mobile`}
              value={row.mobile ?? ""}
              onChange={(e) => update({ mobile: e.target.value })}
              onBlur={(e) => runDuplicateCheck(e.currentTarget.form)}
              placeholder="Mobile"
              inputMode="numeric"
              className="rounded-ledger border-rule bg-paper text-14 h-9 w-32 border px-2 font-mono"
            />
            <input
              name={`contacts.${i}.email`}
              value={row.email ?? ""}
              onChange={(e) => update({ email: e.target.value })}
              placeholder="Email"
              type="email"
              className="rounded-ledger border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-2"
            />
            <label className="text-13 flex items-center gap-1 whitespace-nowrap">
              <input
                type="checkbox"
                name={`contacts.${i}.primary`}
                checked={Boolean(row.primary)}
                onChange={(e) => update({ primary: e.target.checked })}
              />
              Primary
            </label>
          </>
        )}
      />

      <Section title="Firm side and classification">
        <Select
          label="Client partner (CA)"
          name="clientPartnerId"
          defaultValue={client?.clientPartnerId}
          options={partners.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="— none —"
        />
        <Select
          label="Relationship manager"
          name="relationshipManagerId"
          defaultValue={client?.relationshipManagerId}
          options={partners.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="— none —"
        />
        <Select
          label="Group"
          name="groupId"
          defaultValue={client?.groupId}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          placeholder="— none —"
        />
        <Field
          label="Industry"
          name="industry"
          defaultValue={client?.industry}
        />
        <Select
          label="Turnover band"
          name="turnoverBand"
          defaultValue={client?.turnoverBand}
          options={TURNOVER_BANDS}
          placeholder="— not known —"
        />
        <Select
          label="Risk rating"
          name="risk"
          defaultValue={client?.risk ?? "Low"}
          options={RISK_RATINGS}
        />
        <Field
          label="Referral source"
          name="referralSource"
          defaultValue={client?.referralSource}
        />
        <Field
          label="Tags"
          name="tags"
          defaultValue={client?.tags?.join(", ")}
          hint="Comma separated"
        />
      </Section>

      <Section title="Commercials">
        <Select
          label="Billing cycle"
          name="billingCycle"
          defaultValue={client?.billingCycle}
          options={BILLING_CYCLES}
        />
        <Field
          label="Credit period (days)"
          name="creditDays"
          type="number"
          min={0}
          max={365}
          defaultValue={client?.creditDays ?? 15}
        />
        <Field
          label="Invoice email"
          name="invoiceEmail"
          type="email"
          defaultValue={client?.invoiceEmail}
        />
      </Section>

      {!editing && (
        <Section
          title="The proposal"
          note="Captured while the client is still a lead (spec section 3)."
        >
          <Field
            label="Proposed services"
            name="proposedServices"
            className="sm:col-span-2"
            hint="Free text for now; the service catalog arrives in Step 4."
          />
          <Field
            label="Quoted fee (₹)"
            name="quotedAmount"
            inputMode="decimal"
            placeholder="25000"
          />
          <Select
            label="Status"
            name="status"
            defaultValue="Lead"
            options={CLIENT_STATUSES}
          />
        </Section>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-ledger bg-carbon text-14 h-10 px-4 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Create client"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-10 border px-4"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Section({ title, note, children }) {
  return (
    <fieldset className="rounded-ledger border-rule bg-surface border p-4">
      <legend className="font-display text-20 px-1">{title}</legend>
      {note && <p className="text-13 text-ink-muted mb-3">{note}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, hint, className = "", defaultValue, ...rest }) {
  return (
    <label
      className={`flex flex-col gap-1 ${className.includes("col-span") ? className : ""}`}
    >
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        defaultValue={defaultValue ?? ""}
        className={`rounded-ledger border-rule bg-paper text-14 text-ink h-10 border px-3 disabled:opacity-60 ${className}`}
        {...rest}
      />
      {hint && <span className="text-12 text-ink-muted">{hint}</span>}
    </label>
  );
}

function Select({ label, options, placeholder, defaultValue, ...rest }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <select
        defaultValue={defaultValue ?? ""}
        className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) =>
          typeof o === "string" ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
    </label>
  );
}

/** A repeating group of fields with add and remove, used for GSTINs and contacts. */
function Rows({ title, hint, rows, setRows, blank, addLabel, render }) {
  return (
    <fieldset className="rounded-ledger border-rule bg-surface border p-4">
      <legend className="font-display text-20 px-1">{title}</legend>
      {hint && <p className="text-13 text-ink-muted mb-3">{hint}</p>}
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            {render(row, i, (patch) =>
              setRows(rows.map((r, j) => (i === j ? { ...r, ...patch } : r))),
            )}
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                aria-label={`Remove row ${i + 1}`}
                className="rounded-ledger border-rule text-13 hover:bg-redpen-wash hover:text-redpen h-9 border px-2"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows([...rows, { ...blank }])}
        className="rounded-ledger border-rule text-13 hover:bg-carbon-wash mt-3 h-9 border px-3"
      >
        {addLabel}
      </button>
    </fieldset>
  );
}
