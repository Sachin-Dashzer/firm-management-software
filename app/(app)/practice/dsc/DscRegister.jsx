"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DSC_CLASSES,
  DSC_HOLDERS,
  DSC_HOLDER_LABELS,
} from "@/lib/practice/dsc";
import { addDsc, removeDsc, updateDsc } from "./actions";

/**
 * The DSC register.
 *
 * One table, sorted by what expires first, with the rows that need attention
 * coloured — not a dashboard. The number at the top is the one worth knowing
 * and it is a link, because a count you cannot open is a nag.
 */

const TONE = {
  expired: "text-redpen font-medium",
  today: "text-redpen font-medium",
  soon: "text-waiting",
  valid: "text-ink-muted",
  unknown: "text-ink-muted",
};

export default function DscRegister({
  rows,
  total,
  expiring,
  expired,
  soonOnly,
  onlyClient = "",
  mayEdit,
  clients,
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(work) {
    startTransition(async () => {
      const result = await work();
      setMessage(result);
      if (result?.ok) {
        setAdding(false);
        setEditing(null);
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-28 font-semibold">DSC register</h1>
          <p className="text-13 text-ink-muted">
            Whose digital signature certificate expires when. The firm does not
            hold clients&rsquo; tokens — this is the date, so nobody is caught
            out mid-filing.
          </p>
        </div>
        {mayEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
          >
            {adding ? "Cancel" : "Add a certificate"}
          </button>
        )}
      </div>

      <div className="text-14 flex flex-wrap gap-4">
        <Link
          href={
            onlyClient
              ? `/practice/dsc?soon=1&client=${onlyClient}`
              : "/practice/dsc?soon=1"
          }
          aria-current={soonOnly ? "page" : undefined}
          className={`rounded-ledger border px-3 py-1 ${
            soonOnly ? "border-carbon bg-carbon-wash" : "border-rule"
          }`}
        >
          <span className="num font-medium">{expiring}</span> expiring within 30
          days
          {expired > 0 && (
            <span className="text-redpen">
              {" · "}
              <span className="num">{expired}</span> already expired
            </span>
          )}
        </Link>
        {(soonOnly || onlyClient) && (
          <Link
            href="/practice/dsc"
            className="text-13 text-ink-muted underline underline-offset-4"
          >
            {onlyClient ? "Show the whole register" : `Show all ${total}`}
          </Link>
        )}
      </div>

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

      {adding && (
        <Form
          clients={clients}
          pending={pending}
          onSubmit={(formData) => run(() => addDsc(null, formData))}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <caption className="sr-only">
            Digital signature certificates, soonest to expire first
          </caption>
          <thead>
            <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th scope="col" className="px-3 py-2 font-medium">
                Whose
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Client
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Class
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Expires
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Where it is
              </th>
              {mayEdit && (
                <th scope="col" className="px-3 py-2 font-medium">
                  &nbsp;
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2">
                  <span className="font-medium">{row.holderName}</span>
                  {row.holderRole && (
                    <span className="text-13 text-ink-muted block">
                      {row.holderRole}
                    </span>
                  )}
                </td>
                <td className="text-13 px-3 py-2">
                  <Link
                    href={`/clients/${row.clientId}`}
                    className="underline underline-offset-4"
                  >
                    {row.client}
                  </Link>
                </td>
                <td className="text-13 px-3 py-2">
                  {row.certClass || "—"}
                  {row.issuer && (
                    <span className="text-ink-muted block">{row.issuer}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="num font-mono">{row.validTill}</span>
                  <span className={`text-13 block ${TONE[row.state]}`}>
                    {row.stateLabel}
                  </span>
                </td>
                <td className="text-13 px-3 py-2">{row.heldByLabel}</td>
                {mayEdit && (
                  <td className="text-13 px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing(editing === row.id ? null : row.id)
                        }
                        className="underline underline-offset-4"
                      >
                        {editing === row.id ? "Close" : "Edit"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => removeDsc(row.id))}
                        className="text-redpen underline underline-offset-4 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={mayEdit ? 6 : 5}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  {soonOnly
                    ? "Nothing expires in the next 30 days."
                    : "No certificates on the register yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Form
          clients={clients}
          row={rows.find((row) => row.id === editing)}
          pending={pending}
          onSubmit={(formData) => run(() => updateDsc(editing, formData))}
          onCancel={() => setEditing(null)}
        />
      )}

      <p className="text-13 text-ink-muted max-w-[62ch]">
        A certificate&rsquo;s PIN is never recorded here. It is a credential,
        and credentials live in the client&rsquo;s own vault where every reveal
        is logged.
      </p>
    </div>
  );
}

function Form({ clients, row, pending, onSubmit, onCancel }) {
  return (
    <form
      action={onSubmit}
      className="rounded-ledger border-carbon bg-surface grid gap-4 border p-4 sm:grid-cols-2"
    >
      <h2 className="font-display text-20 sm:col-span-2">
        {row ? `${row.holderName}'s certificate` : "A certificate"}
      </h2>

      {row ? (
        <input type="hidden" name="clientId" value={row.clientId} />
      ) : (
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-13 text-ink-muted font-medium">Client</span>
          <select
            name="clientId"
            required
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">Choose a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <Field
        label="Whose certificate"
        name="holderName"
        defaultValue={row?.holderName}
        required
        hint="The person it was issued to, not the company"
      />
      <Field
        label="Their role"
        name="holderRole"
        defaultValue={row?.holderRole}
        placeholder="Director, Partner, Authorised signatory"
      />

      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">Class</span>
        <select
          name="certClass"
          defaultValue={row?.certClass ?? "Class 3"}
          className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
        >
          <option value="">Not recorded</option>
          {DSC_CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Certifying authority"
        name="issuer"
        defaultValue={row?.issuer}
        placeholder="eMudhra, Sify, Capricorn…"
      />

      <Field
        label="Valid from"
        name="validFrom"
        type="date"
        defaultValue={row?.validFromInput}
      />
      <Field
        label="Expires"
        name="validTill"
        type="date"
        defaultValue={row?.validTillInput}
        required
      />

      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">Where it is</span>
        <select
          name="heldBy"
          defaultValue={row?.heldBy ?? "client"}
          className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
        >
          {DSC_HOLDERS.map((who) => (
            <option key={who} value={who}>
              {DSC_HOLDER_LABELS[who]}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Token serial"
        name="serial"
        defaultValue={row?.serial}
        inputClassName="font-mono"
      />

      <Field
        label="Note"
        name="note"
        defaultValue={row?.note}
        className="sm:col-span-2"
      />

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-ledger bg-carbon text-14 h-10 px-4 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : row ? "Save changes" : "Add to the register"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-14 text-ink-muted underline underline-offset-4"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, className = "", inputClassName = "", ...rest }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        {...rest}
        className={`rounded-ledger border-rule bg-paper text-14 h-10 border px-2 ${inputClassName}`}
      />
      {hint && <span className="text-12 text-ink-muted">{hint}</span>}
    </label>
  );
}
