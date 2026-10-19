"use client";

import { useState, useTransition } from "react";
import { CPE_BASIS_LABELS } from "@/lib/firm/profile";
import { addCpe, removeCpe, saveMemberIcai } from "./actions";

/**
 * Each member's membership, and their CPE log.
 *
 * A year with a target shows how many hours are still short; a year without
 * one shows the hours and says the target is not set. **It never shows a
 * cross against an unset target** — an unanswered question is not a failure,
 * and marking it as one would have people chasing hours nobody asked for.
 */
export default function Members({ members, firm, ownOnly }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-20">
          {ownOnly ? "Your ICAI record" : "Members and their CPE"}
        </h2>
        <p className="text-13 text-ink-muted">
          A CPE year here runs{" "}
          {CPE_BASIS_LABELS[firm.cpeYearBasis]?.toLowerCase() ??
            firm.cpeYearBasis}
          .
        </p>
      </div>

      {members.length === 0 && (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
          Nobody in the firm holds a membership record yet.
        </p>
      )}

      {members.map((member) => (
        <Member key={member.id} member={member} firm={firm} />
      ))}
    </section>
  );
}

function Member({ member, firm }) {
  const [message, setMessage] = useState(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(work) {
    startTransition(async () => setMessage(await work()));
  }

  return (
    <article className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-16 font-medium">
            {member.name}
            {member.mine && (
              <span className="text-13 text-ink-muted"> · you</span>
            )}
          </h3>
          <p className="text-13 text-ink-muted">
            {member.roleLabel}
            {member.icai.grade ? ` · ${member.icai.grade}` : ""}
            {member.icai.membershipNo
              ? ` · membership ${member.icai.membershipNo}`
              : ""}
            {member.icai.copHeld
              ? ` · holds a Certificate of Practice${
                  member.icai.copFrom ? ` since ${member.icai.copFrom}` : ""
                }`
              : " · no Certificate of Practice recorded"}
          </p>
        </div>
        {member.mayEdit && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-13 underline underline-offset-4"
          >
            {open ? "Close" : "Membership and hours"}
          </button>
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

      {/* --- the position, year by year --- */}
      {member.years.length === 0 ? (
        <p className="text-13 text-ink-muted">No hours logged.</p>
      ) : (
        <table className="text-14 w-full">
          <caption className="sr-only">
            {member.name}&rsquo;s CPE hours by year
          </caption>
          <thead>
            <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th scope="col" className="py-1 font-medium">
                Year
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Structured
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Unstructured
              </th>
              <th scope="col" className="py-1 font-medium">
                Against the firm&rsquo;s target
              </th>
            </tr>
          </thead>
          <tbody>
            {member.years.map((year) => (
              <tr
                key={year.year}
                className="border-rule border-b last:border-0"
              >
                <th scope="row" className="py-1 text-left font-normal">
                  {year.year}
                </th>
                <td className="num py-1 text-right">{year.structured}</td>
                <td className="num py-1 text-right">{year.unstructured}</td>
                <td className="text-13 py-1">
                  {year.met === null ? (
                    <span className="text-ink-muted">not set</span>
                  ) : year.met ? (
                    <span className="text-filed">met</span>
                  ) : (
                    <span className="text-waiting">
                      {[
                        year.short.structured > 0 &&
                          `${year.short.structured} structured`,
                        year.short.unstructured > 0 &&
                          `${year.short.unstructured} unstructured`,
                      ]
                        .filter(Boolean)
                        .join(", ")}{" "}
                      short
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && member.mayEdit && (
        <div className="flex flex-col gap-5 pt-2">
          <form
            action={(formData) =>
              run(() => saveMemberIcai(member.id, formData))
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <h4 className="text-13 text-ink-muted font-medium sm:col-span-2">
              Membership
            </h4>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Membership number</span>
              <input
                name="membershipNo"
                defaultValue={member.icai.membershipNo}
                inputMode="numeric"
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2 font-mono"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Grade</span>
              <select
                name="grade"
                defaultValue={member.icai.grade}
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              >
                <option value="">Not recorded</option>
                <option value="ACA">ACA — Associate</option>
                <option value="FCA">FCA — Fellow</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Admitted on</span>
              <input
                type="date"
                name="admittedOn"
                defaultValue={member.icai.admittedOn}
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">
                Certificate of Practice from
              </span>
              <input
                type="date"
                name="copFrom"
                defaultValue={member.icai.copFrom}
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <label className="text-14 flex items-center gap-2">
              <input
                type="checkbox"
                name="copHeld"
                defaultChecked={member.icai.copHeld}
              />
              Holds a Certificate of Practice
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-60"
              >
                Save membership
              </button>
            </div>
          </form>

          <form
            action={(formData) => run(() => addCpe(member.id, formData))}
            className="grid gap-3 sm:grid-cols-2"
          >
            <h4 className="text-13 text-ink-muted font-medium sm:col-span-2">
              Log a programme
            </h4>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">When</span>
              <input
                type="date"
                name="on"
                required
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Hours</span>
              <input
                type="number"
                name="hours"
                min={0.5}
                max={24}
                step={0.5}
                required
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Kind</span>
              <select
                name="kind"
                defaultValue="structured"
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              >
                <option value="structured">Structured</option>
                <option value="unstructured">Unstructured</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Organiser</span>
              <input
                name="organiser"
                placeholder="e.g. NIRC of ICAI"
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-13 text-ink-muted">Programme</span>
              <input
                name="programme"
                required
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
              >
                Add to the log
              </button>
            </div>
          </form>

          {member.entries.length > 0 && (
            <div className="flex flex-col gap-1">
              <h4 className="text-13 text-ink-muted font-medium">
                Everything logged
              </h4>
              <ul className="text-13 flex flex-col">
                {member.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-rule flex flex-wrap items-baseline gap-2 border-b py-1 last:border-0"
                  >
                    <span className="num font-mono">{entry.on}</span>
                    <span className="num">{entry.hours} h</span>
                    <span className="text-ink-muted">{entry.kind}</span>
                    <span className="min-w-0 flex-1">
                      {entry.programme}
                      {entry.organiser ? ` · ${entry.organiser}` : ""}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => removeCpe(member.id, entry.id))}
                      className="text-redpen underline underline-offset-4 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
