"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SECTIONS, SECTION_LABELS, capSections } from "@/lib/access/sections";
import { grantAccess, revokeAccess } from "./access";

/**
 * Who can see this client, and the drawer for deciding it (owner decision
 * D3, 19-10-2026).
 *
 * The tick boxes above a person's ceiling are disabled and say why, using the
 * same `capSections` the server action calls — so the form cannot offer
 * something the server would then refuse, and the refusal reads the same in
 * both places.
 *
 * "Who works on this client" sits above it, derived from the engagements:
 * being on the work is the commonest way into a file, so the two belong on
 * one screen. The client's own portal accounts are the last piece and arrive
 * with `ClientUser` in P2-9a.
 */
export default function TeamAccess({
  clientId,
  mayEdit,
  grants,
  team,
  workers = [],
}) {
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const person = team.find((p) => p.id === userId) ?? null;
  const ceiling = person
    ? capSections(person.role, SECTIONS)
    : { allowed: [], refused: [] };
  const refusedWhy = new Map(ceiling.refused.map((r) => [r.section, r.why]));

  function run(work) {
    startTransition(async () => {
      const result = await work();
      setMessage(result);
      if (result?.ok) {
        setAdding(false);
        setUserId("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-15 font-semibold">
          Who works on this client
        </h2>
        <p className="text-13 text-ink-muted max-w-[62ch]">
          Taken from the open engagements, so it is right by the time you read
          it: handing work over is what changes this list.
        </p>

        <div className="rounded-ledger border-rule bg-surface border">
          <table className="text-14 w-full">
            <caption className="sr-only">
              The people on this client&rsquo;s open work
            </caption>
            <thead>
              <tr className="border-rule text-13 text-ink-muted border-b text-left">
                <th scope="col" className="px-3 py-2 font-normal">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  On this client
                </th>
                <th scope="col" className="px-3 py-2 text-right font-normal">
                  Doing
                </th>
                <th scope="col" className="px-3 py-2 text-right font-normal">
                  Reviewing
                </th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr
                  key={worker.id}
                  className="border-rule border-b last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/team/${worker.id}`}
                      className="underline underline-offset-4"
                    >
                      {worker.name}
                    </Link>
                    <span className="text-13 text-ink-muted block">
                      {worker.roleLabel}
                    </span>
                  </td>
                  <td className="text-13 px-3 py-2">
                    {worker.title || "On the work"}
                  </td>
                  <td className="num text-13 px-3 py-2 text-right">
                    {worker.doing || "—"}
                  </td>
                  <td className="num text-13 px-3 py-2 text-right">
                    {worker.reviewing || "—"}
                  </td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-14 text-ink-muted px-3 py-6">
                    Nobody is on this client: no open work, and no client
                    partner or relationship manager named on the profile.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-15 font-semibold">
            Access to this client
          </h2>
          {mayEdit && (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="text-13 underline underline-offset-4"
            >
              {adding ? "Cancel" : "Give someone access"}
            </button>
          )}
        </div>

        <p className="text-13 text-ink-muted max-w-[62ch]">
          A Partner and the client&rsquo;s own CA see this file through their
          role. Anybody else sees it because they are on the work, or because
          somebody here decided they should.
        </p>

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
            action={(formData) => run(() => grantAccess(clientId, formData))}
            className="rounded-ledger border-rule bg-surface flex flex-col gap-4 border p-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Who</span>
              <select
                name="userId"
                required
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              >
                <option value="">Choose a person</option>
                {team.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.roleLabel}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-13 text-ink-muted">
                What they may see
              </legend>
              {!person && (
                <p className="text-13 text-ink-muted">
                  Choose a person first — what can be granted depends on their
                  role.
                </p>
              )}
              {person &&
                SECTIONS.map((section) => {
                  const why = refusedWhy.get(section);
                  return (
                    <label
                      key={section}
                      className={`text-14 flex items-start gap-2 ${
                        why ? "text-ink-muted" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        name={section}
                        disabled={Boolean(why)}
                        className="accent-carbon mt-1"
                      />
                      <span>
                        {SECTION_LABELS[section]}
                        {why && (
                          <span className="text-13 text-ink-muted block">
                            {why}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
            </fieldset>

            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">
                Why they need it — shown on every access review
              </span>
              <input
                name="reason"
                required
                maxLength={300}
                placeholder="Covering the GST filings while Ankit is on exam leave"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">
                Until (optional — it stops working on its own)
              </span>
              <input
                type="date"
                name="expiresAt"
                className="rounded-control border-rule bg-paper text-14 h-9 w-48 border px-2"
              />
            </label>

            <button
              type="submit"
              disabled={pending || !person}
              className="rounded-control bg-carbon text-surface text-14 h-9 self-start px-4 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Give access"}
            </button>
          </form>
        )}

        <div className="rounded-table border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <caption className="sr-only">
              People given access to this client
            </caption>
            <thead>
              <tr className="border-rule text-13 text-ink-muted border-b text-left">
                <th scope="col" className="px-3 py-2 font-normal">
                  Person
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Sections
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Until
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Reason
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Given by
                </th>
                {mayEdit && <th scope="col" className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <tr
                  key={grant.id}
                  className="border-rule border-b align-top last:border-0"
                >
                  <td className="px-3 py-2">
                    {grant.name}
                    <span className="text-13 text-ink-muted block">
                      {grant.roleLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {grant.sections
                      .map((s) => SECTION_LABELS[s] ?? s)
                      .join(", ")}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {grant.revoked ? (
                      <span className="text-ink-muted">
                        revoked {grant.revokedAt}
                      </span>
                    ) : grant.expired ? (
                      <span className="text-redpen">
                        lapsed {grant.expiresAt}
                      </span>
                    ) : (
                      (grant.expiresAt ?? "—")
                    )}
                  </td>
                  <td className="px-3 py-2">{grant.reason}</td>
                  <td className="px-3 py-2">
                    {grant.grantedByName || "—"}
                    <span className="text-13 text-ink-muted block">
                      {grant.grantedAt}
                    </span>
                  </td>
                  {mayEdit && (
                    <td className="px-3 py-2 text-right">
                      {!grant.revoked && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() => revokeAccess(clientId, grant.id))
                          }
                          className="text-13 text-redpen underline underline-offset-4 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {grants.length === 0 && (
                <tr>
                  <td
                    colSpan={mayEdit ? 6 : 5}
                    className="text-14 text-ink-muted px-3 py-6"
                  >
                    Nobody has been given access to this client. The people on
                    its work can already see the file, the engagements and the
                    documents.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
