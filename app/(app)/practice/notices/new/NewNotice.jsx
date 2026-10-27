"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createNotice } from "../actions";

/**
 * The form for a notice that has arrived (P3-11).
 *
 * The one piece of cleverness is deliberate: picking a GST section that
 * counts from the annual return's due date asks for that date, and nothing
 * else does. A field that is only sometimes relevant should only sometimes
 * be on screen, and the reason it appeared is written beside it.
 */
export default function NewNotice({ clients, people, kinds, client }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createNotice, null);
  const [kind, setKind] = useState("");

  const chosen = kinds.find((row) => row.key === kind);

  if (state?.id) router.push(`/practice/notices/${state.id}`);

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

        <Field label="What kind of notice">
          <select
            name="kind"
            required
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— choose —</option>
            {kinds.map((row) => (
              <option key={row.key} value={row.key}>
                {row.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Section as written on it"
          hint="What staff will search for"
        >
          <input
            name="section"
            placeholder="s.148A show cause"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </Field>

        <Field label="Year" hint="The department's own words">
          <input
            name="period"
            placeholder="AY 2019-20"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </Field>

        <Field
          label="Document number (DIN / reference)"
          hint="Two matters with one number means it has been entered twice"
        >
          <input
            name="din"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2 font-mono"
          />
        </Field>

        <Field label="Authority">
          <input
            name="authority"
            placeholder="Faceless — NaFAC"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </Field>

        <Field label="Date on the notice">
          <input
            type="date"
            name="noticeDate"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </Field>

        <Field label="Date served">
          <input
            type="date"
            name="servedOn"
            required
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </Field>

        {chosen?.needsAnnualReturn && (
          <Field
            label="Annual return's due date for that year"
            hint="This kind of notice has limits that count from that date, not from the notice"
          >
            <input
              type="date"
              name="annualReturnDue"
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            />
          </Field>
        )}

        <Field label="Amount at stake" hint="Whole rupees">
          <input
            name="stake"
            inputMode="numeric"
            className="rounded-control border-rule bg-paper num text-14 h-10 border px-2"
          />
        </Field>

        <Field label="Risk">
          <select
            name="risk"
            defaultValue=""
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— not set —</option>
            {["Low", "Medium", "High"].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Who is working it">
          <select
            name="assigneeId"
            defaultValue=""
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— nobody yet —</option>
            {people.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Partner on it">
          <select
            name="partnerId"
            defaultValue=""
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— nobody yet —</option>
            {people
              .filter((row) => row.role === "partner" || row.role === "ca")
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <Field
        label="What it is about"
        hint="In the department's terms; the client's version comes later"
      >
        <textarea
          name="issue"
          rows={3}
          className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
        />
      </Field>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
        >
          Open the matter
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
