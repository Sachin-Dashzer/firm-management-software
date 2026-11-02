"use client";

import { saving } from "@/lib/forms/saving";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import Panel from "@/components/ui/Panel";
import Chip from "@/components/ui/Chip";
import Segmented from "@/components/ui/Segmented";
import FilterChip from "@/components/ui/FilterChip";
import SearchBox, { matches } from "@/components/ui/SearchBox";
import Notice, { Result } from "@/components/ui/Notice";
import RegisterTabs from "@/components/practice/RegisterTabs";
import DocumentList from "@/components/documents/DocumentList";
import Uploader from "@/components/documents/Uploader";
import { recordUdin, setUdinRevoked } from "./actions";
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
 *
 * The three questions this screen is actually opened with are *what did we
 * sign*, *who signed it* and *has it been billed*, so each is a column or a
 * chip rather than something to work out: the year chooses the rows, the
 * chips narrow them to the ones that need doing something about, and the
 * search box is for the one number somebody is holding a letter about.
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
  const [only, setOnly] = useState("all");
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
        setRevoking(null);
        setReason("");
      }
    });
    // the answer goes back to the caller: a form clears itself only on a save
    return answer;
  }

  const live = rows.filter((row) => !row.revoked);
  const unbilled = live.filter((row) => row.billed === "unbilled");
  const revoked = rows.length - live.length;

  const visible = useMemo(() => {
    const group =
      only === "unbilled"
        ? unbilled
        : only === "revoked"
          ? rows.filter((row) => row.revoked)
          : rows;
    return group.filter((row) =>
      matches(
        [
          row.udin,
          row.client,
          row.documentType,
          row.member,
          row.membershipNo,
          row.engagement,
          row.invoiceNumber,
        ],
        query,
      ),
    );
  }, [rows, unbilled, only, query]);

  const columns = mayEdit ? 8 : 7;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <PageHead
        title="UDIN register"
        sub={
          <>
            {live.length} {live.length === 1 ? "number" : "numbers"} signed in{" "}
            {fyStart}–{String(fyStart + 1).slice(2)}
            {revoked > 0 ? `, and ${revoked} revoked` : ""}. A UDIN is
            generated on the ICAI&rsquo;s portal against a member&rsquo;s own
            membership; this is the firm&rsquo;s record of what was generated.
          </>
        }
      >
        <RegisterTabs current="udin" />
        {mayEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium"
          >
            {adding ? "Cancel" : "Record a UDIN"}
          </button>
        )}
      </PageHead>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Segmented
          label="Financial year"
          value={String(fyStart)}
          items={years.map((year) => ({
            key: String(year),
            label: `${year}–${String(year + 1).slice(2)}`,
            href: `/practice/udin?fy=${year}${member ? `&member=${member}` : ""}`,
          }))}
        />

        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="fy" value={fyStart} />
          <label className="flex min-w-52 flex-col gap-1">
            <span className="text-12 text-ink-muted font-medium">
              Signed by
            </span>
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
            className="rounded-control border-rule bg-sunk text-14 text-ink h-9 border px-3 font-medium"
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
        </form>
      </div>

      <Result message={message} />

      {adding && (
        <Panel
          title="Record a UDIN"
          hint="The number comes from the portal; nothing here generates one"
          className="border-carbon"
        >
          <form
            onSubmit={saving((formData) =>
              run(() => recordUdin(null, formData)),
            )}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-13 text-ink-muted font-medium">UDIN</span>
              <input
                name="udin"
                required
                maxLength={18}
                placeholder="18 letters and digits, from the portal"
                className="rounded-control border-rule bg-paper text-16 h-10 border px-2 font-mono tracking-[0.08em] uppercase"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">
                Client
              </span>
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
                A UDIN belongs to the member who generated it, and a
                certificate is only approved once a partner or CA is named
                against it.
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
                this in for you — that is the usual way round, and it is also
                what lets this register say whether the work was billed.
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
        </Panel>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            on={only === "all"}
            onClick={() => setOnly("all")}
            count={rows.length}
          >
            All
          </FilterChip>
          <FilterChip
            on={only === "unbilled"}
            onClick={() => setOnly("unbilled")}
            count={unbilled.length}
          >
            Unbilled
          </FilterChip>
          <FilterChip
            on={only === "revoked"}
            onClick={() => setOnly("revoked")}
            count={revoked}
          >
            Revoked
          </FilterChip>
          {!member && <PerMember rows={rows} />}
        </div>

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
            UDINs generated in {fyStart}–{String(fyStart + 1).slice(2)}
          </caption>
          <thead>
            <tr className="border-rule text-12 text-faint bg-sunk border-b text-left font-normal">
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
                Billed
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Papers
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
              <Fragment key={row.id}>
                <tr className="border-rule hover:bg-carbon-wash/60 border-b align-top last:border-0">
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
                      className="underline-offset-4 hover:underline"
                    >
                      {row.client}
                    </Link>
                  </td>
                  <td className="text-13 px-3 py-2">
                    <span className="block max-w-[28ch]">
                      {row.documentType}
                    </span>
                    {row.engagement && (
                      <Link
                        href={`/engagements/${row.engagementId}`}
                        className="text-12 text-ink-muted block underline-offset-4 hover:underline"
                      >
                        {row.engagement}
                      </Link>
                    )}
                    {row.note && (
                      <span className="text-12 text-ink-muted block max-w-[28ch]">
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
                  <td className="px-3 py-2">
                    <Billed row={row} />
                  </td>
                  <td className="text-13 px-3 py-2">
                    <button
                      type="button"
                      aria-expanded={open === row.id}
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                      className="underline-offset-4 hover:underline"
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
                          className="underline-offset-4 hover:underline disabled:opacity-50"
                        >
                          Lift
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setRevoking(revoking === row.id ? null : row.id)
                          }
                          className="text-redpen underline-offset-4 hover:underline"
                        >
                          Revoked?
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {open === row.id && (
                  <tr className="border-rule bg-carbon-wash border-b">
                    <td colSpan={columns} className="px-3 py-3">
                      <Papers row={row} mayUpload={mayUpload} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={columns}
                  className="text-14 text-ink-muted px-3 py-10 text-center"
                >
                  {rows.length === 0
                    ? "Nothing was signed in this year, or nothing has been recorded yet."
                    : query.trim()
                      ? `Nothing here matches “${query.trim()}”.`
                      : only === "unbilled"
                        ? "Every number this year sits on billed work."
                        : "Nothing was revoked this year."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {revoking && (
        <Notice tone="bad" title="Why was it revoked?">
          <div className="mt-1 flex flex-wrap items-end gap-3">
            <label className="flex min-w-60 flex-1 flex-col gap-1">
              <span className="sr-only">The reason</span>
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
              className="text-14 text-ink-muted h-10 underline-offset-4 hover:underline"
            >
              Cancel
            </button>
          </div>
        </Notice>
      )}
    </div>
  );
}

/**
 * Whether the work behind a number has been billed.
 *
 * Read off the invoices (see the page), not off a tick box: `billed` means
 * an issued invoice carries this engagement, `unbilled` means none does, and
 * a certificate issued outside any engagement has nothing to trace — which
 * is said plainly rather than counted as either.
 */
function Billed({ row }) {
  if (row.billed === "billed") {
    return (
      <span className="flex flex-col gap-1">
        <Chip tone="good">Billed</Chip>
        {row.invoiceNumber && (
          <span className="num text-12 text-ink-muted font-mono">
            {row.invoiceNumber}
          </span>
        )}
      </span>
    );
  }

  if (row.billed === "unbilled") {
    return <Chip tone="soon">Unbilled</Chip>;
  }

  return (
    <span
      className="text-13 text-ink-muted"
      title="Not tied to an engagement, so there is nothing to trace an invoice against"
    >
      No engagement
    </span>
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
    <p className="text-12 text-ink-muted ml-1">
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
            /* the usual thing attached here is the certificate the firm
               signed, so the type starts on ours rather than the client's */
            origin="firm"
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
