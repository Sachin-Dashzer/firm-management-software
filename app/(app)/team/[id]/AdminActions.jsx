"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ROLE_LABELS, ROLES } from "@/lib/permissions";
import {
  changeRole,
  reset2FA,
  resetPassword,
  setUserActive,
  updateTeamMember,
} from "../actions";

/**
 * The things only a partner can do to somebody else's account.
 *
 * Each one is its own small form or button rather than one big save, because
 * they are different decisions with different consequences — a role change
 * can strand work, a password reset locks somebody out of their own account
 * until they are told the new one — and each is audited as its own action
 * (spec section 11).
 */
export default function AdminActions({
  userId,
  name,
  role,
  active,
  deleted,
  twoFactorOn,
  openWork,
  branches,
  seniors,
  current,
}) {
  const [message, setMessage] = useState(null);
  const [wantRole, setWantRole] = useState(role);
  const [pending, startTransition] = useTransition();

  function run(work) {
    startTransition(async () => setMessage(await work()));
  }

  const first = name.split(" ")[0];

  if (deleted) {
    return (
      <div className="rounded-ledger border-rule bg-surface border p-6">
        <p className="text-14">
          {name} has been offboarded. Their record, their work and their history
          stay exactly as they are; nothing here can be changed.
        </p>
        <p className="text-13 text-ink-muted mt-2">
          Their email address can be used for somebody new, because the
          uniqueness rule only applies to people still here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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

      {/* --- offices, senior, capacity, skills --- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-4 border p-4">
        <h2 className="font-display text-20">Where they work</h2>
        <form
          action={(formData) => run(() => updateTeamMember(userId, formData))}
          className="flex flex-col gap-4"
        >
          <fieldset className="flex flex-col gap-1">
            <legend className="text-13 text-ink-muted">Offices</legend>
            <div className="flex flex-wrap gap-3 pt-1">
              {branches.map((b) => (
                <label key={b.id} className="text-14 flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="branchIds"
                    value={b.id}
                    defaultChecked={current.branchIds.includes(b.id)}
                    className="accent-carbon"
                  />
                  <span>
                    {b.code} <span className="text-ink-muted">({b.name})</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Reporting CA</span>
              <select
                name="reportingTo"
                defaultValue={current.reportingTo}
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              >
                <option value="">— none —</option>
                {seniors
                  .filter((s) => s.id !== userId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {ROLE_LABELS[s.role]}
                    </option>
                  ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">
                Capacity (hours a day)
              </span>
              <input
                type="number"
                name="capacityHours"
                min={0}
                max={24}
                defaultValue={current.capacityHours}
                className="rounded-ledger border-rule bg-paper text-14 h-9 w-24 border px-2 font-mono"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted">
              What they can handle — commas between
            </span>
            <input
              name="skills"
              defaultValue={current.skills}
              placeholder="GST returns, TDS returns, Bookkeeping"
              className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="rounded-ledger bg-carbon text-surface text-14 h-9 self-start px-4 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      </section>

      {/* --- role --- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <h2 className="font-display text-20">Role</h2>
        <p className="text-13 text-ink-muted max-w-[62ch]">
          A demotion is refused while {first} is still on work the new role
          could not do or review — the engagements are named, so they can be
          reassigned first rather than left for nobody to touch.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted">Role</span>
            <select
              value={wantRole}
              onChange={(e) => setWantRole(e.target.value)}
              className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || wantRole === role}
            onClick={() => run(() => changeRole(userId, wantRole))}
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-50"
          >
            Change role
          </button>
        </div>
      </section>

      {/* --- signing in --- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <h2 className="font-display text-20">Signing in</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => resetPassword(userId))}
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-50"
          >
            Issue a new one-time password
          </button>
          <button
            type="button"
            disabled={pending || !twoFactorOn}
            onClick={() => run(() => reset2FA(userId))}
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-50"
          >
            Clear two-factor
          </button>
        </div>
        <p className="text-13 text-ink-muted max-w-[62ch]">
          A new one-time password stops the old one working at once, and {first}{" "}
          has to replace it before they can reach anything. Clearing two-factor
          is for a lost or replaced phone; they scan a new code at their next
          sign-in.
        </p>
      </section>

      {/* --- leaving --- */}
      <section className="rounded-ledger border-redpen bg-surface flex flex-col gap-3 border p-4">
        <h2 className="font-display text-20">Leaving the firm</h2>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setUserActive(userId, !active))}
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-50"
          >
            {active ? "Deactivate the account" : "Activate the account"}
          </button>
          <span className="text-13 text-ink-muted">
            {active
              ? "Takes effect on their next request, not in half an hour."
              : "They cannot sign in at the moment."}
          </span>
        </div>

        <div className="border-rule flex flex-col gap-2 border-t pt-3">
          <p className="text-14">
            Offboarding deactivates the account, revokes every grant and soft
            deletes the record. Their work, their authorship and their history
            all stay.
          </p>
          {openWork > 0 ? (
            <p className="text-13 text-waiting">
              {first} is still on {openWork} open{" "}
              {openWork === 1 ? "engagement" : "engagements"}. Reassign those
              first — the wizard will not finish until they are clear.
            </p>
          ) : (
            <p className="text-13 text-ink-muted">
              No open work is theirs, so offboarding can go through.
            </p>
          )}
          <Link
            href={`/team/${userId}/offboard`}
            className="rounded-ledger border-redpen text-redpen text-14 h-9 self-start border px-3 leading-9"
          >
            Offboard {first}
          </Link>
        </div>
      </section>
    </div>
  );
}
