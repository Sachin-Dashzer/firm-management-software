"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createCertificate } from "../actions";

/**
 * Starting a draft (P3-15).
 *
 * The level of assurance is a radio rather than a dropdown because it is
 * not a preference: the two choices are different documents, and the
 * sentence under each says how. Picking one from a collapsed list is how a
 * limited engagement goes out reading like an audit.
 */
export default function NewCertificate({ clients, client, types, levels }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createCertificate, null);
  const [type, setType] = useState("");

  const chosen = types.find((row) => row.key === type);

  if (state?.id) router.push(`/practice/certificates/${state.id}`);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {state.error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client">
          <select
            name="clientId"
            required
            defaultValue={client}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— choose —</option>
            {clients.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="What kind of certificate">
          <select
            name="type"
            required
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— choose —</option>
            {types.map((row) => (
              <option key={row.key} value={row.key}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Addressed to"
          hint="The bank, the consulate, the tendering body. Never unaddressed"
        >
          <input
            name="addressee"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </Field>

        <Field label="What it is for" hint="Why the client has asked for it">
          <input
            name="purpose"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </Field>

        <Field label="As at" hint="The date the figures are stated at">
          <input
            type="date"
            name="asOn"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </Field>
      </div>

      {chosen && (
        <p className="rounded-ledger border-rule bg-sunk text-13 border px-3 py-2">
          <strong>{chosen.name}</strong> — {chosen.use}. The file will need{" "}
          {chosen.evidence} pieces of evidence, listed on the draft; each one is
          either held or marked not applicable with a reason before it can be
          signed.
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-13 mb-1 font-medium">Level of assurance</legend>
        {levels.map((row, index) => (
          <label
            key={row.level}
            className="rounded-ledger border-rule bg-surface flex gap-3 border px-3 py-2"
          >
            <input
              type="radio"
              name="level"
              value={row.level}
              defaultChecked={index === 0}
              className="mt-1"
            />
            <span>
              <span className="text-14 block font-medium">{row.level}</span>
              <span className="text-13 text-ink-muted block">{row.note}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
        >
          Start the draft
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 font-medium">{label}</span>
      {children}
      {hint && <span className="text-12 text-ink-muted">{hint}</span>}
    </label>
  );
}
