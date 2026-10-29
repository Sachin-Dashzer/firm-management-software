"use client";

import { useState, useTransition } from "react";
import {
  FIRM_CONSTITUTIONS,
  CPE_YEAR_BASES,
  CPE_BASIS_LABELS,
} from "@/lib/firm/profile";
import { saveFirm } from "./actions";

/**
 * The firm's own record.
 *
 * Read-only for everybody but a Partner, and read-only means **shown, not
 * hidden**: anybody may need the FRN to put on a form, and a screen that
 * keeps it from them would send them to ask somebody who is in a meeting.
 */
export default function FirmForm({ firm, mayEdit }) {
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  if (!mayEdit) {
    return (
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <h2 className="font-display text-15 font-semibold">{firm.name}</h2>
        <dl className="text-14 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Fact label="Also known as" value={firm.tagline} />
          <Fact label="Firm registration no." value={firm.frn} mono />
          <Fact label="Constitution" value={firm.constitution} />
          <Fact label="PAN" value={firm.pan} mono />
          <Fact label="Head office" value={firm.headOffice} />
          <Fact
            label="Peer review valid till"
            value={firm.peerReviewValidTill}
            mono
          />
          <Fact
            label="CPE year"
            value={CPE_BASIS_LABELS[firm.cpeYearBasis] ?? firm.cpeYearBasis}
          />
          <Fact label="Documents kept" value={`${firm.retentionYears} years`} />
        </dl>
        {firm.icaiNotes && (
          <div>
            <h3 className="text-12 text-ink-muted font-medium">
              The firm&rsquo;s notes
            </h3>
            <p className="text-14 whitespace-pre-wrap">{firm.icaiNotes}</p>
          </div>
        )}
        <p className="text-13 text-ink-muted">
          Only a partner can change any of this — the name here is the name on
          every invoice the firm issues.
        </p>
      </section>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => setMessage(await saveFirm(null, formData)))
      }
      className="flex flex-col gap-6"
    >
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      <section className="rounded-ledger border-rule bg-surface grid gap-4 border p-4 sm:grid-cols-2">
        <h2 className="font-display text-15 font-semibold sm:col-span-2">
          The firm, as a client sees it
        </h2>
        <p className="text-13 text-ink-muted sm:col-span-2">
          This is what goes on invoices, reports and the signature of every
          email the system sends.
        </p>

        <Field label="Name" name="name" defaultValue={firm.name} required />
        <Field
          label="Line underneath"
          name="tagline"
          defaultValue={firm.tagline}
          hint="e.g. Chartered Accountants"
        />
        <Field
          label="PAN"
          name="pan"
          defaultValue={firm.pan}
          inputClassName="font-mono uppercase"
          hint="The firm's own PAN, not a client's"
        />
        <Field label="Phone" name="phone" defaultValue={firm.phone} />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={firm.email}
        />
        <Field
          label="Head office address"
          name="headOffice"
          defaultValue={firm.headOffice}
          className="sm:col-span-2"
        />
      </section>

      <section className="rounded-ledger border-rule bg-surface grid gap-4 border p-4 sm:grid-cols-2">
        <h2 className="font-display text-15 font-semibold sm:col-span-2">
          ICAI and professional obligations
        </h2>

        <Field
          label="Firm registration number (FRN)"
          name="frn"
          defaultValue={firm.frn}
          inputClassName="font-mono uppercase"
          hint="Six digits, sometimes with a letter"
        />
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Constitution
          </span>
          <select
            name="constitution"
            defaultValue={firm.constitution}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            {FIRM_CONSTITUTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Peer review certificate valid till"
          name="peerReviewValidTill"
          type="date"
          defaultValue={firm.peerReviewValidTill}
        />
        <Field
          label="Working papers kept (years)"
          name="retentionYears"
          type="number"
          min={1}
          max={25}
          defaultValue={firm.retentionYears}
          hint="Spec section 6 default is 8"
        />

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-13 text-ink-muted font-medium">
            The firm&rsquo;s notes on its obligations
          </span>
          <textarea
            name="icaiNotes"
            rows={6}
            defaultValue={firm.icaiNotes}
            placeholder="Confidentiality, working papers and retention, UDIN practice, the advertising rules — whatever your reviewer will ask to see."
            className="rounded-ledger border-rule bg-paper text-14 border px-2 py-2"
          />
          <span className="text-12 text-ink-muted">
            Read by a person, not by the system. Nothing here is enforced.
          </span>
        </label>
      </section>

      <section className="rounded-ledger border-rule bg-surface grid gap-4 border p-4 sm:grid-cols-2">
        <h2 className="font-display text-15 font-semibold sm:col-span-2">
          CPE hours expected in a year
        </h2>
        <p className="text-13 text-ink-muted sm:col-span-2">
          <strong>Your figures, not ours.</strong> The ICAI&rsquo;s requirements
          change and depend on whether a member holds a Certificate of Practice
          and on their age, so the system does not assume them. Leave a figure
          at zero and the log simply totals the hours without judging them.
        </p>

        <Field
          label="Structured hours a year"
          name="cpeTargetStructured"
          type="number"
          min={0}
          max={200}
          step="0.5"
          defaultValue={firm.cpeTargetStructured}
        />
        <Field
          label="Unstructured hours a year"
          name="cpeTargetUnstructured"
          type="number"
          min={0}
          max={200}
          step="0.5"
          defaultValue={firm.cpeTargetUnstructured}
        />
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            A CPE year runs
          </span>
          <select
            name="cpeYearBasis"
            defaultValue={firm.cpeYearBasis}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            {CPE_YEAR_BASES.map((basis) => (
              <option key={basis} value={basis}>
                {CPE_BASIS_LABELS[basis]}
              </option>
            ))}
          </select>
          <span className="text-12 text-ink-muted">
            The rest of the app runs April to March, but a CPE block is the
            ICAI&rsquo;s year, not the tax year — set whichever yours follows.
          </span>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save the firm's record"}
        </button>
      </div>
    </form>
  );
}

function Fact({ label, value, mono }) {
  return (
    <div className="flex flex-col">
      <dt className="text-12 text-ink-muted">
        {label}
      </dt>
      <dd className={mono ? "font-mono" : ""}>
        {value || <span className="text-ink-muted">not set</span>}
      </dd>
    </div>
  );
}

function Field({
  label,
  name,
  hint,
  className = "",
  inputClassName = "",
  ...rest
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        name={name}
        {...rest}
        className={`rounded-control border-rule bg-paper text-14 h-10 border px-2 ${inputClassName}`}
      />
      {hint && <span className="text-12 text-ink-muted">{hint}</span>}
    </label>
  );
}
