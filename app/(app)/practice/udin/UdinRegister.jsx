"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { recordUdin, setUdinRevoked } from "./actions";
import DocumentList from "@/components/documents/DocumentList";
import Uploader from "@/components/documents/Uploader";
import {
  documentsForUdin,
  documentsForEngagement,
} from "../../documents/actions";

/**
 * The UDIN register.
 *
 * Numbers in mono (spec section 15: codes line up and are easy to read
 * aloud), newest first, a revoked row struck through rather than hidden —
 * what the firm signed and later withdrew is exactly what somebody reading
 * an old file needs to see.
 */
export default function UdinRegister({
  rows,
  fyStart,
  years,
  mayEdit,
  mayUpload,
  clients,
  members,
  member,
}) {
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(work) {
    startTransition(async () => {
      const result = await work();
      setMessage(result);
      if (result?.ok) {
        setAdding(false);
        setRevoking(null);
        setReason("");
      }
    });
  }

  const live = rows.filter((row) => !row.revoked).length;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            UDIN register
          </h1>
          <p className="num text-13 text-ink-muted">
            {live} {live === 1 ? "number" : "numbers"} in {fyStart}–
            {String(fyStart + 1).slice(2)}
            {rows.length - live > 0
              ? `, and ${rows.length - live} revoked`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {years.map((year) => (
            <Link
              key={year}
              href={`/practice/udin?fy=${year}`}
              aria-current={year === fyStart ? "page" : undefined}
              className={`rounded-control text-13 h-8 border px-2 leading-8 ${
                year === fyStart
                  ? "border-carbon bg-carbon-wash text-carbon"
                  : "border-rule hover:bg-carbon-wash"
              }`}
            >
              {year}–{String(year + 1).slice(2)}
            </Link>
          ))}
          {mayEdit && (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium"
            >
              {adding ? "Cancel" : "Record a UDIN"}
            </button>
          )}
        </div>
      </div>

      <p className="text-13 text-ink-muted max-w-[72ch]">
        A UDIN is generated on the ICAI&rsquo;s portal against a member&rsquo;s
        own membership. Nothing here generates one — this is the firm&rsquo;s
        record of what was generated, and the same number cannot be recorded
        twice. Every entry names the CA or partner who signed it.
      </p>

      <form
        method="get"
        className="rounded-ledger border-rule bg-surface flex flex-wrap items-end gap-3 border p-3"
      >
        <input type="hidden" name="fy" value={fyStart} />
        <label className="flex min-w-60 flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Signed by</span>
          <select
            name="member"
            defaultValue={member}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          >
            <option value="">Every partner and CA</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.role}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium"
        >
          Show
        </button>
        {member && (
          <Link
            href={`/practice/udin?fy=${fyStart}`}
            className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Everyone
          </Link>
        )}
        {!member && <PerMember rows={rows} />}
      </form>

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
        <form
          action={(formData) => run(() => recordUdin(null, formData))}
          className="rounded-ledger border-carbon bg-surface grid gap-4 border p-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-13 text-ink-muted font-medium">UDIN</span>
            <input
              name="udin"
              required
              maxLength={18}
              placeholder="18 letters and digits, from the portal"
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2 font-mono uppercase"
            />
          </label>

          <label className="flex flex-col gap-1">
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

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Signed by <span className="text-redpen">*</span>
            </span>
            <select
              name="memberId"
              required
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            >
              <option value="">Choose the partner or CA</option>
              {members.map((signer) => (
                <option key={signer.id} value={signer.id}>
                  {signer.label}
                </option>
              ))}
            </select>
            <span className="text-12 text-ink-muted">
              A UDIN belongs to the member who generated it, and a certificate
              is only approved once a partner or CA is named against it.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              What was signed
            </span>
            <input
              name="documentType"
              required
              maxLength={120}
              placeholder="Tax audit report, net worth certificate…"
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Generated on
            </span>
            <input
              type="date"
              name="generatedOn"
              required
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-13 text-ink-muted font-medium">
              Engagement id, if it belongs to one
            </span>
            <input
              name="engagementId"
              placeholder="Leave blank for a certificate outside any engagement"
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2 font-mono"
            />
            <span className="text-12 text-ink-muted">
              Saving a UDIN on the engagement&rsquo;s own filing panel fills
              this in for you — that is the usual way round.
            </span>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-13 text-ink-muted font-medium">Note</span>
            <input
              name="note"
              maxLength={500}
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
            >
              {pending ? "Recording…" : "Record it"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <caption className="sr-only">
            UDINs generated in {fyStart}–{String(fyStart + 1).slice(2)}
          </caption>
          <thead>
            <tr className="border-rule bg-sunk text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th scope="col" className="px-3 py-2 font-medium">
                UDIN
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Client
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                What was signed
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                By
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                On
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Papers
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
              <Fragment key={row.id}>
                <tr className="border-rule border-b last:border-0">
                  <td className="px-3 py-2">
                    <span
                      className={`text-13 font-mono ${
                        row.revoked ? "text-ink-muted line-through" : ""
                      }`}
                    >
                      {row.udin}
                    </span>
                    {row.revoked && (
                      <span className="text-12 text-redpen block">
                        Revoked {row.revokedOn}
                        {row.revokeReason ? ` · ${row.revokeReason}` : ""}
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
                    {row.documentType}
                    {row.engagement && (
                      <Link
                        href={`/engagements/${row.engagementId}`}
                        className="text-ink-muted block underline underline-offset-4"
                      >
                        {row.engagement}
                      </Link>
                    )}
                    {row.note && (
                      <span className="text-12 text-ink-muted block">
                        {row.note}
                      </span>
                    )}
                  </td>
                  <td className="text-13 px-3 py-2">
                    {row.member || (
                      <span className="text-ink-muted">Not recorded</span>
                    )}
                    {row.memberRole && (
                      <span className="text-12 text-ink-muted block">
                        {row.memberRole}
                      </span>
                    )}
                    {row.membershipNo && (
                      <span className="text-12 text-ink-muted block font-mono">
                        {row.membershipNo}
                      </span>
                    )}
                  </td>
                  <td className="num text-13 px-3 py-2 font-mono">
                    {row.generatedOn}
                  </td>
                  <td className="text-13 px-3 py-2">
                    <button
                      type="button"
                      aria-expanded={open === row.id}
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                      className="underline underline-offset-4"
                    >
                      {row.files === 0
                        ? "None yet"
                        : `${row.files} ${row.files === 1 ? "file" : "files"}`}
                    </button>
                  </td>
                  {mayEdit && (
                    <td className="text-13 px-3 py-2">
                      {row.revoked ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() => setUdinRevoked(row.id, false))
                          }
                          className="underline underline-offset-4 disabled:opacity-50"
                        >
                          Lift
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setRevoking(revoking === row.id ? null : row.id)
                          }
                          className="text-redpen underline underline-offset-4"
                        >
                          Revoked?
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {open === row.id && (
                  <tr className="border-rule bg-carbon-wash border-b">
                    <td colSpan={mayEdit ? 7 : 6} className="px-3 py-3">
                      <Papers row={row} mayUpload={mayUpload} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={mayEdit ? 7 : 6}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  Nothing was signed in this year, or nothing has been recorded
                  yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {revoking && (
        <div className="rounded-ledger border-redpen bg-surface flex flex-wrap items-end gap-3 border p-4">
          <label className="flex min-w-60 flex-1 flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Why was it revoked?
            </span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            />
          </label>
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => setUdinRevoked(revoking, true, reason))}
            className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-3 font-medium disabled:opacity-60"
          >
            Mark revoked
          </button>
          <button
            type="button"
            onClick={() => setRevoking(null)}
            className="text-14 text-ink-muted underline underline-offset-4"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What each partner and CA signed this year.
 *
 * Counted here rather than queried, because the register already holds the
 * year's rows — and the question is only ever asked of the year on screen.
 */
function PerMember({ rows }) {
  const tally = new Map();
  for (const row of rows) {
    if (row.revoked) continue;
    const name = row.member || "Not recorded";
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  if (tally.size === 0) return null;

  return (
    <p className="text-13 text-ink-muted flex-1 self-center">
      {[...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${name} ${count}`)
        .join(" · ")}
    </p>
  );
}

/**
 * The certificate and the client papers behind it, in one place.
 *
 * Two lists, never merged: what was attached to this UDIN, and — when it
 * came out of an engagement — that engagement's own working papers, read
 * only. Merging them would hide which file is the firm's evidence for this
 * number and which merely sits nearby.
 */
function Papers({ row, mayUpload }) {
  const [own, setOwn] = useState(null);
  const [work, setWork] = useState([]);

  const load = useCallback(() => {
    documentsForUdin(row.id).then(setOwn);
    if (row.engagementId) {
      documentsForEngagement(row.engagementId).then(setWork);
    }
  }, [row.id, row.engagementId]);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h3 className="text-13 font-medium">Attached to this UDIN</h3>
        {own === null ? (
          <p className="text-13 text-ink-muted">Reading…</p>
        ) : (
          <DocumentList
            documents={own}
            empty="Nothing attached yet — the signed certificate belongs here."
            onChange={load}
          />
        )}
        {mayUpload && (
          <Uploader
            udinId={row.id}
            clientId={row.clientId}
            label="Attach the certificate or its papers"
            onDone={load}
          />
        )}
      </div>

      {row.engagementId && (
        <div className="flex flex-col gap-2">
          <h3 className="text-13 font-medium">
            On the engagement it came from
          </h3>
          <DocumentList
            documents={work}
            empty="That engagement has no files."
          />
        </div>
      )}
    </div>
  );
}
