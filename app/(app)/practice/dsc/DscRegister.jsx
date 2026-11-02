"use client";

import { saving } from "@/lib/forms/saving";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  DSC_CLASSES,
  DSC_HOLDERS,
  DSC_HOLDER_LABELS,
} from "@/lib/practice/dsc";
import PageHead from "@/components/ui/PageHead";
import Panel from "@/components/ui/Panel";
import Chip from "@/components/ui/Chip";
import StatTile from "@/components/ui/StatTile";
import SearchBox, { matches } from "@/components/ui/SearchBox";
import { Result } from "@/components/ui/Notice";
import RegisterTabs from "@/components/practice/RegisterTabs";
import { addDsc, removeDsc, updateDsc } from "./actions";

/**
 * The DSC register.
 *
 * One table, sorted by what expires first, with only the rows that need
 * attention marked — a chip on every row would mean a register with no
 * signal in it, so a certificate with eleven months left says so in grey
 * and nothing more. The two figures at the top are the only ones anybody
 * asks for, and both are links, because a count you cannot open is a nag.
 */

/** Only the states worth a mark get one; "valid" is deliberately quiet. */
const TONE = { expired: "late", today: "late", soon: "soon" };

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
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(work) {
    const answer = work();
    startTransition(async () => {
      const result = await answer;
      setMessage(result);
      if (result?.ok) {
        setAdding(false);
        setEditing(null);
      }
    });
    // the answer goes back to the caller: a form clears itself only on a save
    return answer;
  }

  const visible = useMemo(
    () =>
      rows.filter((row) =>
        matches(
          [
            row.holderName,
            row.holderRole,
            row.client,
            row.certClass,
            row.issuer,
            row.serial,
          ],
          query,
        ),
      ),
    [rows, query],
  );

  const attention = expiring + expired;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <PageHead
        title="DSC register"
        sub="Whose digital signature certificate expires when, soonest first. The firm does not hold clients’ tokens — this is the date, so nobody is caught out mid-filing."
      >
        <RegisterTabs current="dsc" />
        {mayEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium"
          >
            {adding ? "Cancel" : "Add a certificate"}
          </button>
        )}
      </PageHead>

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <StatTile
          label="Needs attention"
          value={attention}
          href={
            onlyClient
              ? `/practice/dsc?soon=1&client=${onlyClient}`
              : "/practice/dsc?soon=1"
          }
          tone={expired > 0 ? "late" : "soon"}
          selected={soonOnly}
          note={
            attention === 0
              ? "Nothing lapses in the next 30 days"
              : `${expired} already expired · ${expiring} within 30 days`
          }
        />
        <StatTile
          label="On the register"
          value={total}
          href={onlyClient ? `/practice/dsc?client=${onlyClient}` : "/practice/dsc"}
          tone="plain"
          selected={!soonOnly}
          note={
            onlyClient ? "This client only" : "Every certificate the firm knows of"
          }
        />
      </div>

      {(soonOnly || onlyClient) && (
        <p className="text-13">
          <Link
            href="/practice/dsc"
            className="text-ink-muted underline-offset-4 hover:underline"
          >
            {onlyClient
              ? "Show the whole register"
              : `Show all ${total} certificates`}
          </Link>
        </p>
      )}

      <Result message={message} />

      {adding && (
        <Form
          clients={clients}
          pending={pending}
          onSubmit={(formData) => run(() => addDsc(null, formData))}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-13 text-ink-muted">
          {soonOnly
            ? "Expiring within 30 days, and anything already lapsed."
            : "Soonest to expire first."}
        </p>
        <span className="flex items-center gap-3">
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search this register"
          />
          <span className="num text-12 text-ink-muted shrink-0">
            {visible.length === rows.length
              ? `${rows.length} shown`
              : `${visible.length} of ${rows.length}`}
          </span>
        </span>
      </div>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <caption className="sr-only">
            Digital signature certificates, soonest to expire first
          </caption>
          <thead>
            <tr className="border-rule text-12 text-faint bg-sunk border-b text-left font-normal">
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
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                className="border-rule hover:bg-carbon-wash/60 border-b align-top last:border-0"
              >
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
                    className="underline-offset-4 hover:underline"
                  >
                    {row.client}
                  </Link>
                </td>
                <td className="text-13 px-3 py-2">
                  {row.certClass || "—"}
                  {row.issuer && (
                    <span className="text-ink-muted block">{row.issuer}</span>
                  )}
                  {row.serial && (
                    <span className="text-12 text-ink-muted block font-mono">
                      {row.serial}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="num block font-mono">{row.validTill}</span>
                  {TONE[row.state] ? (
                    <Chip tone={TONE[row.state]} className="mt-1 inline-block">
                      {row.stateLabel}
                    </Chip>
                  ) : (
                    <span className="text-12 text-ink-muted">
                      {row.stateLabel}
                    </span>
                  )}
                </td>
                <td className="text-13 px-3 py-2">
                  {row.heldByLabel}
                  {row.note && (
                    <span className="text-12 text-ink-muted block max-w-[32ch]">
                      {row.note}
                    </span>
                  )}
                </td>
                {mayEdit && (
                  <td className="text-13 px-3 py-2">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing(editing === row.id ? null : row.id)
                        }
                        className="underline-offset-4 hover:underline"
                      >
                        {editing === row.id ? "Close" : "Edit"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => removeDsc(row.id))}
                        className="text-redpen underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={mayEdit ? 6 : 5}
                  className="text-14 text-ink-muted px-3 py-10 text-center"
                >
                  {rows.length === 0
                    ? soonOnly
                      ? "Nothing expires in the next 30 days."
                      : "No certificates on the register yet."
                    : `Nothing here matches “${query.trim()}”.`}
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
        and credentials live in the{" "}
        <Link
          href="/registers/vault"
          className="underline underline-offset-4"
        >
          logins vault
        </Link>
        , where every reveal is logged.
      </p>
    </div>
  );
}

function Form({ clients, row, pending, onSubmit, onCancel }) {
  return (
    <Panel
      title={row ? `${row.holderName}’s certificate` : "A certificate"}
      hint="Dates only — the firm holds no tokens"
      className="border-carbon"
    >
      <form onSubmit={saving(onSubmit)} className="grid gap-4 sm:grid-cols-2">
        {row ? (
          <input type="hidden" name="clientId" value={row.clientId} />
        ) : (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-13 text-ink-muted font-medium">Client</span>
            <select
              name="clientId"
              required
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
          <span className="text-13 text-ink-muted font-medium">
            Where it is
          </span>
          <select
            name="heldBy"
            defaultValue={row?.heldBy ?? "client"}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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

        <div className="flex items-center gap-4 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : row ? "Save changes" : "Add to the register"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-14 text-ink-muted underline-offset-4 hover:underline"
          >
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Field({ label, hint, className = "", inputClassName = "", ...rest }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        {...rest}
        className={`rounded-control border-rule bg-paper text-14 h-10 border px-2 ${inputClassName}`}
      />
      {hint && <span className="text-12 text-ink-muted">{hint}</span>}
    </label>
  );
}
